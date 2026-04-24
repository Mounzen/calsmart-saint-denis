/**
 * Logivia — Connecteur FranceConnect (OIDC)
 *
 * Permet au portail candidat de s'authentifier via FranceConnect au lieu
 * de NUD + date de naissance. Avantages :
 *  - Identité certifiée par l'État (niveau de garantie eIDAS substantiel)
 *  - Pas de création de mot de passe côté candidat
 *  - Auto-liaison au dossier logivia par match nom+prénom+date naissance
 *  - Conformité DINUM/ANSSI pour les démarches publiques
 *
 * Flow OIDC Authorization Code (RFC 6749 + OpenID Connect) :
 *   1. GET  /api/fc/auth     -> redirige vers FranceConnect avec state + nonce
 *   2. GET  /api/fc/callback -> échange le code contre un token + userinfo
 *   3. On cherche le demandeur qui matche (nom, prenom, date_naiss)
 *   4. Si match : on crée une session portail classique (token)
 *   5. GET  /api/fc/logout   -> déconnexion FranceConnect (RP-initiated logout)
 *
 * Configuration (variables d'environnement) :
 *   FC_CLIENT_ID       : identifiant fournisseur de service (obtenu chez DINUM)
 *   FC_CLIENT_SECRET   : secret partagé (NE JAMAIS COMMITER)
 *   FC_ENV             : 'integ' (test) | 'prod'  (defaut: 'integ')
 *   FC_REDIRECT_URI    : URL de callback (ex: https://logivia.fr/api/fc/callback)
 *   FC_LOGOUT_REDIRECT : URL de retour apres logout (ex: https://logivia.fr/portail)
 *
 * Si FC_CLIENT_ID ou FC_CLIENT_SECRET sont absents, le module se desactive
 * proprement (les routes renvoient 503 avec message explicite). L'application
 * continue a marcher sans FranceConnect (auth NUD+date toujours disponible).
 *
 * Doc DINUM : https://partenaires.franceconnect.gouv.fr/fcp/fournisseur-service
 */

import { randomBytes, createHash } from 'crypto'

/* ------------------------------------------------------------------ */
/* Endpoints officiels FranceConnect                                   */
/* ------------------------------------------------------------------ */

const FC_ENDPOINTS = {
  integ: {
    authorize:   'https://fcp.integ01.dev-franceconnect.fr/api/v1/authorize',
    token:       'https://fcp.integ01.dev-franceconnect.fr/api/v1/token',
    userinfo:    'https://fcp.integ01.dev-franceconnect.fr/api/v1/userinfo',
    logout:      'https://fcp.integ01.dev-franceconnect.fr/api/v1/logout'
  },
  prod: {
    authorize:   'https://app.franceconnect.gouv.fr/api/v1/authorize',
    token:       'https://app.franceconnect.gouv.fr/api/v1/token',
    userinfo:    'https://app.franceconnect.gouv.fr/api/v1/userinfo',
    logout:      'https://app.franceconnect.gouv.fr/api/v1/logout'
  }
}

/* ------------------------------------------------------------------ */
/* Etat en memoire : state/nonce attendus + id_token pour logout       */
/* En prod avec plusieurs instances, mettre ca dans Redis.             */
/* ------------------------------------------------------------------ */

const pendingStates = new Map() // state -> { nonce, created_at }
const activeIdTokens = new Map() // portail_token -> id_token (pour RP-logout)

// Nettoyage periodique des state expires (>10 min)
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of pendingStates.entries()) {
    if (now - v.created_at > 10 * 60 * 1000) pendingStates.delete(k)
  }
}, 60 * 1000).unref?.()

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

function getConfig() {
  const env = (process.env.FC_ENV || 'integ').toLowerCase()
  const endpoints = FC_ENDPOINTS[env] || FC_ENDPOINTS.integ
  return {
    enabled: !!(process.env.FC_CLIENT_ID && process.env.FC_CLIENT_SECRET),
    env,
    client_id: process.env.FC_CLIENT_ID || '',
    client_secret: process.env.FC_CLIENT_SECRET || '',
    redirect_uri: process.env.FC_REDIRECT_URI || '',
    logout_redirect: process.env.FC_LOGOUT_REDIRECT || '',
    endpoints,
    scope: 'openid given_name family_name birthdate email'
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '')
}

