/**
 * CAL Smart - Telegram Bot
 * Notifications élus et candidats via Telegram
 * Token : 8365732100:AAHhqqnayRjBSQMIpyy3YHxZh6fYnMPexI0
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')

const BOT_TOKEN = process.env.BOT_TOKEN || '8365732100:AAHhqqnayRjBSQMIpyy3YHxZh6fYnMPexI0'
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function readData(file) {
  return JSON.parse(readFileSync(join(DATA, file), 'utf8'))
}
function writeData(file, data) {
  writeFileSync(join(DATA, file), JSON.stringify(data, null, 2), 'utf8')
}

// ─── ENVOI MESSAGE ───────────────────────────────────────────────────────────

export async function sendMessage(chatId, text, options = {}) {
  try {
    const res = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options,
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error('[Telegram] Erreur envoi:', data.description)
      return false
    }
    return true
  } catch(e) {
    console.error('[Telegram] Erreur réseau:', e.message)
    return false
  }
}

// ─── TEMPLATES MESSAGES ──────────────────────────────────────────────────────

export const MSG = {

  // Élu - attribution suite à audience
  attribution_audience: (dem, logement, audience, jours) =>
`[log] <b>Attribution suite à votre audience</b>

<b>${dem.prenom} ${dem.nom}</b>, que vous avez reçu le ${audience.date_audience}, vient d'être attribué-e un <b>${logement.typ}</b> à <b>${logement.quartier}</b>.

[pin] ${logement.adresse}
[EUR] ${logement.loyer} EUR/mois
[tps] Délai audience -> attribution : <b>${jours} jours</b>

<i>Votre intervention a contribué à cette attribution.</i>`,

  // Élu - urgence sur son territoire
  urgence_territoire: (dem, secteur, jours) =>
`(!) <b>Urgence sur votre secteur - ${secteur}</b>

<b>${dem.prenom} ${dem.nom}</b> attend une proposition depuis <b>${jours} jours</b>.
Situation : ${dem.sit} - ${dem.compo}
${dem.dalo ? '[urg] DALO reconnu' : ''}${dem.violences ? '[urg] VIF' : ''}${dem.sans_log ? '[urg] Sans logement' : ''}

<i>Action recommandée : relance service habitat.</i>`,

  // Élu - digest hebdomadaire
  digest_hebdo: (elu, stats) =>
`[stat] <b>Digest hebdo - ${elu.secteur}</b>

[users] Demandeurs actifs : <b>${stats.nb_actifs}</b>
[log] Logements disponibles : <b>${stats.nb_logements}</b>
* Audiences en attente : <b>${stats.nb_audiences_attente}</b>
[ok] Attributions cette semaine : <b>${stats.nb_attrib_semaine}</b>
[tps] Délai moyen d'attente : <b>${stats.delai_moyen} mois</b>

${stats.nb_urgents > 0 ? `[urg] <b>${stats.nb_urgents} dossier(s) urgent(s)</b> sans proposition` : '[ok] Aucun dossier urgent en attente'}`,

  // Élu - CAL à venir
  cal_a_venir: (logement, nb_candidats, date_cal) =>
`[cal] <b>Commission CAL - ${date_cal}</b>

Un <b>${logement.typ}</b> à <b>${logement.quartier}</b> passe en commission.
[pin] ${logement.adresse}
[EUR] ${logement.loyer} EUR/mois - Contingent : ${logement.contingent}

[users] <b>${nb_candidats} candidat(s)</b> de votre secteur sont éligibles.`,

  // Candidat - dossier incomplet
  dossier_incomplet: (dem) =>
`[lst] <b>Votre dossier logement</b>

Bonjour ${dem.prenom},
Votre dossier de demande de logement social nécessite des pièces complémentaires.

Merci de contacter le service habitat de la Ville de Saint-Denis pour régulariser votre situation.

[tel] Service Habitat - Mairie de Saint-Denis`,

  // Candidat - proposition de logement
  proposition_logement: (dem, logement) =>
`[log] <b>Proposition de logement</b>

Bonjour ${dem.prenom},
Vous avez été sélectionné-e pour un logement :

[pin] <b>${logement.adresse}</b>
[bat] ${logement.typ} - ${logement.surface} m2
[EUR] ${logement.loyer} EUR/mois
[vle] ${logement.quartier}

Le service habitat va vous contacter prochainement.
<i>Répondez rapidement - votre dossier sera dépriorisé en cas de non-réponse sous 10 jours.</i>`,

  // Candidat - décision CAL
  decision_cal: (dem, decision, logement) =>
`[cal] <b>Décision de commission</b>

Bonjour ${dem.prenom},
La commission d'attribution s'est réunie concernant votre dossier.

${decision.includes('Retenu') ?
  `[ok] Vous êtes <b>retenu-e (${decision})</b> pour le logement :\n[pin] ${logement?.adresse || '-'}\n\nLe bailleur vous contactera pour la suite.` :
  decision === 'Suppléant' ?
  `[att] Vous êtes <b>suppléant-e</b>. Vous pourrez être contacté-e si le candidat principal renonce.` :
  `[err] Votre candidature n'a pas été retenue lors de cette commission.\n\nVotre dossier reste actif pour les prochaines commissions.`
}`,

  // Message de bienvenue au démarrage du bot
  bienvenue_elu: (elu) =>
`? <b>Bienvenue sur CAL Smart</b>

Bonjour ${elu.prenom} ${elu.nom},
Vous êtes connecté-e au bot de notifications CAL Smart - Ville de Saint-Denis.

Vous recevrez sur ce canal :
- [log] Les attributions suite à vos audiences
- (!) Les urgences sur votre secteur (${elu.secteur})
- [stat] Votre digest hebdomadaire
- [cal] Les CAL concernant votre territoire

<i>Tapez /aide pour voir les commandes disponibles.</i>`,

  bienvenue_candidat: (dem) =>
`? <b>Notifications logement social</b>
<b>Ville de Saint-Denis</b>

Bonjour ${dem.prenom},
Vous êtes inscrit-e pour recevoir les notifications concernant votre dossier de demande de logement.

Vous serez averti-e en cas de :
- Pièce manquante à votre dossier
- Proposition de logement
- Décision de commission
- Attribution confirmée

<i>NUD : ${dem.nud || '-'}</i>`,
}

// ─── GESTION DES CHAT IDS ─────────────────────────────────────────────────────
// Stocke les associations user/elu -> chat_id Telegram

export function saveChatId(type, id, chatId) {
  // type = 'elu' | 'demandeur' | 'user'
  let tg = {}
  try { tg = JSON.parse(readFileSync(join(DATA, 'telegram_chats.json'), 'utf8')) }
  catch(e) {}
  if (!tg[type]) tg[type] = {}
  tg[type][id] = chatId
  writeFileSync(join(DATA, 'telegram_chats.json'), JSON.stringify(tg, null, 2), 'utf8')
}

export function getChatId(type, id) {
  try {
    const tg = JSON.parse(readFileSync(join(DATA, 'telegram_chats.json'), 'utf8'))
    return tg[type]?.[id] || null
  } catch(e) { return null }
}

export function getAllChatIds(type) {
  try {
    const tg = JSON.parse(readFileSync(join(DATA, 'telegram_chats.json'), 'utf8'))
    return tg[type] || {}
  } catch(e) { return {} }
}

// ─── WEBHOOK - ÉCOUTE LES MESSAGES ENTRANTS ──────────────────────────────────
// Quand un élu ou candidat écrit au bot, on enregistre son chat_id

export async function handleWebhook(body) {
  const message = body.message
  if (!message) return

  const chatId = message.chat.id
  const text = (message.text || '').trim()
  const from = message.from

  console.log(`[Telegram] Message de ${from.username || from.first_name}: ${text}`)

  // Commandes
  if (text.startsWith('/start')) {
    const parts = text.split(' ')
    const token = parts[1] // /start TOKEN_UTILISATEUR

    if (token) {
      // Token = type_id (ex: elu_E1 ou dem_D5)
      const [type, id] = token.split('_')

      if (type === 'elu') {
        const ref = readData('referentiels.json')
        const elu = (ref.elus || []).find(e => e.id === id)
        if (elu) {
          saveChatId('elu', id, chatId)
          await sendMessage(chatId, MSG.bienvenue_elu(elu))
          return
        }
      }

      if (type === 'dem') {
        const demandeurs = readData('demandeurs.json')
        const dem = demandeurs.find(d => d.id === id)
        if (dem) {
          saveChatId('demandeur', id, chatId)
          await sendMessage(chatId, MSG.bienvenue_candidat(dem))
          return
        }
      }
    }

    // Pas de token - message generique avec exposition du chat_id pour tests admin
    await sendMessage(chatId,
      `<b>Logivia - Ville de Saint-Denis</b>\n\n` +
      `Bienvenue sur le bot officiel Logivia.\n\n` +
      `Pour vous connecter a votre dossier, utilisez le lien personnel fourni par le service habitat.\n\n` +
      `<b>Votre identifiant de chat Telegram :</b>\n<code>${chatId}</code>\n\n` +
      `Un administrateur peut utiliser cet identifiant pour vous envoyer un message de test directement depuis l'application.`
    )
    return
  }

  if (text === '/aide' || text === '/help') {
    await sendMessage(chatId,
      `[lst] <b>Commandes disponibles</b>\n\n/start - Se connecter\n/statut - Voir votre statut\n/aide - Cette aide`
    )
    return
  }

  if (text === '/statut') {
    // Chercher si ce chatId est connu
    const elus = getAllChatIds('elu')
    const dems = getAllChatIds('demandeur')
    const eluId = Object.entries(elus).find(([,cid])=>cid===chatId)?.[0]
    const demId = Object.entries(dems).find(([,cid])=>cid===chatId)?.[0]

    if (eluId) {
      const ref = readData('referentiels.json')
      const elu = (ref.elus||[]).find(e=>e.id===eluId)
      await sendMessage(chatId, `[ok] Connecté en tant qu'élu : <b>${elu?.nom || eluId}</b>`)
    } else if (demId) {
      const dem = readData('demandeurs.json').find(d=>d.id===demId)
      await sendMessage(chatId, `[ok] Connecté en tant que demandeur : <b>${dem?.nom} ${dem?.prenom}</b>`)
    } else {
      await sendMessage(chatId, `[err] Non connecté. Utilisez le lien fourni par le service habitat.`)
    }
    return
  }

  // Message non reconnu
  await sendMessage(chatId, `Je n'ai pas compris cette commande. Tapez /aide pour la liste des commandes.`)
}

// ─── NOTIFICATIONS PROGRAMMÉES ───────────────────────────────────────────────

// Envoyer le digest hebdo à tous les élus connectés
export async function envoyerDigestHebdo() {
  const ref = readData('referentiels.json')
  const demandeurs = readData('demandeurs.json')
  const audiences = readData('audiences.json')
  const logements = readData('logements.json')
  const elus = ref.elus || []

  for (const elu of elus) {
    const chatId = getChatId('elu', elu.id)
    if (!chatId) continue

    // Stats pour cet élu
    const eluAud = audiences.filter(a => a.elu_id === elu.id)
    const actifs = demandeurs.filter(d => d.statut === 'active' &&
      d.secteurs?.includes(elu.secteur))
    const urgents = actifs.filter(d => d.dalo || d.sans_log || d.violences || d.prio_expulsion)
    const attribSemaine = eluAud.filter(a => {
      if (a.statut !== 'Attribué' || !a.date_attribution) return false
      const parts = a.date_attribution.split('/')
      const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      const now = new Date()
      return (now - d) < 7 * 24 * 60 * 60 * 1000
    })

    const stats = {
      nb_actifs: actifs.length,
      nb_logements: logements.length,
      nb_audiences_attente: eluAud.filter(a => a.statut !== 'Attribué').length,
      nb_attrib_semaine: attribSemaine.length,
      nb_urgents: urgents.length,
      delai_moyen: Math.round(actifs.reduce((s,d) => s + (d.anc||0), 0) / (actifs.length||1)),
    }

    await sendMessage(chatId, MSG.digest_hebdo(elu, stats))
    console.log(`[Telegram] Digest envoyé à ${elu.nom}`)
  }
}

// Notifier un élu d'une attribution
export async function notifierAttributionElu(eluId, dem, logement, audience, jours) {
  const chatId = getChatId('elu', eluId)
  if (!chatId) return false
  return sendMessage(chatId, MSG.attribution_audience(dem, logement, audience, jours))
}

// Notifier un élu d'une urgence
export async function notifierUrgenceElu(eluId, dem, secteur, jours) {
  const chatId = getChatId('elu', eluId)
  if (!chatId) return false
  return sendMessage(chatId, MSG.urgence_territoire(dem, secteur, jours))
}

// Notifier un candidat d'une proposition
export async function notifierPropositionCandidat(demId, dem, logement) {
  const chatId = getChatId('demandeur', demId)
  if (!chatId) return false
  return sendMessage(chatId, MSG.proposition_logement(dem, logement))
}

// Notifier un candidat d'une décision CAL
export async function notifierDecisionCAL(demId, dem, decision, logement) {
  const chatId = getChatId('demandeur', demId)
  if (!chatId) return false
  return sendMessage(chatId, MSG.decision_cal(dem, decision, logement))
}

// ─── GÉNÉRER LIEN DE CONNEXION ────────────────────────────────────────────────
export function genererLienElu(eluId) {
  return `https://t.me/CALSmartSaintDenis_bot?start=elu_${eluId}`
}

export function genererLienCandidat(demId) {
  return `https://t.me/CALSmartSaintDenis_bot?start=dem_${demId}`
}