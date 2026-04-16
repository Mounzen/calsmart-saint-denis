/**
 * CAL Smart — Serveur Express
 * Port : 4000
 * Le client React tourne sur port 3000 et proxifie /api vers ici
 */

import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { randomBytes } from 'crypto'
import {
  sendMessage, handleWebhook, saveChatId, getChatId,
  notifierAttributionElu, notifierUrgenceElu,
  notifierPropositionCandidат, notifierDecisionCAL,
  envoyerDigestHebdo, genererLienElu, genererLienCandidат,
  MSG
} from './telegram.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')
const DIST = join(__dirname, '../dist') // React build en production

const IS_PROD = process.env.NODE_ENV === 'production' || existsSync(DIST)

const app = express()

// CORS : en dev on accepte localhost:3000, en prod tout (même domaine)
app.use(cors({
  origin: IS_PROD ? true : 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())

// En production : servir les fichiers React buildés
if (IS_PROD) {
  app.use(express.static(DIST))
  console.log('[CAL Smart] Mode production — serveur les fichiers depuis dist/')
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readData(file) {
  return JSON.parse(readFileSync(join(DATA, file), 'utf8'))
}

function writeData(file, data) {
  writeFileSync(join(DATA, file), JSON.stringify(data, null, 2), 'utf8')
}

// ─── SESSIONS EN MÉMOIRE ─────────────────────────────────────────────────────
// Token simple en mémoire — suffisant pour usage interne
const SESSIONS = new Map() // token → { user, expires }
const SESSION_DURATION = 8 * 60 * 60 * 1000 // 8 heures

function createSession(user) {
  const token = randomBytes(32).toString('hex')
  SESSIONS.set(token, {
    user: { id:user.id, login:user.login, nom:user.nom, prenom:user.prenom,
      role:user.role, elu_id:user.elu_id||null, secteur:user.secteur||null },
    expires: Date.now() + SESSION_DURATION
  })
  return token
}

function getSession(token) {
  if (!token) return null
  const session = SESSIONS.get(token)
  if (!session) return null
  if (Date.now() > session.expires) { SESSIONS.delete(token); return null; }
  return session
}

// ─── MIDDLEWARE AUTH ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token']
  const session = getSession(token)
  if (!session) return res.status(401).json({ error: 'Non connecté' })
  req.user = session.user
  next()
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role))
      return res.status(403).json({ error: 'Accès refusé' })
    next()
  }
}

// ─── LOGS D'ACTIONS ──────────────────────────────────────────────────────────
function log(user, action, detail = '', type = 'info') {
  try {
    const logs = readData('logs.json')
    logs.unshift({
      id: 'LOG' + Date.now(),
      date: new Date().toLocaleDateString('fr-FR'),
      heure: new Date().toLocaleTimeString('fr-FR'),
      user_id: user?.id || 'system',
      user_nom: user ? `${user.prenom} ${user.nom}` : 'Système',
      role: user?.role || 'system',
      action,
      detail,
      type, // info | warning | error | security
    })
    // Garder seulement les 500 derniers logs
    writeData('logs.json', logs.slice(0, 500))
  } catch(e) { console.error('Log error:', e) }
}

// ─── ROUTES AUTH ─────────────────────────────────────────────────────────────

// Login
app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body
  if (!login || !password)
    return res.status(400).json({ error: 'Login et mot de passe requis' })

  const users = readData('users.json')
  const user = users.find(u => u.login === login && u.password === password && u.actif)

  if (!user) {
    log(null, 'LOGIN_ECHEC', `Tentative échouée pour : ${login}`, 'security')
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const token = createSession(user)
  log(user, 'LOGIN', `Connexion depuis ${req.ip}`, 'info')
  res.json({
    token,
    user: { id:user.id, login:user.login, nom:user.nom, prenom:user.prenom,
      role:user.role, elu_id:user.elu_id||null, secteur:user.secteur||null }
  })
})

// Vérifier session
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['x-auth-token']
  log(req.user, 'LOGOUT', '', 'info')
  SESSIONS.delete(token)
  res.json({ ok: true })
})

// Changer son mot de passe
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { ancien, nouveau } = req.body
  const users = readData('users.json')
  const idx = users.findIndex(u => u.id === req.user.id)
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' })
  if (users[idx].password !== ancien) return res.status(400).json({ error: 'Ancien mot de passe incorrect' })
  users[idx].password = nouveau
  writeData('users.json', users)
  log(req.user, 'CHANGE_PASSWORD', '', 'security')
  res.json({ ok: true })
})