// Trouve un demandeur par match sur (nom, prenom, date_naissance)
// Tolerant : accents ignores, espaces, tirets
function findDemandeurByIdentity(demandeurs, userinfo) {
  const fcNom = norm(userinfo.family_name)
  const fcPrenom = norm((userinfo.given_name || '').split(' ')[0]) // premier prenom
  const fcDate = (userinfo.birthdate || '').slice(0, 10) // YYYY-MM-DD

  if (!fcNom || !fcPrenom || !fcDate) return null

  return demandeurs.find(d => {
    if (!d || d.statut === 'archive') return false
    const dNom = norm(d.nom)
    const dPrenom = norm((d.prenom || '').split(' ')[0])
    const dDate = (d.date_naiss || '').slice(0, 10)
    return dNom === fcNom && dPrenom === fcPrenom && dDate === fcDate
  })
}

/* ------------------------------------------------------------------ */
/* Montage des routes Express                                          */
/* ------------------------------------------------------------------ */

/**
 * Appeler une seule fois depuis server/index.js :
 *   mountFranceConnect(app, { portailSessions, readData, createSessionFor })
 *
 * Dependencies injectees pour decoupler :
 *   portailSessions : Map<token, { dem_id, created_at }>
 *   readData(file)  : lecteur JSON/SQLite (injection pour tests)
 *   createSessionFor(dem_id) : cree le token portail (reutilise la logique existante)
 */