// ─── GESTION UTILISATEURS (directeur seulement) ───────────────────────────────
app.get('/api/users', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  res.json(users.map(u => ({ ...u, password: '***' }))) // ne jamais renvoyer les mdp
})

app.post('/api/users', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  const newUser = {
    id: 'U' + (users.length + 1),
    ...req.body,
    created_at: new Date().toLocaleDateString('fr-FR'),
    actif: true,
  }
  users.push(newUser)
  writeData('users.json', users)
  log(req.user, 'CREATE_USER', `Créé : ${newUser.login} (${newUser.role})`, 'info')
  res.status(201).json({ ...newUser, password: '***' })
})

app.put('/api/users/:id', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  users[idx] = { ...users[idx], ...req.body, id: users[idx].id }
  writeData('users.json', users)
  log(req.user, 'UPDATE_USER', `Modifié : ${users[idx].login}`, 'info')
  res.json({ ...users[idx], password: '***' })
})

// ─── ROUTE LOGS ──────────────────────────────────────────────────────────────
app.get('/api/logs', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const logs = readData('logs.json')
  const { user_id, action, type, limit = 100 } = req.query
  let result = logs
  if (user_id) result = result.filter(l => l.user_id === user_id)
  if (action) result = result.filter(l => l.action.includes(action))
  if (type) result = result.filter(l => l.type === type)
  res.json(result.slice(0, parseInt(limit)))
})

// ─── DECISIONS CAL ───────────────────────────────────────────────────────────
app.get('/api/decisions-cal', requireAuth, (req, res) => {
  const decisions = readData('decisions_cal.json')
  const { logement_id, date_cal } = req.query
  let result = decisions
  if (logement_id) result = result.filter(d => d.logement_id === logement_id)
  if (date_cal) result = result.filter(d => d.date_cal === date_cal)
  res.json(result)
})

app.post('/api/decisions-cal', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { logement_id, logement_ref, logement_adresse, date_cal, candidats, observations } = req.body
  const decisions = readData('decisions_cal.json')

  // Une seule décision par logement par séance
  const existing = decisions.findIndex(d =>
    d.logement_id === logement_id && d.date_cal === date_cal
  )

  const decision = {
    id: 'CAL' + Date.now(),
    logement_id,
    logement_ref,
    logement_adresse,
    date_cal: date_cal || new Date().toLocaleDateString('fr-FR'),
    candidats, // [{ dem_id, nom, prenom, rang, decision, motif, score }]
    observations: observations || '',
    agent_id: req.user.id,
    agent_nom: `${req.user.prenom} ${req.user.nom}`,
    created_at: new Date().toISOString(),
    statut: 'validée',
  }

  if (existing >= 0) {
    decisions[existing] = { ...decisions[existing], ...decision, id: decisions[existing].id }
  } else {
    decisions.unshift(decision)
  }

  writeData('decisions_cal.json', decisions)

  // Mettre à jour le statut des audiences liées
  const audiences = readData('audiences.json')
  const attribue = candidats?.find(c => c.decision?.includes('Retenu rang 1'))
  if (attribue) {
    const audIdx = audiences.findIndex(a => a.dem_id === attribue.dem_id)
    if (audIdx >= 0) {
      audiences[audIdx].statut = 'Attribué'
      audiences[audIdx].quartier_attribue = logement_adresse
      writeData('audiences.json', audiences)
    }
  }

  log(req.user, 'DECISION_CAL',
    `Logement ${logement_ref} · ${candidats?.length} candidats · rang 1 : ${candidats?.find(c=>c.rang===1)?.nom||'—'}`,
    'info')

  res.status(201).json(decision)
})

// Historique CAL d'un demandeur
app.get('/api/decisions-cal/demandeur/:dem_id', requireAuth, (req, res) => {
  const decisions = readData('decisions_cal.json')
  const result = decisions.filter(d =>
    d.candidats?.some(c => c.dem_id === req.params.dem_id)
  ).map(d => ({
    ...d,
    candidat: d.candidats.find(c => c.dem_id === req.params.dem_id)
  }))
  res.json(result)
})

// ─── SCORING ENGINE (miroir du front) ─────────────────────────────────────────

const TYP = ['T1','T2','T3','T4','T5','T6']
const ti = t => TYP.indexOf(t)
const inRange = (t, mn, mx) => ti(t) >= ti(mn) && ti(t) <= ti(mx)

function computeScore(dem, log, biais) {
  const excl = []
  if (dem.statut !== 'active') excl.push('Demande non active')
  if (!inRange(log.typ, dem.typ_min, dem.typ_max)) excl.push('Typologie incompatible')
  if (dem.pmr && !log.pmr) excl.push('PMR requis — logement non adapté')
  if (dem.rdc && !log.rdc) excl.push('RDC requis — non disponible')
  const te = log.loyer / dem.rev * 100
  if (te > 40) excl.push(`Taux d'effort ${te.toFixed(0)}% trop élevé`)
  if (excl.length) return { eligible: false, excl, total: 0, te: te.toFixed(1), scores: {}, biais: {} }

  const sTyp = log.typ === dem.typ_v ? 20 : 15
  const np = dem.adultes + dem.enfants, idx = ti(log.typ)
  const sComp = np>=idx&&np<=idx+2?15:np===idx-1||np===idx+3?10:np===idx+4?5:0
  const sTaux = te<=25?20:te<=30?16:te<=35?10:te<=40?5:0
  const sAnc = dem.anc>=36?10:dem.anc>=24?8:dem.anc>=12?5:dem.anc>=6?3:1
  let sUrg = 0
  if(dem.sans_log)sUrg+=6; if(dem.violences)sUrg+=5; if(dem.handicap)sUrg+=4
  if(dem.expulsion)sUrg+=5; if(dem.suroc)sUrg+=4; if(dem.grossesse)sUrg+=3
  if(dem.urgence&&sUrg<4)sUrg+=3; sUrg=Math.min(sUrg,15)
  const sLoc = dem.quartiers.includes(log.quartier)?10:dem.secteurs.includes(log.secteur)?8:2
  const sPrio = (dem.dalo||dem.prio_expulsion)?5:(dem.mutation||dem.prio_handicap)?3:0
  const sDos = dem.pieces ? 5 : 1
  const base = sTyp+sComp+sTaux+sAnc+sUrg+sLoc+sPrio+sDos

  // Anti-biais
  const hb = biais[dem.id] || { nb_presentations:0, nb_refus_non_motives:0, derniere_proposition_mois:null }
  let bBonus=0, bMalus=0, bAlerts=[]
  if(hb.nb_presentations===0){ bBonus+=5; bAlerts.push({type:'bonus',msg:'Jamais présenté en CAL (+5)'}) }
  if(hb.derniere_proposition_mois!==null&&hb.derniere_proposition_mois<2){
    bMalus+=5; bAlerts.push({type:'malus',msg:'Proposition il y a moins de 2 mois (−5)'})
  }
  if(hb.nb_refus_non_motives>=2){ bMalus+=8; bAlerts.push({type:'malus',msg:`${hb.nb_refus_non_motives} refus non motivés (−8)`}) }
  else if(hb.nb_refus_non_motives===1){ bMalus+=3; bAlerts.push({type:'malus',msg:'1 refus non motivé (−3)'}) }
  if(hb.nb_presentations>=3){ bBonus+=4; bAlerts.push({type:'bonus',msg:'3+ présentations sans attribution (+4)'}) }

  const total = Math.min(Math.max(base+bBonus-bMalus, 0), 100)
  return {
    eligible: true, excl: [], total, te: te.toFixed(1), base,
    scores: { typ:sTyp, comp:sComp, taux:sTaux, anc:sAnc, urg:sUrg, loc:sLoc, prio:sPrio, dos:sDos },
    biais: { bonus:bBonus, malus:bMalus, alerts:bAlerts }
  }
}

// ─── ROUTES : DEMANDEURS ──────────────────────────────────────────────────────

app.get('/api/demandeurs', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const { statut, search } = req.query
  let result = demandeurs
  if (statut) result = result.filter(d => d.statut === statut)
  if (search) {
    const q = search.toLowerCase()
    result = result.filter(d =>
      `${d.nom} ${d.prenom} ${d.nud}`.toLowerCase().includes(q))
  }
  res.json(result)
})

app.get('/api/demandeurs/:id', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const d = demandeurs.find(d => d.id === req.params.id)
  if (!d) return res.status(404).json({ error: 'Demandeur non trouvé' })
  res.json(d)
})