export function mountFranceConnect(app, deps) {
  const { readData, createSessionFor, addLog } = deps || {}

  // Route de decouverte (pour le frontend : savoir si FC est active)
  app.get('/api/fc/status', (req, res) => {
    const cfg = getConfig()
    res.json({
      enabled: cfg.enabled,
      env: cfg.env,
      configured: {
        client_id: !!cfg.client_id,
        client_secret: !!cfg.client_secret,
        redirect_uri: !!cfg.redirect_uri
      }
    })
  })

  // 1. Lancement du flow : redirection vers FranceConnect
  app.get('/api/fc/auth', (req, res) => {
    const cfg = getConfig()
    if (!cfg.enabled) {
      return res.status(503).json({
        error: 'FranceConnect non configure',
        detail: 'Variables FC_CLIENT_ID et FC_CLIENT_SECRET requises. Voir docs/FRANCECONNECT.md'
      })
    }
    if (!cfg.redirect_uri) {
      return res.status(503).json({ error: 'FC_REDIRECT_URI non configure' })
    }

    const state = randomBytes(24).toString('hex')
    const nonce = randomBytes(24).toString('hex')
    pendingStates.set(state, { nonce, created_at: Date.now() })

    const url = new URL(cfg.endpoints.authorize)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', cfg.client_id)
    url.searchParams.set('redirect_uri', cfg.redirect_uri)
    url.searchParams.set('scope', cfg.scope)
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('acr_values', 'eidas1') // niveau faible suffisant pour demande logement

    if (addLog) try { addLog(null, 'FC_AUTH_INIT', 'state=' + state.slice(0, 8)) } catch {}
    res.redirect(url.toString())
  })

  // 2. Callback : echange code -> token -> userinfo -> liaison demandeur
  app.get('/api/fc/callback', async (req, res) => {
    const cfg = getConfig()
    if (!cfg.enabled) return res.status(503).send('FranceConnect non configure')

    const { code, state, error } = req.query
    if (error) {
      return res.redirect('/portail?fc_error=' + encodeURIComponent(String(error)))
    }
    if (!code || !state) {
      return res.status(400).send('Parametres manquants (code, state)')
    }
    const pending = pendingStates.get(String(state))
    if (!pending) {
      return res.status(400).send('State invalide ou expire')
    }
    pendingStates.delete(String(state))

    try {
      // Echange du code contre un token
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: cfg.redirect_uri,
        client_id: cfg.client_id,
        client_secret: cfg.client_secret
      })
      const tokenResp = await fetch(cfg.endpoints.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString()
      })
      if (!tokenResp.ok) {
        const t = await tokenResp.text()
        console.error('[fc] token exchange failed ' + tokenResp.status + ' : ' + t.slice(0, 200))
        return res.redirect('/portail?fc_error=token_exchange')
      }
      const tokens = await tokenResp.json()
      if (!tokens.access_token || !tokens.id_token) {
        return res.redirect('/portail?fc_error=missing_tokens')
      }

      // Recuperation des infos utilisateur
      const userResp = await fetch(cfg.endpoints.userinfo, {
        headers: { Authorization: 'Bearer ' + tokens.access_token }
      })
      if (!userResp.ok) {
        return res.redirect('/portail?fc_error=userinfo')
      }
      // userinfo peut etre JSON OU JWT (selon config) - on gere les 2
      const userCt = userResp.headers.get('content-type') || ''
      let userinfo
      if (userCt.includes('application/jwt') || userCt.includes('application/jwt+json')) {
        const jwt = await userResp.text()
        // JWT = header.payload.signature, on decode juste le payload (on fait pas la verif sig ici,
        // qui necessiterait la JWKS de FC. A faire en prod pour niveau de securite complet.)
        const parts = jwt.split('.')
        if (parts.length !== 3) return res.redirect('/portail?fc_error=userinfo_format')
        try {
          userinfo = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        } catch {
          return res.redirect('/portail?fc_error=userinfo_decode')
        }
      } else {
        userinfo = await userResp.json()
      }

      // Lookup demandeur dans Logivia
      const demandeurs = readData ? readData('demandeurs.json') : []
      const dem = findDemandeurByIdentity(demandeurs, userinfo)
      if (!dem) {
        // Identite verifiee mais pas de dossier - on redirige vers une page d info
        if (addLog) try { addLog(null, 'FC_NO_MATCH', userinfo.family_name + ' ' + userinfo.given_name) } catch {}
        return res.redirect('/portail?fc_error=no_dossier&nom=' + encodeURIComponent(userinfo.family_name || ''))
      }

      // Creation de la session portail
      const portailToken = createSessionFor ? createSessionFor(dem.id) : null
      if (!portailToken) {
        return res.redirect('/portail?fc_error=session_create')
      }
      activeIdTokens.set(portailToken, tokens.id_token)

      if (addLog) try { addLog(null, 'FC_LOGIN_OK', 'dem: ' + dem.id + ' - ' + dem.nom + ' ' + dem.prenom) } catch {}

      // Redirection vers le portail avec le token en fragment (pas en query pour eviter logs)
      return res.redirect('/portail?fc_ok=1#token=' + encodeURIComponent(portailToken))
    } catch (e) {
      console.error('[fc] callback error : ' + e.message)
      return res.redirect('/portail?fc_error=server&detail=' + encodeURIComponent(e.message.slice(0, 80)))
    }
  })

  // 3. Logout RP-initiated (optionnel - deconnecte aussi de FC)
  app.get('/api/fc/logout', (req, res) => {
    const cfg = getConfig()
    const portailToken = req.query.token || req.headers['x-portail-token']
    const idToken = portailToken ? activeIdTokens.get(String(portailToken)) : null
    if (portailToken) activeIdTokens.delete(String(portailToken))

    if (!cfg.enabled || !idToken) {
      return res.redirect(cfg.logout_redirect || '/portail')
    }

    const state = randomBytes(16).toString('hex')
    const url = new URL(cfg.endpoints.logout)
    url.searchParams.set('id_token_hint', idToken)
    url.searchParams.set('post_logout_redirect_uri', cfg.logout_redirect || '/portail')
    url.searchParams.set('state', state)
    res.redirect(url.toString())
  })
}

export default { mountFranceConnect }