app.post('/api/demandeurs', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const newId = 'D' + (demandeurs.length + 1)
  const dem = { id: newId, ...req.body, statut: 'active',
    parcours: [{ date: new Date().toLocaleDateString('fr-FR'), type: 'Demande créée', detail: 'Saisie manuelle' }] }
  demandeurs.push(dem)
  writeData('demandeurs.json', demandeurs)
  res.status(201).json(dem)
})

app.put('/api/demandeurs/:id', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const idx = demandeurs.findIndex(d => d.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  demandeurs[idx] = { ...demandeurs[idx], ...req.body }
  writeData('demandeurs.json', demandeurs)
  res.json(demandeurs[idx])
})

// ─── ROUTES : LOGEMENTS ───────────────────────────────────────────────────────

app.get('/api/logements', (req, res) => {
  const logements = readData('logements.json')
  res.json(logements)
})

app.get('/api/logements/:id', (req, res) => {
  const logements = readData('logements.json')
  const l = logements.find(l => l.id === req.params.id)
  if (!l) return res.status(404).json({ error: 'Logement non trouvé' })
  res.json(l)
})

app.post('/api/logements', (req, res) => {
  const logements = readData('logements.json')
  const newId = 'L' + (logements.length + 1)
  const log = { id: newId, ...req.body }
  logements.push(log)
  writeData('logements.json', logements)
  res.status(201).json(log)
})

app.put('/api/logements/:id', (req, res) => {
  const logements = readData('logements.json')
  const idx = logements.findIndex(l => l.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  logements[idx] = { ...logements[idx], ...req.body }
  writeData('logements.json', logements)
  res.json(logements[idx])
})

// ─── ROUTES : MATCHING ────────────────────────────────────────────────────────

app.get('/api/matching/:logement_id', (req, res) => {
  const logements = readData('logements.json')
  const demandeurs = readData('demandeurs.json')
  const ref = readData('referentiels.json')

  const log = logements.find(l => l.id === req.params.logement_id)
  if (!log) return res.status(404).json({ error: 'Logement non trouvé' })

  const results = demandeurs.map(dem => ({
    dem,
    res: computeScore(dem, log, ref.historique_biais)
  }))

  const eligible = results
    .filter(x => x.res.eligible)
    .sort((a, b) => b.res.total - a.res.total)
    .map((x, i) => ({ ...x, rang: i + 1, top4: i < 4 }))

  const ineligible = results
    .filter(x => !x.res.eligible)

  res.json({
    logement: log,
    eligible,
    ineligible,
    top4: eligible.slice(0, 4),
    stats: {
      nb_eligible: eligible.length,
      nb_ineligible: ineligible.length,
      nb_avec_audience: eligible.filter(x =>
        readData('audiences.json').some(a => a.dem_id === x.dem.id && a.favorable)
      ).length
    }
  })
})

// ─── ROUTE : MATCHING CANDIDAT ────────────────────────────────────────────────
// Trouve un demandeur existant à partir de NUD / Nom+Prénom+DDN / Nom+Prénom
// Utilisé par l'import Pelehas pour lier les audiences aux bons demandeurs

app.post('/api/match-candidat', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const { nud, nom, prenom, date_naissance } = req.body

  const normalize = (s) => (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
    .replace(/[-']/g, ' ').replace(/\s+/g, ' ')

  let match = null
  let niveau = null
  let confiance = null

  // Niveau 1 — NUD exact
  if (nud && nud.trim()) {
    match = demandeurs.find(d => d.nud && d.nud.trim() === nud.trim())
    if (match) { niveau = 1; confiance = 'certain'; }
  }

  // Niveau 2 — Nom + Prénom + Date de naissance
  if (!match && nom && prenom && date_naissance) {
    match = demandeurs.find(d =>
      normalize(d.nom) === normalize(nom) &&
      normalize(d.prenom) === normalize(prenom) &&
      d.date_naissance && d.date_naissance === date_naissance
    )
    if (match) { niveau = 2; confiance = 'fort'; }
  }

  // Niveau 3 — Nom + Prénom (exact)
  if (!match && nom && prenom) {
    const candidates = demandeurs.filter(d =>
      normalize(d.nom) === normalize(nom) &&
      normalize(d.prenom) === normalize(prenom)
    )
    if (candidates.length === 1) {
      match = candidates[0]; niveau = 3; confiance = 'probable';
    } else if (candidates.length > 1) {
      // Homonymes — on retourne tous les candidats pour que l'agent choisisse
      return res.json({
        found: false,
        homonymes: candidates.map(d => ({
          id: d.id, nud: d.nud, nom: d.nom, prenom: d.prenom,
          anc: d.anc, compo: d.compo, sit: d.sit,
        })),
        message: `${candidates.length} homonymes trouvés — sélection manuelle requise`
      })
    }
  }

  // Niveau 4 — Nom seul (flou) pour suggestion
  if (!match && nom) {
    const suggestions = demandeurs.filter(d =>
      normalize(d.nom) === normalize(nom)
    ).slice(0, 3)
    if (suggestions.length > 0) {
      return res.json({
        found: false,
        suggestions: suggestions.map(d => ({
          id: d.id, nud: d.nud, nom: d.nom, prenom: d.prenom,
          anc: d.anc, compo: d.compo,
        })),
        message: 'Nom trouvé mais prénom non correspondant — vérification requise'
      })
    }
  }

  if (match) {
    return res.json({
      found: true,
      niveau,
      confiance,
      dem: {
        id: match.id, nud: match.nud, nom: match.nom,
        prenom: match.prenom, anc: match.anc,
        compo: match.compo, sit: match.sit, rev: match.rev,
        typ_v: match.typ_v, dalo: match.dalo,
        violences: match.violences, sans_log: match.sans_log,
      }
    })
  }

  return res.json({ found: false, message: 'Aucun candidat trouvé' })
})

// ─── ROUTE : IMPORT BATCH AUDIENCES AVEC MATCHING AUTO ───────────────────────
app.post('/api/import/audiences', async (req, res) => {
  const { rows } = req.body // rows = tableau d'audiences à importer
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const demandeurs = readData('demandeurs.json')
  const audiences = readData('audiences.json')
  const normalize = (s) => (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-']/g, ' ').replace(/\s+/g, ' ')

  const results = { imported: 0, matched: 0, unmatched: 0, errors: 0 }
  const newAudiences = [...audiences]

  for (const row of rows) {
    try {
      // Matching candidat
      let dem_id = row.dem_id || null
      let match_niveau = null

      if (!dem_id || dem_id === 'IMPORT') {
        const { nud, dem_nom, dem_prenom, dem_ddn } = row
        let matched = null

        // NUD
        if (nud) matched = demandeurs.find(d => d.nud === nud)
        // Nom + Prénom + DDN
        if (!matched && dem_nom && dem_prenom && dem_ddn)
          matched = demandeurs.find(d =>
            normalize(d.nom) === normalize(dem_nom) &&
            normalize(d.prenom) === normalize(dem_prenom) &&
            d.date_naissance === dem_ddn
          )
        // Nom + Prénom
        if (!matched && dem_nom && dem_prenom) {
          const candidates = demandeurs.filter(d =>
            normalize(d.nom) === normalize(dem_nom) &&
            normalize(d.prenom) === normalize(dem_prenom)
          )
          if (candidates.length === 1) matched = candidates[0]
        }

        if (matched) {
          dem_id = matched.id
          match_niveau = 'auto'
          results.matched++
        } else {
          results.unmatched++
        }
      }

      const newAud = {
        id: 'A' + (newAudiences.length + 1),
        date_audience: row.date_audience,
        dem_id: dem_id || 'IMPORT-' + Date.now(),
        elu_id: row.elu_id || 'IMPORT',
        quartier_origine: row.quartier_origine || '',
        quartier_elu: row.quartier_elu || '',
        quartier_souhaite: row.quartier_souhaite || '',
        quartier_attribue: null,
        objet: row.objet || '',
        favorable: !!row.favorable,
        suite: row.suite || '',
        statut: row.statut || 'En attente proposition',
        jours_audience_proposition: null,
        jours_proposition_attribution: null,
        _match_niveau: match_niveau,
        _dem_nom_original: row.dem_nom || '',
      }
      newAudiences.push(newAud)
      results.imported++
    } catch(e) {
      results.errors++
    }
  }

  writeData('audiences.json', newAudiences)
  res.json(results)
})

// ─── ROUTE : IMPORT BATCH DEMANDEURS ─────────────────────────────────────────
app.post('/api/import/demandeurs', (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const demandeurs = readData('demandeurs.json')
  const normalize = (s) => (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-']/g, ' ').replace(/\s+/g, ' ')

  const results = { imported: 0, updated: 0, skipped: 0, errors: 0 }

  for (const row of rows) {
    try {
      // Vérifier si le demandeur existe déjà (par NUD ou Nom+Prénom)
      let existing = null
      if (row.nud) existing = demandeurs.find(d => d.nud === row.nud)
      if (!existing && row.nom && row.prenom)
        existing = demandeurs.find(d =>
          normalize(d.nom) === normalize(row.nom) &&
          normalize(d.prenom) === normalize(row.prenom)
        )

      if (existing) {
        // Mise à jour des champs manquants uniquement
        const idx = demandeurs.indexOf(existing)
        demandeurs[idx] = {
          ...existing,
          // On n'écrase que si la valeur est vide dans CAL Smart
          nud: existing.nud || row.nud,
          anc: existing.anc || row.anc,
          rev: existing.rev || row.rev,
          sit: existing.sit || row.sit,
          date_naissance: existing.date_naissance || row.date_naissance,
          _pelehas_sync: new Date().toISOString(),
        }
        results.updated++
      } else {
        // Nouveau demandeur
        const newId = 'D' + (demandeurs.length + 1)
        demandeurs.push({
          id: newId,
          ...row,
          statut: row.statut || 'active',
          parcours: [{
            date: new Date().toLocaleDateString('fr-FR'),
            type: 'Import Pelehas',
            detail: `Importé le ${new Date().toLocaleDateString('fr-FR')}`
          }],
          _pelehas_sync: new Date().toISOString(),
        })
        results.imported++
      }
    } catch(e) {
      results.errors++
    }
  }

  writeData('demandeurs.json', demandeurs)
  res.json(results)
})

// ─── ROUTE : IMPORT BATCH LOGEMENTS ──────────────────────────────────────────
app.post('/api/import/logements', (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const logements = readData('logements.json')
  const results = { imported: 0, updated: 0, errors: 0 }

  for (const row of rows) {
    try {
      const existing = logements.find(l => l.ref && l.ref === row.ref)
      if (existing) {
        const idx = logements.indexOf(existing)
        logements[idx] = { ...existing, ...row, id: existing.id }
        results.updated++
      } else {
        logements.push({ id: 'L' + (logements.length + 1), ...row })
        results.imported++
      }
    } catch(e) {
      results.errors++
    }
  }

  writeData('logements.json', logements)
  res.json(results)
})

app.get('/api/audiences', (req, res) => {
  const audiences = readData('audiences.json')
  const { elu_id, dem_id, statut } = req.query
  let result = audiences
  if (elu_id) result = result.filter(a => a.elu_id === elu_id)
  if (dem_id) result = result.filter(a => a.dem_id === dem_id)
  if (statut) result = result.filter(a => a.statut === statut)
  res.json(result)
})

app.post('/api/audiences', (req, res) => {
  const audiences = readData('audiences.json')
  const newId = 'A' + (audiences.length + 1)
  const aud = { id: newId, ...req.body }
  audiences.push(aud)
  writeData('audiences.json', audiences)
  res.status(201).json(aud)
})

app.put('/api/audiences/:id', (req, res) => {
  const audiences = readData('audiences.json')
  const idx = audiences.findIndex(a => a.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  audiences[idx] = { ...audiences[idx], ...req.body }
  writeData('audiences.json', audiences)
  res.json(audiences[idx])
})

// ─── ROUTES : NOTIFICATIONS ───────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const notifications = readData('notifications.json')
  const { elu_id, type, lu } = req.query
  let result = notifications
  if (elu_id) result = result.filter(n => n.elu_id === elu_id)
  if (type) result = result.filter(n => n.type === type)
  if (lu !== undefined) result = result.filter(n => n.lu === (lu === 'true'))
  res.json(result)
})

app.put('/api/notifications/:id/lu', (req, res) => {
  const notifications = readData('notifications.json')
  const idx = notifications.findIndex(n => n.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouvé' })
  notifications[idx].lu = true
  writeData('notifications.json', notifications)
  res.json(notifications[idx])
})

app.put('/api/notifications/tout-marquer-lu', (req, res) => {
  const notifications = readData('notifications.json')
  const { elu_id } = req.body
  notifications.forEach(n => {
    if (!elu_id || n.elu_id === elu_id) n.lu = true
  })
  writeData('notifications.json', notifications)
  res.json({ ok: true })
})

// ─── ROUTES : ÉLUS ────────────────────────────────────────────────────────────

app.get('/api/elus', (req, res) => {
  const ref = readData('referentiels.json')
  res.json(ref.elus)
})

// ─── ROUTES : RÉFÉRENTIELS ────────────────────────────────────────────────────

app.get('/api/referentiels', (req, res) => {
  const ref = readData('referentiels.json')
  res.json(ref)
})

// ─── ROUTES : DASHBOARD ───────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const logements = readData('logements.json')
  const audiences = readData('audiences.json')
  const notifications = readData('notifications.json')

  const actifs = demandeurs.filter(d => d.statut === 'active')
  const urgents = actifs.filter(d => d.dalo || d.prio_expulsion || d.sans_log || d.violences)
  const incomplets = actifs.filter(d => !d.pieces)

  // Tension par quartier
  const parQuartier = {}
  actifs.forEach(d => {
    d.quartiers.forEach(q => {
      if (!parQuartier[q]) parQuartier[q] = 0
      parQuartier[q]++
    })
  })

  // Délai moyen attributions post-audience
  const attribues = audiences.filter(a => a.statut === 'Attribué' && a.jours_audience_proposition)
  const delaiMoyen = attribues.length
    ? Math.round(attribues.reduce((s, a) =>
        s + a.jours_audience_proposition + (a.jours_proposition_attribution || 0), 0) / attribues.length)
    : null

  res.json({
    nb_demandeurs_actifs: actifs.length,
    nb_logements_disponibles: logements.length,
    nb_urgents: urgents.length,
    nb_incomplets: incomplets.length,
    nb_audiences: audiences.length,
    nb_audiences_favorables: audiences.filter(a => a.favorable).length,
    nb_attribues_post_audience: audiences.filter(a => a.statut === 'Attribué').length,
    nb_notifications_non_lues: notifications.filter(n => !n.lu).length,
    delai_moyen_attribution: delaiMoyen,
    tension_par_quartier: Object.entries(parQuartier)
      .sort((a, b) => b[1] - a[1])
      .map(([quartier, nb]) => ({ quartier, nb })),
    tension_par_typ: {
      T1: actifs.filter(d => d.typ_v === 'T1').length,
      T2: actifs.filter(d => d.typ_v === 'T2').length,
      T3: actifs.filter(d => d.typ_v === 'T3').length,
      'T4+': actifs.filter(d => ['T4','T5','T6'].includes(d.typ_v)).length,
    }
  })
})

// ─── ROUTE : EXPORT PDF FICHE CAL ────────────────────────────────────────────

app.get('/api/cal/pdf/:logement_id', (req, res) => {
  const { logement_id } = req.params
  const tmpDir = join(__dirname, '../tmp')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  const outPath = join(tmpDir, `CAL_${logement_id}_${Date.now()}.pdf`)

  const py = spawn('python3', [
    join(__dirname, 'generate_pdf.py'),
    logement_id,
    outPath
  ])

  py.stderr.on('data', d => console.error('[PDF]', d.toString()))

  py.on('close', code => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Erreur génération PDF' })
    }
    res.download(outPath, `Fiche_CAL_${logement_id}.pdf`, err => {
      if (err) console.error(err)
      try { unlinkSync(outPath) } catch(e) {}
    })
  })
})

// ─── ROUTES TELEGRAM ──────────────────────────────────────────────────────────

// Webhook Telegram — reçoit les messages entrants du bot
app.post('/api/telegram/webhook', async (req, res) => {
  try { await handleWebhook(req.body) } catch(e) { console.error('[Telegram webhook]', e) }
  res.json({ ok: true })
})

// Liens de connexion Telegram pour un élu
app.get('/api/telegram/lien-elu/:elu_id', requireAuth, (req, res) => {
  const lien = genererLienElu(req.params.elu_id)
  res.json({ lien, qr: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lien)}` })
})

// Lien pour un demandeur
app.get('/api/telegram/lien-candidat/:dem_id', requireAuth, (req, res) => {
  const lien = genererLienCandidат(req.params.dem_id)
  res.json({ lien })
})

// Vérifier si un élu est connecté Telegram
app.get('/api/telegram/statut/:type/:id', requireAuth, (req, res) => {
  const chatId = getChatId(req.params.type, req.params.id)
  res.json({ connecte: !!chatId, chat_id: chatId })
})

// Envoyer un message de test à un élu
app.post('/api/telegram/test/:elu_id', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  const chatId = getChatId('elu', req.params.elu_id)
  if (!chatId) return res.status(404).json({ error: 'Élu non connecté à Telegram' })
  const ok = await sendMessage(chatId,
    `🔔 <b>Test CAL Smart</b>\n\nCe message confirme que votre connexion Telegram fonctionne correctement.\n\n<i>Envoyé par ${req.user.prenom} ${req.user.nom}</i>`)
  res.json({ ok })
})

// Envoyer le digest hebdo manuellement
app.post('/api/telegram/digest', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  try {
    await envoyerDigestHebdo()
    log(req.user, 'TELEGRAM_DIGEST', 'Digest hebdo envoyé manuellement', 'info')
    res.json({ ok: true })
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

// Notifier un élu d'une urgence manuellement
app.post('/api/telegram/urgence', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  const { elu_id, dem_id, jours } = req.body
  const demandeurs = readData('demandeurs.json')
  const ref = readData('referentiels.json')
  const dem = demandeurs.find(d => d.id === dem_id)
  const elu = (ref.elus||[]).find(e => e.id === elu_id)
  if (!dem || !elu) return res.status(404).json({ error: 'Élu ou demandeur non trouvé' })
  const ok = await notifierUrgenceElu(elu_id, dem, elu.secteur, jours || 0)
  log(req.user, 'TELEGRAM_URGENCE', `Urgence envoyée à ${elu.nom} pour ${dem.nom}`, 'info')
  res.json({ ok })
})

// Enregistrer le webhook Telegram (à appeler une fois après déploiement)
app.post('/api/telegram/set-webhook', requireAuth, requireRole('directeur'), async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL requise' })
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN || '8365732100:AAHhqqnayRjBSQMIpyy3YHxZh6fYnMPexI0'}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${url}/api/telegram/webhook` })
    })
    const data = await r.json()
    log(req.user, 'TELEGRAM_WEBHOOK', `Webhook configuré : ${url}`, 'info')
    res.json(data)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── DIGEST HEBDO AUTOMATIQUE ─────────────────────────────────────────────────
// Envoie le digest tous les lundis à 9h
function schedulerDigest() {
  const now = new Date()
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7))
  nextMonday.setHours(9, 0, 0, 0)
  const delay = nextMonday - now
  setTimeout(async () => {
    console.log('[Telegram] Envoi digest hebdo automatique…')
    await envoyerDigestHebdo()
    setInterval(async () => {
      console.log('[Telegram] Envoi digest hebdo automatique…')
      await envoyerDigestHebdo()
    }, 7 * 24 * 60 * 60 * 1000)
  }, delay)
  console.log(`[Telegram] Prochain digest : ${nextMonday.toLocaleString('fr-FR')}`)
}

// ─── ALERTES URGENCES AUTOMATIQUES ───────────────────────────────────────────
// Vérifie toutes les 24h les dossiers urgents sans proposition depuis 30+ jours
async function checkUrgences() {
  try {
    const demandeurs = readData('demandeurs.json')
    const audiences = readData('audiences.json')
    const ref = readData('referentiels.json')

    const urgents = demandeurs.filter(d =>
      d.statut === 'active' && (d.dalo || d.sans_log || d.violences || d.prio_expulsion)
    )

    for (const dem of urgents) {
      const audFav = audiences.find(a =>
        a.dem_id === dem.id && a.favorable && a.statut !== 'Attribué'
      )
      if (!audFav) continue

      // Calculer jours depuis l'audience
      const parts = audFav.date_audience.split('/')
      const dateAud = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      const jours = Math.floor((Date.now() - dateAud) / (1000 * 60 * 60 * 24))

      // Alerter si > 30 jours sans proposition
      if (jours > 30) {
        const elu = (ref.elus||[]).find(e => e.id === audFav.elu_id)
        if (elu) {
          await notifierUrgenceElu(audFav.elu_id, dem, elu.secteur, jours)
          console.log(`[Telegram] Alerte urgence envoyée : ${dem.nom} → ${elu.nom}`)
        }
      }
    }
  } catch(e) {
    console.error('[Telegram] Erreur check urgences:', e)
  }
}

// ─── CATCH-ALL : React Router (production uniquement) ────────────────────────
// Toute URL qui n'est pas /api/* renvoie le index.html du build React
if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(join(DIST, 'index.html'))
  })
}

// ─── DÉMARRAGE ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`\n✅ CAL Smart v2.0 — Serveur démarré`)
  console.log(`   Port → ${PORT}`)
  console.log(`   Bot  → @CALSmartSaintDenis_bot\n`)

  // Démarrer le scheduler digest hebdo
  schedulerDigest()
  // Vérifier urgences toutes les 24h
  setInterval(checkUrgences, 24 * 60 * 60 * 1000)
})
