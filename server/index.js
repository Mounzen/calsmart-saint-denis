/**
 * Logivia v3.0 - Serveur Express
 * Ville de Saint-Denis
 */

import express from 'express'
import cors from 'cors'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, copyFileSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomBytes, createHash } from 'crypto'
import { spawn } from 'child_process'
import {
  sendMessage as tgSend,
  MSG as tgMSG,
  getChatId as tgGetChatId,
  getAllChatIds as tgGetAllChatIds,
  saveChatId as tgSaveChatId,
  genererLienElu,
  genererLienCandidat,
  envoyerDigestHebdo,
  handleWebhook as tgHandleWebhook
} from './telegram.js'
import {
  registerSseClient,
  broadcast as rtBroadcast,
  broadcastToUser as rtBroadcastToUser,
  broadcastToRoles as rtBroadcastToRoles,
  setPresence as rtSetPresence,
  getPresenceSummary as rtGetPresence,
  whoIsOnEntity as rtWhoIsOnEntity,
  acquireLock as rtAcquireLock,
  releaseLock as rtReleaseLock,
  getLock as rtGetLock,
  getAllLocks as rtGetAllLocks,
  getConnectedClientsCount as rtConnectedCount
} from './realtime.js'
import {
  openDatabase,
  readData as dbReadData,
  readObj as dbReadObj,
  writeData as dbWriteData,
  backupNow as dbBackupNow,
  listBackups as dbListBackups,
  rotateBackups as dbRotateBackups,
  stats as dbStats,
  getDbPath as dbGetDbPath,
  getBackupDir as dbGetBackupDir,
  listFiles as dbListFiles,
  closeDatabase as dbClose
} from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// DATA_DIR : sur Railway, on monte un Volume sur /data ; en local, fallback ./server/data
const SEED_DATA = join(__dirname, 'data')
const DATA = process.env.DATA_DIR || SEED_DATA
const DIST = join(__dirname, '../dist')
const TMP = join(__dirname, '../tmp')

if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true })
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true })

/**
 * Sur premier boot Railway, le Volume monte est vide. On seed depuis le repo
 * les fichiers JSON de reference (referentiels, users) et on cree les autres vides.
 * Une fois qu'un fichier existe deja dans le Volume, on ne l'ecrase JAMAIS.
 *
 * Note : depuis la v3.1 (migration SQLite), ces fichiers JSON servent uniquement
 * de graine. Apres le premier boot, la source de verite est logivia.db dans le
 * meme dossier. openDatabase() ci-dessous importera automatiquement les JSON
 * presents si la base est vide.
 */
if (DATA !== SEED_DATA && existsSync(SEED_DATA)) {
  try {
    const fichiers = readdirSync(SEED_DATA).filter(f => f.endsWith('.json'))
    let seeded = 0
    for (const f of fichiers) {
      const dst = join(DATA, f)
      if (!existsSync(dst)) {
        copyFileSync(join(SEED_DATA, f), dst)
        seeded++
      }
    }
    if (seeded > 0) console.log('[seed] ' + seeded + ' fichier(s) JSON copies dans ' + DATA)
  } catch (e) {
    console.error('[seed] erreur:', e.message)
  }
}

// Ouverture de la base SQLite (migration auto des JSON si base neuve)
try {
  openDatabase(DATA)
  const s = dbStats()
  if (s) console.log('[db] SQLite prete : ' + s.file_count + ' entree(s), ' + Math.round(s.size_bytes / 1024) + ' ko')
} catch (e) {
  console.error('[db] ouverture impossible : ' + e.message)
  console.error('[db] le serveur fonctionnera en mode degrade (lecture/ecriture JSON fallback)')
}

// Fermeture propre de la base au shutdown
process.on('SIGTERM', () => { try { dbClose() } catch (_) {} })
process.on('SIGINT', () => { try { dbClose() } catch (_) {}; process.exit(0) })

// ============================================================
// HELPERS DATA
// ============================================================

// Depuis la v3.1, readData / readObj / writeData delegent a la base SQLite.
// L'API reste identique : les 280 appels existants continuent de fonctionner sans modification.
// En cas d'echec SQLite (ex : module natif non compile), fallback automatique sur les fichiers .json.
function readData(file) {
  try {
    return dbReadData(file)
  } catch (e) {
    console.error('[readData/SQL] ' + file + ': ' + e.message + ' — fallback JSON')
    const path = join(DATA, file)
    try {
      if (!existsSync(path)) return []
      const raw = readFileSync(path, 'utf8').trim()
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e2) {
      console.error('[readData/fs] ' + file + ': ' + e2.message)
      return []
    }
  }
}

function readObj(file, fallback) {
  try {
    return dbReadObj(file, fallback)
  } catch (e) {
    console.error('[readObj/SQL] ' + file + ': ' + e.message + ' — fallback JSON')
    const path = join(DATA, file)
    try {
      if (!existsSync(path)) return fallback || {}
      const raw = readFileSync(path, 'utf8').trim()
      if (!raw) return fallback || {}
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : (fallback || {})
    } catch (e2) {
      console.error('[readObj/fs] ' + file + ': ' + e2.message)
      return fallback || {}
    }
  }
}

function writeData(file, data) {
  try {
    const ok = dbWriteData(file, data)
    if (ok) return true
    throw new Error('dbWriteData returned false')
  } catch (e) {
    console.error('[writeData/SQL] ' + file + ': ' + e.message + ' — fallback JSON')
    try {
      writeFileSync(join(DATA, file), JSON.stringify(data, null, 2), 'utf8')
      return true
    } catch (e2) {
      console.error('[writeData/fs] ' + file + ': ' + e2.message)
      return false
    }
  }
}

function nextId(arr, prefix) {
  if (!Array.isArray(arr) || arr.length === 0) return prefix + '1'
  const nums = arr
    .map(x => parseInt((x.id || '').toString().replace(prefix, '')))
    .filter(n => !isNaN(n))
  return prefix + (nums.length ? Math.max(...nums) + 1 : arr.length + 1)
}

function nowDate() {
  return new Date().toLocaleDateString('fr-FR')
}

function nowTime() {
  return new Date().toLocaleTimeString('fr-FR')
}

// ============================================================
// SESSIONS
// ============================================================

const SESSIONS = new Map()
const SESSION_TTL = 8 * 60 * 60 * 1000

function createSession(user) {
  const token = randomBytes(32).toString('hex')
  SESSIONS.set(token, {
    user: {
      id: user.id,
      login: user.login,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      elu_id: user.elu_id || null,
      secteur: user.secteur || null
    },
    expires: Date.now() + SESSION_TTL
  })
  return token
}

function getSession(token) {
  if (!token || typeof token !== 'string') return null
  const s = SESSIONS.get(token)
  if (!s) return null
  if (Date.now() > s.expires) { SESSIONS.delete(token); return null }
  return s
}

setInterval(() => {
  const now = Date.now()
  for (const [k, s] of SESSIONS.entries()) {
    if (now > s.expires) SESSIONS.delete(k)
  }
}, 60 * 60 * 1000)

// ============================================================
// LOGS
// ============================================================

function addLog(user, action, detail) {
  try {
    const logs = readData('logs.json')
    logs.unshift({
      id: 'L' + Date.now(),
      date: nowDate(),
      heure: nowTime(),
      user_id: user ? user.id : 'system',
      user_nom: user ? (user.prenom + ' ' + user.nom) : 'Systeme',
      role: user ? user.role : 'system',
      action: action || '',
      detail: detail || ''
    })
    writeData('logs.json', logs.slice(0, 500))
  } catch (e) {
    console.error('[addLog]', e.message)
  }
}

// ============================================================
// TRACABILITE / AUDIT
// Enregistre chaque modification avec qui, quoi, quand, pourquoi.
// ============================================================

const FIELD_LABELS = {
  nom: 'Nom', prenom: 'Prenom', nud: 'NUD',
  anc: 'Anciennete (mois)', adultes: 'Adultes', enfants: 'Enfants',
  compo: 'Composition', typ_v: 'Typ. souhaitee', typ_min: 'Typ. min', typ_max: 'Typ. max',
  rev: 'Revenu', sit: 'Situation', quartiers: 'Quartiers', secteurs: 'Secteurs',
  quartier_origine: 'Quartier origine',
  pmr: 'PMR', rdc: 'RDC requis', violences: 'VIF', handicap: 'Handicap',
  sans_log: 'Sans logement', expulsion: 'Expulsion', urgence: 'Urgence',
  suroc: 'Suroccupation', grossesse: 'Grossesse', dalo: 'DALO',
  mutation: 'Mutation', prio_handicap: 'Prio. handicap', prio_expulsion: 'Prio. expulsion',
  pieces: 'Dossier complet', statut: 'Statut',
  ref: 'Reference', bailleur: 'Bailleur', adresse: 'Adresse',
  quartier: 'Quartier', secteur: 'Secteur', typ: 'Typologie',
  surface: 'Surface', etage: 'Etage', asc: 'Ascenseur',
  loyer_hc: 'Loyer HC', charges: 'Charges', loyer: 'Loyer',
  plafond: 'Plafond', contingent: 'Contingent', dispo: 'Disponibilite',
  email: 'Email', telephone: 'Telephone'
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (v === true) return 'Oui'
  if (v === false) return 'Non'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '-'
  return String(v)
}

function diff(before, after, ignore) {
  const skip = ignore || ['id', 'parcours', 'created_at', 'updated_at']
  const changes = []
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  for (const k of keys) {
    if (skip.includes(k)) continue
    const a = before ? before[k] : undefined
    const b = after ? after[k] : undefined
    const eq = JSON.stringify(a) === JSON.stringify(b)
    if (!eq) changes.push({ champ: k, label: FIELD_LABELS[k] || k, avant: fmtVal(a), apres: fmtVal(b) })
  }
  return changes
}

function addAudit(user, entity_type, entity_id, entity_label, action, changes, motif) {
  try {
    const audit = readData('audit.json')
    audit.unshift({
      id: 'AU' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      date: nowDate(),
      heure: nowTime(),
      timestamp: new Date().toISOString(),
      user_id: user ? user.id : 'system',
      user_nom: user ? (user.prenom + ' ' + user.nom) : 'Systeme',
      role: user ? user.role : 'system',
      entity_type: entity_type || '',
      entity_id: entity_id || '',
      entity_label: entity_label || '',
      action: action || '',
      changes: Array.isArray(changes) ? changes : [],
      motif: motif || ''
    })
    writeData('audit.json', audit.slice(0, 5000))
  } catch (e) {
    console.error('[addAudit]', e.message)
  }
}

// ============================================================
// RATE LIMIT
// ============================================================

const loginAttempts = new Map()

function checkLoginLimit(ip) {
  const now = Date.now()
  const window = 15 * 60 * 1000
  const hits = (loginAttempts.get(ip) || []).filter(t => now - t < window)
  if (hits.length >= 10) return false
  hits.push(now)
  loginAttempts.set(ip, hits)
  return true
}

// ============================================================
// APP
// ============================================================

const app = express()

// Security headers (helmet-like, zero dep)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('X-XSS-Protection', '0')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  // CSP : permissif en dev (vite HMR), strict en prod
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'self'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "object-src 'none'"
    )
  }
  next()
})

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

// ============================================================
// RATE LIMITING (in-memory, sliding window)
// ============================================================

function makeRateLimiter(maxHits, windowMs, message) {
  const buckets = new Map()
  // auto-cleanup
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [ip, hits] of buckets) {
      const kept = hits.filter(t => t > cutoff)
      if (kept.length === 0) buckets.delete(ip)
      else buckets.set(ip, kept)
    }
  }, windowMs).unref?.()

  return function rateLimit(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim()
    const now = Date.now()
    const hits = (buckets.get(ip) || []).filter(t => now - t < windowMs)
    if (hits.length >= maxHits) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
      return res.status(429).json({ error: message || 'Trop de requetes. Reessayez dans quelques minutes.' })
    }
    hits.push(now)
    buckets.set(ip, hits)
    next()
  }
}

// Limiteurs reutilisables
const rlLoginTight = makeRateLimiter(10, 15 * 60 * 1000, 'Trop de tentatives de connexion. Reessayez dans 15 min.')
const rlPortailAuth = makeRateLimiter(8, 10 * 60 * 1000, 'Trop de tentatives. Reessayez dans 10 min.')
const rlUpload = makeRateLimiter(30, 60 * 60 * 1000, 'Trop d uploads. Reessayez dans 1 heure.')
const rlRgpdReq = makeRateLimiter(5, 24 * 60 * 60 * 1000, 'Vous avez deja soumis une demande RGPD aujourd hui.')

// Production: servir React
if (existsSync(join(DIST, 'index.html'))) {
  const { default: serveStatic } = await import('serve-static').catch(() => ({ default: null }))
  if (!serveStatic) {
    app.use(express.static(DIST))
  } else {
    app.use(serveStatic(DIST))
  }
  console.log('[Logivia] Production - dist servi')
}

// ============================================================
// MIDDLEWARES AUTH
// ============================================================

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token']
  const s = getSession(token)
  if (!s) return res.status(401).json({ error: 'Session expiree. Reconnectez-vous.' })
  req.user = s.user
  next()
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifie' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acces refuse' })
    }
    next()
  }
}

// ============================================================
// PING - healthcheck
// ============================================================

app.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    version: '3.1',
    nom: 'Logivia',
    temps_reel: true,
    data_dir_mode: process.env.DATA_DIR ? 'volume' : 'ephemere',
    time: new Date().toISOString()
  })
})

// ============================================================
// AUTH
// ============================================================

app.post('/api/auth/login', rlLoginTight, (req, res) => {
  const ip = req.ip || 'unknown'
  if (!checkLoginLimit(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives. Attendez 15 minutes.' })
  }

  const { login, password } = req.body || {}
  if (!login || !password || typeof login !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Login et mot de passe requis' })
  }

  const users = readData('users.json')
  const user = users.find(u =>
    u.login === login.trim() &&
    u.password === password &&
    u.actif === true
  )

  if (!user) {
    addLog(null, 'LOGIN_ECHEC', 'login: ' + login + ' ip: ' + ip)
    return res.status(401).json({ error: 'Identifiants incorrects' })
  }

  const token = createSession(user)
  addLog(user, 'LOGIN', 'ip: ' + ip)

  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      elu_id: user.elu_id || null,
      secteur: user.secteur || null
    }
  })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  SESSIONS.delete(req.headers['x-auth-token'])
  res.json({ ok: true })
})

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { ancien, nouveau } = req.body || {}
  if (!ancien || !nouveau) return res.status(400).json({ error: 'Champs manquants' })

  const users = readData('users.json')
  const idx = users.findIndex(u => u.id === req.user.id)
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' })
  if (users[idx].password !== ancien) return res.status(400).json({ error: 'Ancien mot de passe incorrect' })

  users[idx].password = nouveau
  writeData('users.json', users)
  addLog(req.user, 'CHANGE_PASSWORD', '')
  res.json({ ok: true })
})

// ============================================================
// UTILISATEURS
// ============================================================

app.get('/api/users', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  res.json(users.map(u => ({ ...u, password: '***' })))
})

app.post('/api/users', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  const u = {
    id: nextId(users, 'U'),
    login: req.body.login,
    password: req.body.password || 'changeme',
    nom: req.body.nom || '',
    prenom: req.body.prenom || '',
    role: req.body.role || 'agent',
    elu_id: req.body.elu_id || null,
    secteur: req.body.secteur || null,
    actif: true
  }
  users.push(u)
  writeData('users.json', users)
  addLog(req.user, 'CREATE_USER', u.login)
  res.status(201).json({ ...u, password: '***' })
})

app.put('/api/users/:id', requireAuth, requireRole('directeur'), (req, res) => {
  const users = readData('users.json')
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  const keep = { id: users[idx].id, password: users[idx].password }
  users[idx] = { ...users[idx], ...req.body, ...keep }
  writeData('users.json', users)
  addLog(req.user, 'UPDATE_USER', users[idx].login)
  res.json({ ...users[idx], password: '***' })
})

// ============================================================
// REFERENTIELS + ELUS
// ============================================================

app.get('/api/referentiels', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', {})
  res.json(ref)
})

// ============================================================
// GESTION REFERENTIELS (secteurs, quartiers, bailleurs, contingents)
// Accessible uniquement au directeur
// ============================================================

const REF_LISTS = ['secteurs', 'quartiers', 'bailleurs', 'contingents', 'situations_logement', 'motifs_refus', 'statuts_post_cal', 'typologies']

app.post('/api/referentiels/:list', requireAuth, requireRole('directeur'), (req, res) => {
  const list = req.params.list
  if (!REF_LISTS.includes(list)) return res.status(400).json({ error: 'Liste invalide' })
  const value = (req.body && typeof req.body.value === 'string') ? req.body.value.trim() : ''
  if (!value) return res.status(400).json({ error: 'Valeur vide' })
  const ref = readObj('referentiels.json', {})
  if (!Array.isArray(ref[list])) ref[list] = []
  if (ref[list].includes(value)) return res.status(409).json({ error: 'Deja present' })
  ref[list].push(value)
  writeData('referentiels.json', ref)
  addLog(req.user, 'REF_ADD', list + ':' + value)
  res.status(201).json({ ok: true, list, value, items: ref[list] })
})

app.delete('/api/referentiels/:list/:value', requireAuth, requireRole('directeur'), (req, res) => {
  const list = req.params.list
  if (!REF_LISTS.includes(list)) return res.status(400).json({ error: 'Liste invalide' })
  const value = decodeURIComponent(req.params.value)
  const ref = readObj('referentiels.json', {})
  if (!Array.isArray(ref[list])) return res.status(404).json({ error: 'Liste absente' })
  const before = ref[list].length
  ref[list] = ref[list].filter(v => v !== value)
  if (ref[list].length === before) return res.status(404).json({ error: 'Valeur non trouvee' })
  writeData('referentiels.json', ref)
  addLog(req.user, 'REF_DEL', list + ':' + value)
  res.json({ ok: true, list, value, items: ref[list] })
})

app.put('/api/referentiels/:list/:value', requireAuth, requireRole('directeur'), (req, res) => {
  const list = req.params.list
  if (!REF_LISTS.includes(list)) return res.status(400).json({ error: 'Liste invalide' })
  const oldValue = decodeURIComponent(req.params.value)
  const newValue = (req.body && typeof req.body.value === 'string') ? req.body.value.trim() : ''
  if (!newValue) return res.status(400).json({ error: 'Nouvelle valeur vide' })
  const ref = readObj('referentiels.json', {})
  if (!Array.isArray(ref[list])) return res.status(404).json({ error: 'Liste absente' })
  const idx = ref[list].indexOf(oldValue)
  if (idx === -1) return res.status(404).json({ error: 'Valeur non trouvee' })
  if (ref[list].includes(newValue) && newValue !== oldValue) return res.status(409).json({ error: 'Nouvelle valeur deja presente' })
  ref[list][idx] = newValue
  writeData('referentiels.json', ref)
  addLog(req.user, 'REF_UPD', list + ':' + oldValue + ' -> ' + newValue)
  res.json({ ok: true, list, oldValue, newValue, items: ref[list] })
})

// ============================================================
// SYNC REFERENTIELS : merge 974 seed dans le volume
// Sans destruction des elus + valeurs deja saisies par l utilisateur
// ============================================================

const SEED_974 = {
  secteurs: ['Centre', 'Est', 'Ouest', 'Nord', 'Sud', 'Hauts'],
  quartiers: [
    'Centre-ville', 'Vauban', 'Saint-Jacques', 'Le Butor',
    'Le Chaudron', 'Sainte-Clotilde', 'Moufia', 'Commune Prima', 'Bas de la Riviere',
    'Bellepierre', 'La Montagne', 'Saint-Bernard', 'Ruisseau Blanc',
    'Bois-de-Nefles', 'Le Brule', 'La Bretagne',
    'Montgaillard', 'Domenjod', 'Saint-Francois',
    'La Providence', 'La Source', 'Camelias'
  ],
  bailleurs: ['SIDR', 'SHLMR', 'SODIAC', 'SEMADER', 'CBo Territoria', 'SODEGIS', 'SEDRE', 'SEMAC'],
  contingents: ['Ville', 'Prefecture', 'Action Logement', 'Bailleur', 'Departement', 'Region']
}

app.post('/api/admin/sync-referentiels', requireAuth, requireRole('directeur'), (req, res) => {
  const mode = (req.body && req.body.mode) || 'merge'
  const ref = readObj('referentiels.json', {})
  const before = JSON.stringify(ref)

  if (mode === 'replace') {
    // Remplace les listes 974 mais garde les elus + historique_biais
    Object.keys(SEED_974).forEach(k => { ref[k] = [...SEED_974[k]] })
  } else {
    // Merge : ajoute les valeurs manquantes sans toucher aux existantes
    Object.keys(SEED_974).forEach(k => {
      if (!Array.isArray(ref[k])) ref[k] = []
      SEED_974[k].forEach(v => {
        if (!ref[k].includes(v)) ref[k].push(v)
      })
    })
  }
  // Assure des listes systeme
  if (!Array.isArray(ref.typologies) || ref.typologies.length === 0) {
    ref.typologies = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
  }

  const changed = JSON.stringify(ref) !== before
  if (changed) writeData('referentiels.json', ref)
  addLog(req.user, 'SYNC_REF_974', mode + (changed ? ' (updated)' : ' (noop)'))
  res.json({ ok: true, mode, changed, referentiels: ref })
})

app.get('/api/elus', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', { elus: [] })
  res.json(ref.elus || [])
})

app.post('/api/elus', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const ref = readObj('referentiels.json', { elus: [] })
  if (!ref.elus) ref.elus = []
  const elu = {
    id: 'E' + Date.now(),
    nom: req.body.nom || '',
    prenom: req.body.prenom || '',
    secteur: req.body.secteur || '',
    quartiers: req.body.quartiers || [],
    email: req.body.email || '',
    telephone: req.body.telephone || '',
    actif: true
  }
  ref.elus.push(elu)
  writeData('referentiels.json', ref)
  addLog(req.user, 'CREATE_ELU', elu.nom)
  res.status(201).json(elu)
})

app.put('/api/elus/:id', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const ref = readObj('referentiels.json', { elus: [] })
  if (!ref.elus) ref.elus = []
  const idx = ref.elus.findIndex(e => e.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })

  const { __motif, ...patch } = req.body || {}
  const before = { ...ref.elus[idx] }
  const after = { ...ref.elus[idx], ...patch, id: ref.elus[idx].id }
  const changes = diff(before, after)

  ref.elus[idx] = after
  writeData('referentiels.json', ref)
  addLog(req.user, 'UPDATE_ELU', ref.elus[idx].nom + (__motif ? ' - ' + __motif : ''))
  if (changes.length > 0) {
    addAudit(req.user, 'elu', ref.elus[idx].id, ref.elus[idx].nom, 'modification', changes, __motif || '')
  }
  res.json(ref.elus[idx])
})

// ============================================================
// VUE ENRICHIE ELU : audiences + parcours candidats
// ============================================================

app.get('/api/elus/:id/full', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', { elus: [] })
  const elu = (ref.elus || []).find(e => e.id === req.params.id)
  if (!elu) return res.status(404).json({ error: 'Elu non trouve' })

  const audiences = readData('audiences.json').filter(a => a.elu_id === elu.id)
  const demandeurs = readData('demandeurs.json')
  const decisions = readData('decisions_cal.json')

  // Pour chaque audience : statut actuel du candidat
  const details = audiences.map(a => {
    const dem = demandeurs.find(d => d.id === a.dem_id)
    const decs = decisions.filter(dc => (dc.candidats || []).some(c => c.dem_id === a.dem_id))
    const derniere = decs[0]
    return {
      audience: a,
      demandeur: dem ? {
        id: dem.id, nud: dem.nud, nom: dem.nom, prenom: dem.prenom,
        statut: dem.statut, compo: dem.compo, anc: dem.anc, rev: dem.rev,
        typ_v: dem.typ_v, quartiers: dem.quartiers || [],
        dalo: !!dem.dalo, violences: !!dem.violences, sans_log: !!dem.sans_log,
        pieces: !!dem.pieces, parcours: dem.parcours || []
      } : null,
      derniere_decision: derniere ? {
        date: derniere.date_cal,
        logement: derniere.logement_ref + ' - ' + derniere.logement_adresse,
        decision: (derniere.candidats.find(c => c.dem_id === a.dem_id) || {}).decision || ''
      } : null,
      attribue: !!dem && dem.statut === 'attribue'
    }
  })

  // Migration territoriale : quartier origine -> quartier attribue
  const migrations = details
    .filter(d => d.audience.quartier_origine && d.audience.quartier_attribue)
    .map(d => ({
      demandeur: d.demandeur ? (d.demandeur.nom + ' ' + d.demandeur.prenom) : '?',
      de: d.audience.quartier_origine,
      vers: d.audience.quartier_attribue,
      date: d.audience.date_audience
    }))

  res.json({
    elu,
    details,
    migrations,
    stats: {
      nb_audiences: audiences.length,
      nb_favorables: audiences.filter(a => a.favorable).length,
      nb_attribues: details.filter(d => d.attribue).length,
      nb_en_cours: details.filter(d => !d.attribue && d.demandeur && d.demandeur.statut === 'active').length
    }
  })
})

app.delete('/api/elus/:id', requireAuth, requireRole('directeur'), (req, res) => {
  const ref = readObj('referentiels.json', { elus: [] })
  if (!ref.elus) ref.elus = []
  const idx = ref.elus.findIndex(e => e.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  // Archive plutot que suppression
  ref.elus[idx].actif = false
  writeData('referentiels.json', ref)
  addLog(req.user, 'ARCHIVE_ELU', ref.elus[idx].nom)
  res.json({ ok: true })
})

// ============================================================
// DASHBOARD
// ============================================================

app.get('/api/dashboard', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const logements = readData('logements.json')
  const audiences = readData('audiences.json')
  const notifications = readData('notifications.json')

  const actifs = demandeurs.filter(d => d.statut === 'active')
  const vacants = logements.filter(l => !l.statut || l.statut === 'vacant')
  const urgents = actifs.filter(d => d.dalo || d.prio_expulsion || d.sans_log || d.violences)
  const attribues = audiences.filter(a => a.statut === 'Attribue')

  const avecDelai = attribues.filter(a => a.jours_total)
  const delaiMoyen = avecDelai.length
    ? Math.round(avecDelai.reduce((s, a) => s + a.jours_total, 0) / avecDelai.length)
    : null

  const parQuartier = {}
  actifs.forEach(d => {
    (d.quartiers || []).forEach(q => {
      parQuartier[q] = (parQuartier[q] || 0) + 1
    })
  })

  const parTyp = {
    T1: actifs.filter(d => d.typ_v === 'T1').length,
    T2: actifs.filter(d => d.typ_v === 'T2').length,
    T3: actifs.filter(d => d.typ_v === 'T3').length,
    'T4+': actifs.filter(d => ['T4', 'T5', 'T6'].includes(d.typ_v)).length
  }

  res.json({
    nb_demandeurs_actifs: actifs.length,
    nb_logements_disponibles: vacants.length,
    nb_urgents: urgents.length,
    nb_incomplets: actifs.filter(d => !d.pieces).length,
    nb_audiences: audiences.length,
    nb_audiences_favorables: audiences.filter(a => a.favorable).length,
    nb_attribues: attribues.length,
    nb_notifications_non_lues: notifications.filter(n => !n.lu).length,
    delai_moyen: delaiMoyen,
    tension_par_quartier: Object.entries(parQuartier)
      .sort((a, b) => b[1] - a[1])
      .map(([quartier, nb]) => ({ quartier, nb })),
    tension_par_typ: parTyp
  })
})

// ============================================================
// DEMANDEURS
// Statuts : active | attribue | archive | annule
// ============================================================

app.get('/api/demandeurs', requireAuth, (req, res) => {
  let d = readData('demandeurs.json')
  const { statut, search } = req.query
  if (statut) d = d.filter(x => x.statut === statut)
  else d = d.filter(x => !x.statut || x.statut !== 'archive')
  if (search) {
    const q = search.toLowerCase()
    d = d.filter(x => (x.nom + ' ' + x.prenom + ' ' + (x.nud || '')).toLowerCase().includes(q))
  }
  res.json(d)
})

app.get('/api/demandeurs/:id', requireAuth, (req, res) => {
  const d = readData('demandeurs.json')
  const item = d.find(x => x.id === req.params.id)
  if (!item) return res.status(404).json({ error: 'Non trouve' })
  res.json(item)
})

app.post('/api/demandeurs', requireAuth, (req, res) => {
  const d = readData('demandeurs.json')
  const item = {
    id: nextId(d, 'D'),
    nud: req.body.nud || '',
    nom: req.body.nom || '',
    prenom: req.body.prenom || '',
    anc: parseInt(req.body.anc) || 0,
    adultes: parseInt(req.body.adultes) || 1,
    enfants: parseInt(req.body.enfants) || 0,
    compo: req.body.compo || '',
    typ_v: req.body.typ_v || 'T3',
    typ_min: req.body.typ_min || 'T2',
    typ_max: req.body.typ_max || 'T4',
    secteurs: req.body.secteurs || [],
    quartiers: req.body.quartiers || [],
    rev: parseFloat(req.body.rev) || 0,
    sit: req.body.sit || '',
    quartier_origine: req.body.quartier_origine || '',
    pmr: !!req.body.pmr,
    rdc: !!req.body.rdc,
    violences: !!req.body.violences,
    handicap: !!req.body.handicap,
    sans_log: !!req.body.sans_log,
    expulsion: !!req.body.expulsion,
    urgence: !!req.body.urgence,
    suroc: !!req.body.suroc,
    grossesse: !!req.body.grossesse,
    dalo: !!req.body.dalo,
    mutation: !!req.body.mutation,
    prio_handicap: !!req.body.prio_handicap,
    prio_expulsion: !!req.body.prio_expulsion,
    pieces: !!req.body.pieces,
    statut: 'active',
    parcours: [{ date: nowDate(), type: 'Demande creee', detail: 'Saisie manuelle' }]
  }
  d.push(item)
  writeData('demandeurs.json', d)
  addLog(req.user, 'CREATE_DEMANDEUR', item.nom + ' ' + item.prenom)
  res.status(201).json(item)
})

app.put('/api/demandeurs/:id', requireAuth, (req, res) => {
  const d = readData('demandeurs.json')
  const idx = d.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })

  const { __motif, ...patch } = req.body || {}
  const before = { ...d[idx] }
  const after = { ...d[idx], ...patch, id: d[idx].id, parcours: d[idx].parcours }

  const changes = diff(before, after)

  // Motif obligatoire si modif metier (plus que juste un changement de statut simple)
  const isSimpleStatutChange = changes.length === 1 && changes[0].champ === 'statut'
  if (!isSimpleStatutChange && changes.length > 0 && !__motif) {
    return res.status(400).json({ error: 'Motif de modification obligatoire', need_motif: true, preview: changes })
  }

  // Enrichir le parcours d'une trace visible dans la timeline
  if (changes.length > 0) {
    if (!after.parcours) after.parcours = []
    after.parcours.push({
      date: nowDate(),
      type: 'Modification fiche',
      detail: (__motif || 'mise a jour') + ' (' + changes.length + ' champ' + (changes.length > 1 ? 's' : '') + ') - par ' + req.user.prenom + ' ' + req.user.nom
    })
  }

  d[idx] = after
  writeData('demandeurs.json', d)
  addLog(req.user, 'UPDATE_DEMANDEUR', d[idx].nom + ' ' + d[idx].prenom + (__motif ? ' - ' + __motif : ''))
  if (changes.length > 0) {
    addAudit(req.user, 'demandeur', d[idx].id, d[idx].nom + ' ' + d[idx].prenom, 'modification', changes, __motif || '')
  }
  res.json(d[idx])
})

// Archive (pas de vrai delete)
app.delete('/api/demandeurs/:id', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const d = readData('demandeurs.json')
  const idx = d.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  const motif = (req.body && req.body.__motif) || (req.query && req.query.motif) || ''
  d[idx].statut = 'archive'
  writeData('demandeurs.json', d)
  addLog(req.user, 'ARCHIVE_DEMANDEUR', d[idx].nom + ' ' + d[idx].prenom + (motif ? ' - ' + motif : ''))
  addAudit(req.user, 'demandeur', d[idx].id, d[idx].nom + ' ' + d[idx].prenom, 'archivage', [{ champ: 'statut', label: 'Statut', avant: 'actif', apres: 'archive' }], motif)
  res.json({ ok: true })
})

// ============================================================
// LOGEMENTS
// Statuts : vacant | attribue | archive
// ============================================================

app.get('/api/logements', requireAuth, (req, res) => {
  let l = readData('logements.json')
  l = l.filter(x => !x.statut || x.statut === 'vacant')
  res.json(l)
})

app.get('/api/logements/:id', requireAuth, (req, res) => {
  const l = readData('logements.json')
  const item = l.find(x => x.id === req.params.id)
  if (!item) return res.status(404).json({ error: 'Non trouve' })
  res.json(item)
})

app.post('/api/logements', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const l = readData('logements.json')
  const lhc = parseFloat(req.body.loyer_hc) || 0
  const ch = parseFloat(req.body.charges) || 0
  const item = {
    id: nextId(l, 'L'),
    ref: req.body.ref || '',
    bailleur: req.body.bailleur || '',
    adresse: req.body.adresse || '',
    quartier: req.body.quartier || '',
    secteur: req.body.secteur || '',
    typ: req.body.typ || 'T3',
    surface: parseFloat(req.body.surface) || 0,
    etage: parseInt(req.body.etage) || 0,
    asc: !!req.body.asc,
    rdc: !!req.body.rdc,
    pmr: !!req.body.pmr,
    loyer_hc: lhc,
    charges: ch,
    loyer: parseFloat(req.body.loyer) || (lhc + ch),
    plafond: req.body.plafond || 'PLUS',
    contingent: req.body.contingent || 'Ville',
    dispo: req.body.dispo || '',
    statut: 'vacant'
  }
  l.push(item)
  writeData('logements.json', l)
  addLog(req.user, 'CREATE_LOGEMENT', item.adresse)
  res.status(201).json(item)
})

app.put('/api/logements/:id', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const l = readData('logements.json')
  const idx = l.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })

  const { __motif, ...patch } = req.body || {}
  const before = { ...l[idx] }
  const after = { ...l[idx], ...patch, id: l[idx].id }
  // Si le loyer total n a pas ete envoye, le recalculer
  if (patch.loyer_hc !== undefined || patch.charges !== undefined) {
    after.loyer = (parseFloat(after.loyer_hc) || 0) + (parseFloat(after.charges) || 0)
  }
  const changes = diff(before, after)

  if (changes.length > 0 && !__motif) {
    return res.status(400).json({ error: 'Motif de modification obligatoire', need_motif: true, preview: changes })
  }

  l[idx] = after
  writeData('logements.json', l)
  addLog(req.user, 'UPDATE_LOGEMENT', l[idx].adresse + (__motif ? ' - ' + __motif : ''))
  if (changes.length > 0) {
    addAudit(req.user, 'logement', l[idx].id, l[idx].ref + ' - ' + l[idx].adresse, 'modification', changes, __motif || '')
  }
  res.json(l[idx])
})

app.delete('/api/logements/:id', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const l = readData('logements.json')
  const idx = l.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  const motif = (req.body && req.body.__motif) || (req.query && req.query.motif) || ''
  l[idx].statut = 'archive'
  writeData('logements.json', l)
  addLog(req.user, 'ARCHIVE_LOGEMENT', l[idx].adresse + (motif ? ' - ' + motif : ''))
  addAudit(req.user, 'logement', l[idx].id, l[idx].ref + ' - ' + l[idx].adresse, 'archivage', [{ champ: 'statut', label: 'Statut', avant: 'vacant', apres: 'archive' }], motif)
  res.json({ ok: true })
})

// ============================================================
// SCORING
// ============================================================

const TYP = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']
const ti = t => TYP.indexOf(t)
const inRange = (t, mn, mx) => ti(t) >= ti(mn) && ti(t) <= ti(mx)

function computeScore(dem, log, biais) {
  const b = biais || {}
  const excl = []
  if (dem.statut !== 'active') excl.push('Demande non active')
  if (!inRange(log.typ, dem.typ_min || 'T1', dem.typ_max || 'T6')) excl.push('Typologie incompatible')
  if (dem.pmr && !log.pmr) excl.push('PMR requis non disponible')
  if (dem.rdc && !log.rdc) excl.push('RDC requis non disponible')

  const rev = parseFloat(dem.rev) || 1
  const loyer = parseFloat(log.loyer) || 0
  const te = loyer / rev * 100
  if (te > 40) excl.push('Taux effort ' + te.toFixed(0) + '% trop eleve')

  if (excl.length > 0) return { eligible: false, excl, total: 0, te: te.toFixed(1), scores: {}, bonus_malus: [] }

  const sTyp = log.typ === dem.typ_v ? 20 : 15
  const np = (parseInt(dem.adultes) || 0) + (parseInt(dem.enfants) || 0)
  const idx = ti(log.typ)
  let sComp = 0
  if (np >= idx && np <= idx + 2) sComp = 15
  else if (np === idx - 1 || np === idx + 3) sComp = 10
  else if (np === idx + 4) sComp = 5

  let sTaux = 0
  if (te <= 25) sTaux = 20
  else if (te <= 30) sTaux = 16
  else if (te <= 35) sTaux = 10
  else sTaux = 5

  const anc = parseInt(dem.anc) || 0
  const sAnc = anc >= 36 ? 10 : anc >= 24 ? 8 : anc >= 12 ? 5 : anc >= 6 ? 3 : 1

  let sUrg = 0
  if (dem.sans_log) sUrg += 6
  if (dem.violences) sUrg += 5
  if (dem.handicap) sUrg += 4
  if (dem.expulsion) sUrg += 5
  if (dem.suroc) sUrg += 4
  if (dem.grossesse) sUrg += 3
  if (dem.urgence && sUrg < 4) sUrg += 3
  sUrg = Math.min(sUrg, 15)

  const quartiers = dem.quartiers || []
  const secteurs = dem.secteurs || []
  const sLoc = quartiers.includes(log.quartier) ? 10 : secteurs.includes(log.secteur) ? 8 : 2
  const sPrio = (dem.dalo || dem.prio_expulsion) ? 5 : (dem.mutation || dem.prio_handicap) ? 3 : 0
  const sDos = dem.pieces ? 5 : 1

  const base = sTyp + sComp + sTaux + sAnc + sUrg + sLoc + sPrio + sDos
  const hb = b[dem.id] || { nb_presentations: 0, nb_refus_non_motives: 0, derniere_proposition_mois: null }

  let bonus = 0; let malus = 0
  const bm = []

  if (hb.nb_presentations === 0) { bonus += 5; bm.push({ type: 'bonus', msg: 'Jamais presente en CAL (+5)' }) }
  if (hb.derniere_proposition_mois !== null && hb.derniere_proposition_mois < 2) { malus += 5; bm.push({ type: 'malus', msg: 'Proposition recente (-5)' }) }
  if (hb.nb_refus_non_motives >= 2) { malus += 8; bm.push({ type: 'malus', msg: hb.nb_refus_non_motives + ' refus non motives (-8)' }) }
  else if (hb.nb_refus_non_motives === 1) { malus += 3; bm.push({ type: 'malus', msg: '1 refus non motive (-3)' }) }
  if (hb.nb_presentations >= 3) { bonus += 4; bm.push({ type: 'bonus', msg: '3+ presentations (+4)' }) }

  const total = Math.min(Math.max(base + bonus - malus, 0), 100)

  return {
    eligible: true,
    excl: [],
    total,
    te: te.toFixed(1),
    base,
    scores: { typ: sTyp, comp: sComp, taux: sTaux, anc: sAnc, urg: sUrg, loc: sLoc, prio: sPrio, dos: sDos },
    bonus_malus: bm
  }
}

// ============================================================
// MATCHING
// ============================================================

app.get('/api/matching/:logement_id', requireAuth, (req, res) => {
  const logements = readData('logements.json')
  const demandeurs = readData('demandeurs.json')
  const ref = readObj('referentiels.json', {})
  const biais = ref.historique_biais || {}

  const log = logements.find(l => l.id === req.params.logement_id)
  if (!log) return res.status(404).json({ error: 'Logement non trouve' })

  const actifs = demandeurs.filter(d => d.statut === 'active')
  const results = actifs.map(dem => ({ dem, res: computeScore(dem, log, biais) }))

  const eligible = results
    .filter(x => x.res.eligible)
    .sort((a, b) => b.res.total - a.res.total)
    .map((x, i) => ({ ...x, rang: i + 1, top4: i < 4 }))

  const ineligible = results.filter(x => !x.res.eligible)

  const audiences = readData('audiences.json')

  addLog(req.user, 'MATCHING', 'Logement ' + log.ref + ' - ' + eligible.length + ' eligibles')

  res.json({
    logement: log,
    eligible,
    ineligible,
    top4: eligible.slice(0, 4),
    stats: {
      nb_eligible: eligible.length,
      nb_ineligible: ineligible.length,
      nb_avec_audience: eligible.filter(x =>
        audiences.some(a => a.dem_id === x.dem.id && a.favorable)
      ).length
    }
  })
})

// ============================================================
// AUDIENCES
// Statuts : En attente proposition | En attente attribution | Attribue | Cloture
// ============================================================

app.get('/api/audiences', requireAuth, (req, res) => {
  let a = readData('audiences.json')
  const { elu_id, dem_id, statut } = req.query
  if (elu_id) a = a.filter(x => x.elu_id === elu_id)
  if (dem_id) a = a.filter(x => x.dem_id === dem_id)
  if (statut) a = a.filter(x => x.statut === statut)
  // Restriction elu: seulement ses audiences
  if (req.user.role === 'elu' && req.user.elu_id) {
    a = a.filter(x => x.elu_id === req.user.elu_id)
  }
  res.json(a)
})

app.post('/api/audiences', requireAuth, (req, res) => {
  const a = readData('audiences.json')
  const item = {
    id: nextId(a, 'A'),
    date_audience: req.body.date_audience || nowDate(),
    dem_id: req.body.dem_id || '',
    elu_id: req.body.elu_id || '',
    quartier_origine: req.body.quartier_origine || '',
    quartier_elu: req.body.quartier_elu || '',
    quartier_souhaite: req.body.quartier_souhaite || '',
    quartier_attribue: null,
    objet: req.body.objet || '',
    favorable: !!req.body.favorable,
    suite: req.body.suite || '',
    statut: 'En attente proposition',
    jours_total: null
  }
  a.push(item)
  writeData('audiences.json', a)

  // Notification auto si favorable + dossier urgent
  if (item.favorable && item.dem_id) {
    try {
      const demandeurs = readData('demandeurs.json')
      const dem = demandeurs.find(d => d.id === item.dem_id)
      if (dem && (dem.dalo || dem.violences || dem.sans_log || dem.prio_expulsion)) {
        const notifs = readData('notifications.json')
        notifs.unshift({
          id: 'N' + Date.now(),
          date: nowDate(),
          heure: nowTime(),
          elu_id: item.elu_id,
          type: 'urgence_territoire',
          titre: 'Dossier urgent - Audience favorable',
          message: dem.nom + ' ' + dem.prenom + ' - Audience du ' + item.date_audience + '. Instruction renforcee.',
          dem_id: item.dem_id,
          logement_ref: null,
          quartier: item.quartier_elu || '',
          lu: false
        })
        writeData('notifications.json', notifs.slice(0, 500))
      }
    } catch (e) {}
  }

  addLog(req.user, 'CREATE_AUDIENCE', item.objet)
  res.status(201).json(item)
})

app.put('/api/audiences/:id', requireAuth, (req, res) => {
  const a = readData('audiences.json')
  const idx = a.findIndex(x => x.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  a[idx] = { ...a[idx], ...req.body, id: a[idx].id }
  writeData('audiences.json', a)
  res.json(a[idx])
})

// ============================================================
// DECISIONS CAL
// ============================================================

app.get('/api/decisions-cal', requireAuth, (req, res) => {
  const d = readData('decisions_cal.json')
  res.json(d)
})

app.post('/api/decisions-cal', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { logement_id, logement_ref, logement_adresse, date_cal, candidats } = req.body || {}
  const decisions = readData('decisions_cal.json')

  const decision = {
    id: 'CAL' + Date.now(),
    logement_id: logement_id || '',
    logement_ref: logement_ref || '',
    logement_adresse: logement_adresse || '',
    date_cal: date_cal || nowDate(),
    candidats: candidats || [],
    agent_nom: req.user.prenom + ' ' + req.user.nom,
    created_at: new Date().toISOString(),
    statut: 'validee'
  }

  // Mettre a jour statut audience si rang 1 attribue
  const rang1 = (candidats || []).find(c => c.decision && c.decision.includes('Retenu rang 1'))
  if (rang1) {
    const audiences = readData('audiences.json')
    const idx = audiences.findIndex(a => a.dem_id === rang1.dem_id)
    if (idx >= 0) {
      audiences[idx].statut = 'Attribue'
      audiences[idx].quartier_attribue = logement_adresse
      writeData('audiences.json', audiences)
    }

    // Mettre a jour statut logement
    const logements = readData('logements.json')
    const lidx = logements.findIndex(l => l.id === logement_id)
    if (lidx >= 0) {
      logements[lidx].statut = 'attribue'
      writeData('logements.json', logements)
    }

    // Mettre a jour statut demandeur
    const demandeurs = readData('demandeurs.json')
    const didx = demandeurs.findIndex(d => d.id === rang1.dem_id)
    if (didx >= 0) {
      demandeurs[didx].statut = 'attribue'
      if (!demandeurs[didx].parcours) demandeurs[didx].parcours = []
      demandeurs[didx].parcours.push({
        date: nowDate(),
        type: 'Attribution',
        detail: 'Logement ' + logement_ref + ' - ' + logement_adresse
      })
      writeData('demandeurs.json', demandeurs)
    }

    // Notification pour l elu concerne
    try {
      const audiences2 = readData('audiences.json')
      const audFav = audiences2.find(a => a.dem_id === rang1.dem_id && a.favorable)
      if (audFav && audFav.elu_id) {
        const notifs = readData('notifications.json')
        notifs.unshift({
          id: 'N' + Date.now(),
          date: nowDate(),
          heure: nowTime(),
          elu_id: audFav.elu_id,
          type: 'attribution_audience',
          titre: 'Attribution suite a votre audience',
          message: rang1.nom + ' vient d etre attribue au logement ' + logement_ref + ' - ' + logement_adresse,
          dem_id: rang1.dem_id,
          logement_ref: logement_ref,
          quartier: audFav.quartier_attribue || '',
          lu: false
        })
        writeData('notifications.json', notifs.slice(0, 500))
      }
    } catch (e) {}
  }

  decisions.unshift(decision)
  writeData('decisions_cal.json', decisions)
  addLog(req.user, 'DECISION_CAL', 'Logement ' + logement_ref)
  res.status(201).json(decision)
})

// ============================================================
// NOTIFICATIONS
// ============================================================

app.get('/api/notifications', requireAuth, (req, res) => {
  let n = readData('notifications.json')
  const { elu_id, lu } = req.query
  if (req.user.role === 'elu' && req.user.elu_id) {
    n = n.filter(x => x.elu_id === req.user.elu_id)
  } else if (elu_id) {
    n = n.filter(x => x.elu_id === elu_id)
  }
  if (lu !== undefined) n = n.filter(x => x.lu === (lu === 'true'))
  res.json(n)
})

app.put('/api/notifications/:id/lu', requireAuth, (req, res) => {
  const n = readData('notifications.json')
  const idx = n.findIndex(x => x.id === req.params.id)
  if (idx !== -1) { n[idx].lu = true; writeData('notifications.json', n) }
  res.json({ ok: true })
})

app.put('/api/notifications/tout-marquer-lu', requireAuth, (req, res) => {
  const n = readData('notifications.json')
  const { elu_id } = req.body || {}
  n.forEach(x => { if (!elu_id || x.elu_id === elu_id) x.lu = true })
  writeData('notifications.json', n)
  res.json({ ok: true })
})

// ============================================================
// LOGS
// ============================================================

app.get('/api/logs', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const logs = readData('logs.json')
  const limit = parseInt(req.query.limit) || 200
  res.json(logs.slice(0, limit))
})

// ============================================================
// AUDIT (tracabilite)
// ============================================================

app.get('/api/audit', requireAuth, (req, res) => {
  let audit = readData('audit.json')
  const { entity_type, entity_id, limit } = req.query
  if (entity_type) audit = audit.filter(a => a.entity_type === entity_type)
  if (entity_id) audit = audit.filter(a => a.entity_id === entity_id)
  const lim = parseInt(limit) || 300
  res.json(audit.slice(0, lim))
})

// ============================================================
// ALERTES INTELLIGENTES
// ============================================================

app.get('/api/alertes', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json').filter(d => d.statut === 'active')
  const logements = readData('logements.json').filter(l => !l.statut || l.statut === 'vacant')
  const audiences = readData('audiences.json')

  const now = Date.now()
  const parseDateFr = (s) => {
    if (!s) return null
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
    if (!m) return null
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])).getTime()
  }
  const monthsAgo = (ts) => Math.round((now - ts) / (1000 * 60 * 60 * 24 * 30))

  const alertes = []

  // 1. DALO hors delai (> 6 mois sans attribution)
  for (const d of demandeurs) {
    if (d.dalo && d.anc >= 6 && !audiences.some(a => a.dem_id === d.id && a.statut === 'Attribue')) {
      alertes.push({
        niveau: 'critique', type: 'dalo_retard',
        titre: 'DALO en retard', sujet: d.nom + ' ' + d.prenom,
        message: 'DALO reconnu depuis ' + d.anc + ' mois sans attribution',
        entite: { type: 'demandeur', id: d.id }
      })
    }
  }

  // 2. Logements vacants depuis longtemps
  for (const l of logements) {
    const dispoTs = parseDateFr(l.dispo)
    if (dispoTs) {
      const mois = monthsAgo(dispoTs)
      if (mois >= 3) {
        alertes.push({
          niveau: mois >= 6 ? 'critique' : 'attention', type: 'logement_vacant',
          titre: 'Logement vacant', sujet: l.ref + ' - ' + l.adresse,
          message: 'Vacant depuis environ ' + mois + ' mois',
          entite: { type: 'logement', id: l.id }
        })
      }
    }
  }

  // 3. Demandeurs sans contact depuis longtemps (pas de modif/audience depuis 6 mois)
  for (const d of demandeurs) {
    const dernierEv = (d.parcours || []).length ? parseDateFr((d.parcours[d.parcours.length - 1] || {}).date) : null
    const derniereAud = audiences.filter(a => a.dem_id === d.id)
      .map(a => parseDateFr(a.date_audience)).filter(Boolean).sort((a, b) => b - a)[0]
    const last = Math.max(dernierEv || 0, derniereAud || 0)
    if (last && monthsAgo(last) >= 6 && d.anc >= 12) {
      alertes.push({
        niveau: 'attention', type: 'dossier_inactif',
        titre: 'Dossier sans activite', sujet: d.nom + ' ' + d.prenom,
        message: 'Aucune modification ni audience depuis ' + monthsAgo(last) + ' mois',
        entite: { type: 'demandeur', id: d.id }
      })
    }
  }

  // 4. Dossiers urgents incomplets
  for (const d of demandeurs) {
    if ((d.dalo || d.violences || d.sans_log) && !d.pieces) {
      alertes.push({
        niveau: 'attention', type: 'dossier_incomplet',
        titre: 'Dossier urgent incomplet', sujet: d.nom + ' ' + d.prenom,
        message: 'Priorite ' + (d.dalo ? 'DALO' : d.violences ? 'VIF' : 'sans logement') + ' - pieces manquantes',
        entite: { type: 'demandeur', id: d.id }
      })
    }
  }

  // Trier par niveau
  alertes.sort((a, b) => (a.niveau === 'critique' ? 0 : 1) - (b.niveau === 'critique' ? 0 : 1))

  res.json({
    total: alertes.length,
    par_niveau: {
      critique: alertes.filter(a => a.niveau === 'critique').length,
      attention: alertes.filter(a => a.niveau === 'attention').length
    },
    alertes
  })
})

// ============================================================
// REGLES DE SCORING (lecture + edition)
// ============================================================

const DEFAULT_SCORING_RULES = {
  criteres: [
    { id: 'typ', label: 'Typologie adaptee', poids_max: 20, desc: 'Correspondance exacte entre la typologie souhaitee et celle du logement. +20 si exacte, +15 si dans la fourchette acceptee.' },
    { id: 'comp', label: 'Composition familiale', poids_max: 15, desc: 'Adequation entre le nombre de personnes et le nombre de pieces. Optimum : nb personnes = nb pieces + 0 a 2.' },
    { id: 'taux', label: "Taux d'effort", poids_max: 20, desc: 'Rapport loyer / revenu. Au-dela de 40 %, le dossier est ineligible. Plus le taux est bas, plus le score est eleve.' },
    { id: 'anc', label: 'Anciennete de la demande', poids_max: 10, desc: 'Anciennete en mois depuis l enregistrement. Plafonnee a 10 points au-dela de 36 mois.' },
    { id: 'urg', label: 'Urgences et criticites', poids_max: 15, desc: 'Cumul des critiques : sans logement, violences, handicap, expulsion, suroccupation, grossesse. Plafonne a 15.' },
    { id: 'loc', label: 'Localisation souhaitee', poids_max: 10, desc: 'Quartier demande = +10, secteur demande = +8, hors zone = +2.' },
    { id: 'prio', label: 'Priorites legales', poids_max: 5, desc: 'DALO ou priorite expulsion : +5. Mutation ou priorite handicap : +3.' },
    { id: 'dos', label: 'Completude du dossier', poids_max: 5, desc: 'Pieces justificatives completes : +5, sinon +1.' }
  ],
  exclusions: [
    'Demande non active',
    'Typologie incompatible (hors min / max)',
    'PMR requis non disponible',
    'RDC requis non disponible',
    "Taux d'effort superieur a 40 %"
  ],
  anti_biais: [
    { id: 'jamais_presente', label: 'Jamais presente en CAL', effet: '+5', desc: 'Donne une chance aux dossiers jamais proposes.' },
    { id: 'proposition_recente', label: 'Proposition recente', effet: '-5', desc: 'Moins de 2 mois depuis la derniere proposition.' },
    { id: 'refus_repetes', label: 'Refus non motives', effet: '-3 a -8', desc: '1 refus = -3, 2 refus et + = -8.' },
    { id: 'passages_multiples', label: 'Presente plusieurs fois', effet: '+4', desc: 'Plus de 3 presentations sans attribution.' }
  ]
}

app.get('/api/scoring-rules', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', {})
  res.json(ref.scoring_rules || DEFAULT_SCORING_RULES)
})

app.put('/api/scoring-rules', requireAuth, requireRole('directeur'), (req, res) => {
  const ref = readObj('referentiels.json', {})
  const { __motif, ...rules } = req.body || {}
  const before = ref.scoring_rules || DEFAULT_SCORING_RULES
  ref.scoring_rules = rules
  writeData('referentiels.json', ref)
  addLog(req.user, 'UPDATE_SCORING_RULES', __motif || '')
  addAudit(req.user, 'scoring_rules', 'global', 'Regles de scoring', 'modification',
    [{ champ: 'rules', label: 'Regles de scoring', avant: 'version precedente', apres: 'nouvelle version' }],
    __motif || '')
  res.json(ref.scoring_rules)
})

// ============================================================
// AGENDA / CALENDRIER : CAL, audiences, evenements
// ============================================================

app.get('/api/agenda', requireAuth, (req, res) => {
  const audiences = readData('audiences.json')
  const decisions = readData('decisions_cal.json')
  const demandeurs = readData('demandeurs.json')
  const ref = readObj('referentiels.json', { elus: [], evenements: [] })
  const elus = ref.elus || []
  const evts = ref.evenements || []

  const parseDateFr = (s) => {
    if (!s) return null
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
    if (!m) return null
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
  }

  const events = []

  for (const a of audiences) {
    const d = parseDateFr(a.date_audience)
    if (!d) continue
    const dem = demandeurs.find(x => x.id === a.dem_id)
    const elu = elus.find(x => x.id === a.elu_id)
    events.push({
      id: 'aud-' + a.id, date: a.date_audience, iso: d.toISOString(),
      type: 'audience',
      titre: 'Audience - ' + (dem ? dem.nom + ' ' + dem.prenom : a.dem_id),
      sous_titre: elu ? elu.nom + ' (' + (elu.secteur || '') + ')' : '',
      couleur: a.favorable ? '#16A34A' : '#7C3AED',
      objet: a.objet
    })
  }

  for (const c of decisions) {
    const d = parseDateFr(c.date_cal)
    if (!d) continue
    events.push({
      id: 'cal-' + c.id, date: c.date_cal, iso: d.toISOString(),
      type: 'cal',
      titre: 'CAL - ' + c.logement_ref,
      sous_titre: c.logement_adresse,
      couleur: '#E05C2A',
      objet: (c.candidats || []).length + ' candidat(s)'
    })
  }

  for (const e of evts) {
    const d = parseDateFr(e.date)
    if (!d) continue
    events.push({
      id: 'evt-' + e.id, date: e.date, iso: d.toISOString(),
      type: e.type || 'evenement',
      titre: e.titre || '',
      sous_titre: e.lieu || '',
      couleur: '#1D6FA8',
      objet: e.description || ''
    })
  }

  events.sort((a, b) => a.iso.localeCompare(b.iso))
  res.json(events)
})

app.post('/api/agenda', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const ref = readObj('referentiels.json', { evenements: [] })
  if (!ref.evenements) ref.evenements = []
  const ev = {
    id: 'EV' + Date.now(),
    date: req.body.date || nowDate(),
    titre: req.body.titre || '',
    type: req.body.type || 'evenement',
    lieu: req.body.lieu || '',
    description: req.body.description || '',
    cree_par: req.user.prenom + ' ' + req.user.nom
  }
  ref.evenements.push(ev)
  writeData('referentiels.json', ref)
  addLog(req.user, 'CREATE_AGENDA', ev.titre)
  res.status(201).json(ev)
})

app.delete('/api/agenda/:id', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const ref = readObj('referentiels.json', { evenements: [] })
  if (!ref.evenements) ref.evenements = []
  const idx = ref.evenements.findIndex(e => e.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Non trouve' })
  const ev = ref.evenements[idx]
  ref.evenements.splice(idx, 1)
  writeData('referentiels.json', ref)
  addLog(req.user, 'DELETE_AGENDA', ev.titre)
  res.json({ ok: true })
})

// ============================================================
// TIMELINE PAR DEMANDEUR (vue synthetique)
// ============================================================

app.get('/api/demandeurs/:id/timeline', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === req.params.id)
  if (!dem) return res.status(404).json({ error: 'Non trouve' })

  const audiences = readData('audiences.json').filter(a => a.dem_id === dem.id)
  const decisions = readData('decisions_cal.json').filter(dc => (dc.candidats || []).some(c => c.dem_id === dem.id))
  const ref = readObj('referentiels.json', { elus: [] })
  const elus = ref.elus || []
  const audit = readData('audit.json').filter(a => a.entity_type === 'demandeur' && a.entity_id === dem.id)

  const timeline = []

  for (const p of (dem.parcours || [])) {
    timeline.push({ date: p.date, type: 'parcours', titre: p.type, detail: p.detail || '', couleur: '#0B1E3D' })
  }
  for (const a of audiences) {
    const e = elus.find(x => x.id === a.elu_id)
    timeline.push({
      date: a.date_audience, type: 'audience',
      titre: 'Audience elu ' + (e ? e.nom : a.elu_id),
      detail: a.objet + (a.favorable ? ' (favorable)' : ''),
      couleur: a.favorable ? '#16A34A' : '#7C3AED'
    })
  }
  for (const d of decisions) {
    const c = (d.candidats || []).find(x => x.dem_id === dem.id)
    timeline.push({
      date: d.date_cal, type: 'cal',
      titre: 'Commission CAL - ' + d.logement_ref,
      detail: c ? c.decision + (c.motif ? ' (' + c.motif + ')' : '') : '',
      couleur: '#E05C2A'
    })
  }
  for (const a of audit) {
    timeline.push({
      date: a.date, type: 'audit',
      titre: 'Modification fiche par ' + a.user_nom,
      detail: a.motif || a.changes.map(c => c.label).join(', '),
      couleur: '#5B6B85'
    })
  }

  // Trier par date (date fr -> iso)
  const parseDate = (s) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '')
    if (!m) return '0000-00-00'
    return m[3] + '-' + m[2] + '-' + m[1]
  }
  timeline.sort((a, b) => parseDate(b.date).localeCompare(parseDate(a.date)))

  res.json({
    demandeur: dem,
    timeline
  })
})

// ============================================================
// IMPORT
// ============================================================

app.post('/api/import/demandeurs', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { rows } = req.body || {}
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const demandeurs = readData('demandeurs.json')
  const norm = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let imported = 0; let updated = 0; let errors = 0

  for (const row of rows) {
    try {
      let existing = null
      if (row.nud) existing = demandeurs.find(d => d.nud === row.nud)
      if (!existing && row.nom && row.prenom) {
        existing = demandeurs.find(d =>
          norm(d.nom) === norm(row.nom) && norm(d.prenom) === norm(row.prenom)
        )
      }
      if (existing) {
        const idx = demandeurs.indexOf(existing)
        demandeurs[idx] = { ...existing, ...row, id: existing.id, statut: existing.statut }
        updated++
      } else {
        demandeurs.push({
          id: nextId(demandeurs, 'D'),
          ...row,
          statut: 'active',
          parcours: [{ date: nowDate(), type: 'Import Pelehas', detail: '' }]
        })
        imported++
      }
    } catch (e) { errors++ }
  }

  writeData('demandeurs.json', demandeurs)
  addLog(req.user, 'IMPORT_DEMANDEURS', imported + ' importes, ' + updated + ' mis a jour')
  res.json({ imported, updated, errors })
})

app.post('/api/import/logements', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { rows } = req.body || {}
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const logements = readData('logements.json')
  let imported = 0; let updated = 0; let errors = 0

  for (const row of rows) {
    try {
      const existing = logements.find(l => l.ref && l.ref === row.ref)
      if (existing) {
        const idx = logements.indexOf(existing)
        logements[idx] = { ...existing, ...row, id: existing.id }
        updated++
      } else {
        logements.push({ id: nextId(logements, 'L'), ...row, statut: 'vacant' })
        imported++
      }
    } catch (e) { errors++ }
  }

  writeData('logements.json', logements)
  res.json({ imported, updated, errors })
})

app.post('/api/import/audiences', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { rows } = req.body || {}
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows requis' })

  const demandeurs = readData('demandeurs.json')
  const audiences = readData('audiences.json')
  const norm = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  let imported = 0; let matched = 0; let unmatched = 0; let errors = 0

  for (const row of rows) {
    try {
      let dem_id = row.dem_id
      if (!dem_id || dem_id === 'IMPORT') {
        let found = null
        if (row.nud) found = demandeurs.find(d => d.nud === row.nud)
        if (!found && row.dem_nom && row.dem_prenom) {
          found = demandeurs.find(d =>
            norm(d.nom) === norm(row.dem_nom) && norm(d.prenom) === norm(row.dem_prenom)
          )
        }
        if (found) { dem_id = found.id; matched++ } else unmatched++
      }
      audiences.push({
        id: nextId(audiences, 'A'),
        ...row,
        dem_id: dem_id || 'IMPORT-' + Date.now(),
        statut: row.statut || 'En attente proposition'
      })
      imported++
    } catch (e) { errors++ }
  }

  writeData('audiences.json', audiences)
  res.json({ imported, matched, unmatched, errors })
})

// ============================================================
// EXPORT CSV
// ============================================================

function toCSV(rows, cols) {
  const bom = '\uFEFF'
  const header = cols.map(c => c.label).join(';')
  const lines = rows.map(row =>
    cols.map(c => {
      const val = c.fn ? c.fn(row) : (row[c.key] !== undefined ? row[c.key] : '')
      return '"' + String(val).replace(/"/g, '""') + '"'
    }).join(';')
  )
  return bom + [header, ...lines].join('\n')
}

app.get('/api/export/demandeurs', requireAuth, (req, res) => {
  const d = readData('demandeurs.json').filter(x => x.statut !== 'archive')
  const cols = [
    { key: 'nud', label: 'NUD' },
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prenom' },
    { key: 'anc', label: 'Anciennete (mois)' },
    { key: 'adultes', label: 'Adultes' },
    { key: 'enfants', label: 'Enfants' },
    { key: 'compo', label: 'Composition' },
    { key: 'typ_v', label: 'Typ. souhaitee' },
    { key: 'rev', label: 'Revenu (EUR)' },
    { key: 'sit', label: 'Situation' },
    { key: 'statut', label: 'Statut' },
    { fn: r => r.dalo ? 'OUI' : '', label: 'DALO' },
    { fn: r => r.violences ? 'OUI' : '', label: 'VIF' },
    { fn: r => r.sans_log ? 'OUI' : '', label: 'Sans logement' },
    { fn: r => r.pieces ? 'OUI' : 'NON', label: 'Dossier complet' }
  ]
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="demandeurs.csv"')
  res.send(toCSV(d, cols))
})

app.get('/api/export/logements', requireAuth, (req, res) => {
  const l = readData('logements.json').filter(x => !x.statut || x.statut === 'vacant')
  const cols = [
    { key: 'ref', label: 'Reference' },
    { key: 'bailleur', label: 'Bailleur' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'quartier', label: 'Quartier' },
    { key: 'typ', label: 'Typ.' },
    { key: 'surface', label: 'Surface m2' },
    { key: 'loyer', label: 'Loyer total (EUR)' },
    { key: 'plafond', label: 'Plafond' },
    { key: 'contingent', label: 'Contingent' },
    { key: 'dispo', label: 'Disponible le' }
  ]
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="logements.csv"')
  res.send(toCSV(l, cols))
})

app.get('/api/export/audiences', requireAuth, (req, res) => {
  const audiences = readData('audiences.json')
  const demandeurs = readData('demandeurs.json')
  const ref = readObj('referentiels.json', { elus: [] })
  const elus = ref.elus || []
  const cols = [
    { key: 'date_audience', label: 'Date' },
    { fn: r => { const d = demandeurs.find(x => x.id === r.dem_id); return d ? d.nom + ' ' + d.prenom : r.dem_id }, label: 'Demandeur' },
    { fn: r => { const e = elus.find(x => x.id === r.elu_id); return e ? e.nom : r.elu_id }, label: 'Elu' },
    { key: 'quartier_origine', label: 'Quartier origine' },
    { key: 'quartier_souhaite', label: 'Quartier souhaite' },
    { fn: r => r.favorable ? 'OUI' : 'NON', label: 'Favorable' },
    { key: 'statut', label: 'Statut' },
    { key: 'quartier_attribue', label: 'Quartier attribue' }
  ]
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="audiences.csv"')
  res.send(toCSV(audiences, cols))
})

// ============================================================
// RAPPORT MENSUEL
// ============================================================

app.get('/api/rapport-mensuel', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const logements = readData('logements.json')
  const audiences = readData('audiences.json')
  const ref = readObj('referentiels.json', { elus: [] })
  const elus = ref.elus || []

  const actifs = demandeurs.filter(d => d.statut === 'active')
  const attribues = audiences.filter(a => a.statut === 'Attribue')

  const statsElus = elus.filter(e => e.actif !== false).map(elu => {
    const eAud = audiences.filter(a => a.elu_id === elu.id)
    const eAttr = eAud.filter(a => a.statut === 'Attribue')
    return {
      id: elu.id,
      nom: elu.nom,
      secteur: elu.secteur,
      nb_audiences: eAud.length,
      nb_favorables: eAud.filter(a => a.favorable).length,
      nb_attributions: eAttr.length,
      taux: eAud.length ? Math.round(eAttr.length / eAud.length * 100) : 0
    }
  }).sort((a, b) => b.nb_attributions - a.nb_attributions)

  const parTyp = { T1: 0, T2: 0, T3: 0, 'T4+': 0 }
  actifs.forEach(d => {
    const k = ['T1', 'T2', 'T3'].includes(d.typ_v) ? d.typ_v : 'T4+'
    parTyp[k]++
  })

  const parQuartier = {}
  actifs.forEach(d => {
    (d.quartiers || []).forEach(q => { parQuartier[q] = (parQuartier[q] || 0) + 1 })
  })

  const nbDalo = attribues.filter(a => {
    const d = demandeurs.find(x => x.id === a.dem_id)
    return d && d.dalo
  }).length

  const urgentsSansProposition = actifs.filter(d =>
    (d.dalo || d.sans_log || d.violences || d.prio_expulsion) &&
    !audiences.some(a => a.dem_id === d.id && a.statut === 'Attribue')
  )

  res.json({
    generated_at: nowDate(),
    nb_demandeurs_actifs: actifs.length,
    nb_logements: logements.filter(l => !l.statut || l.statut === 'vacant').length,
    nb_audiences: audiences.length,
    nb_favorables: audiences.filter(a => a.favorable).length,
    nb_attributions: attribues.length,
    taux_attribution: audiences.length ? Math.round(attribues.length / audiences.length * 100) : 0,
    compliance_dalo: {
      taux: attribues.length ? Math.round(nbDalo / attribues.length * 100) : 0,
      nb: nbDalo,
      objectif: 25,
      ok: attribues.length ? (nbDalo / attribues.length * 100) >= 25 : false
    },
    par_typ: parTyp,
    par_quartier: Object.entries(parQuartier)
      .sort((a, b) => b[1] - a[1])
      .map(([quartier, nb]) => ({ quartier, nb })),
    stats_elus: statsElus,
    urgents_sans_proposition: urgentsSansProposition.slice(0, 10).map(d => ({
      id: d.id, nom: d.nom, prenom: d.prenom, anc: d.anc, nud: d.nud,
      flags: [d.dalo ? 'DALO' : '', d.violences ? 'VIF' : '', d.sans_log ? 'SDF' : '', d.prio_expulsion ? 'Expulsion' : ''].filter(Boolean)
    })),
    nb_urgents_sans_proposition: urgentsSansProposition.length
  })
})

// ============================================================
// RAPPORTS MENSUELS - archivage + envoi Telegram
// ============================================================

/**
 * Genere un rapport pour un mois donne ("YYYY-MM") a partir des decisions,
 * audiences et demandeurs de ce mois-la. Si le rapport existe deja dans
 * /data/rapports/<mois>.json, il est renvoye tel quel (archive immuable).
 */
function parseMois(s) {
  // Format attendu : "2026-04". Par defaut : mois precedent.
  if (!s || !/^\d{4}-\d{2}$/.test(s)) {
    const d = new Date()
    d.setDate(1); d.setMonth(d.getMonth() - 1)
    return d.toISOString().substring(0, 7)
  }
  return s
}

function getRapportsDir() {
  const dir = join(DATA, 'rapports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function estDansMois(dateStr, mois) {
  if (!dateStr) return false
  // Accepte "JJ/MM/AAAA" ou ISO
  let d
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [jj, mm, aaaa] = dateStr.split('/')
    d = new Date(aaaa + '-' + mm + '-' + jj)
  } else {
    d = new Date(dateStr)
  }
  if (isNaN(d.getTime())) return false
  const ym = d.toISOString().substring(0, 7)
  return ym === mois
}

function genererRapportMensuel(mois) {
  const demandeurs = readData('demandeurs.json')
  const logements = readData('logements.json')
  const audiences = readData('audiences.json')
  const decisions = readData('decisions_cal.json')
  const courriers = readData('courriers.json')

  const audMois = audiences.filter(a => estDansMois(a.date_audience, mois))
  const decMois = decisions.filter(d => estDansMois(d.date_cal || d.date, mois))
  const attribuesMois = audMois.filter(a => a.statut === 'Attribue')
  const nvxDemandeurs = demandeurs.filter(d => estDansMois(d.date_depot || d.created_at, mois))

  // Repartition par quartier attribue
  const parQuartierAttr = {}
  attribuesMois.forEach(a => {
    const q = a.quartier_attribue || '-'
    parQuartierAttr[q] = (parQuartierAttr[q] || 0) + 1
  })

  // Repartition par bailleur
  const parBailleur = {}
  decMois.forEach(d => {
    const l = logements.find(x => x.id === d.logement_id)
    if (l) parBailleur[l.bailleur] = (parBailleur[l.bailleur] || 0) + 1
  })

  // Taux effort moyen des attributions
  const tauxEfforts = []
  attribuesMois.forEach(a => {
    const d = demandeurs.find(x => x.id === a.dem_id)
    const l = logements.find(x => x.id === a.logement_id)
    if (d && l && d.rev > 0) tauxEfforts.push((l.loyer / d.rev) * 100)
  })
  const teMoyen = tauxEfforts.length ? (tauxEfforts.reduce((a, b) => a + b, 0) / tauxEfforts.length).toFixed(1) : null

  // DALO
  const daloAttribues = attribuesMois.filter(a => {
    const d = demandeurs.find(x => x.id === a.dem_id)
    return d && d.dalo
  }).length

  // Courriers envoyes
  const courriersMois = courriers.filter(c => estDansMois(c.date, mois))
  const courriersParType = {}
  courriersMois.forEach(c => { courriersParType[c.type] = (courriersParType[c.type] || 0) + 1 })

  // PV signes
  const pvSignes = decMois.filter(d => d.signature && d.signature.signed).length

  return {
    mois,
    generated_at: new Date().toISOString(),
    indicateurs: {
      nb_decisions_cal: decMois.length,
      nb_pv_signes: pvSignes,
      nb_audiences: audMois.length,
      nb_favorables: audMois.filter(a => a.favorable).length,
      nb_attributions: attribuesMois.length,
      nb_nouvelles_demandes: nvxDemandeurs.length,
      taux_effort_moyen: teMoyen,
      nb_dalo_attribues: daloAttribues,
      compliance_dalo_pct: attribuesMois.length ? Math.round(daloAttribues / attribuesMois.length * 100) : 0,
      nb_courriers: courriersMois.length
    },
    repartition: {
      par_quartier_attribue: parQuartierAttr,
      par_bailleur: parBailleur,
      par_type_courrier: courriersParType
    },
    details: {
      attributions: attribuesMois.map(a => {
        const d = demandeurs.find(x => x.id === a.dem_id) || {}
        const l = logements.find(x => x.id === a.logement_id) || {}
        return {
          date: a.date_audience,
          candidat: (d.prenom || '') + ' ' + (d.nom || ''),
          nud: d.nud,
          logement: l.ref,
          adresse: l.adresse,
          bailleur: l.bailleur,
          quartier: l.quartier,
          typ: l.typ,
          loyer: l.loyer,
          dalo: !!d.dalo
        }
      }),
      pv_signes: decMois.filter(d => d.signature && d.signature.signed).map(d => ({
        id: d.id,
        logement: d.logement_ref,
        date: d.date_cal,
        signe_par: d.signature.signed_by_name,
        signe_le: d.signature.signed_at,
        hash: d.signature.content_hash
      }))
    }
  }
}

// Generer + archiver un rapport
app.post('/api/rapports/generer-mensuel', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const mois = parseMois(req.body && req.body.mois)
  const dir = getRapportsDir()
  const path = join(dir, mois + '.json')
  let rapport
  const force = req.body && req.body.force
  if (existsSync(path) && !force) {
    rapport = JSON.parse(readFileSync(path, 'utf8'))
  } else {
    rapport = genererRapportMensuel(mois)
    writeFileSync(path, JSON.stringify(rapport, null, 2), 'utf8')
    addLog(req.user, 'RAPPORT_MENSUEL', 'mois: ' + mois + (force ? ' (force)' : ''))
  }
  res.json(rapport)
})

// Lister les rapports archives
app.get('/api/rapports', requireAuth, (req, res) => {
  const dir = getRapportsDir()
  const fichiers = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse() : []
  res.json(fichiers.map(f => {
    const st = statSync(join(dir, f))
    return { mois: f.replace('.json', ''), size: st.size, mtime: st.mtime }
  }))
})

// Consulter un rapport archive (JSON brut)
app.get('/api/rapports/:mois', requireAuth, (req, res) => {
  const path = join(getRapportsDir(), req.params.mois + '.json')
  if (!existsSync(path)) return res.status(404).json({ error: 'Rapport introuvable' })
  res.json(JSON.parse(readFileSync(path, 'utf8')))
})

// Vue HTML imprimable du rapport
app.get('/api/rapports/:mois/html', requireAuth, (req, res) => {
  const path = join(getRapportsDir(), req.params.mois + '.json')
  if (!existsSync(path)) return res.status(404).json({ error: 'Rapport introuvable' })
  const r = JSON.parse(readFileSync(path, 'utf8'))
  const i = r.indicateurs
  const moisFr = new Date(r.mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const kv = (k, v, unite = '') => '<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">' + k + '</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1e3a8a;text-align:right;">' + (v === null ? '-' : v) + unite + '</td></tr>'

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport mensuel ${r.mois} - Logivia</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; max-width: 860px; margin: 30px auto; padding: 0 24px; }
  h1 { color: #1e3a8a; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; }
  h2 { color: #1e3a8a; margin-top: 28px; font-size: 16pt; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt; }
  th { background: #1e3a8a; color: #fff; padding: 9px; text-align: left; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  .stat { display: inline-block; background: #f1f5f9; padding: 14px 20px; border-radius: 8px; margin: 6px; min-width: 140px; }
  .stat b { display: block; font-size: 22pt; color: #1e3a8a; font-weight: 800; }
  .stat span { font-size: 10pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .footer { margin-top: 40px; font-size: 10pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:10px;">
  <button onclick="window.print()" style="padding:8px 16px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;">Imprimer / PDF</button>
</div>
<h1>Rapport mensuel &mdash; ${moisFr}</h1>
<p style="color:#64748b;font-size:11pt;">Mairie de Saint-Denis de la Reunion &middot; Service Habitat &middot; Logivia v3.1<br>
Genere le ${new Date(r.generated_at).toLocaleString('fr-FR')}</p>

<h2>Indicateurs cles</h2>
<div>
  <div class="stat"><b>${i.nb_attributions}</b><span>Attributions</span></div>
  <div class="stat"><b>${i.nb_decisions_cal}</b><span>Decisions CAL</span></div>
  <div class="stat"><b>${i.nb_pv_signes}</b><span>PV signes</span></div>
  <div class="stat"><b>${i.nb_audiences}</b><span>Audiences</span></div>
  <div class="stat"><b>${i.nb_nouvelles_demandes}</b><span>Nouvelles demandes</span></div>
  <div class="stat"><b>${i.compliance_dalo_pct}%</b><span>Conformite DALO</span></div>
</div>

<h2>Synthese</h2>
<table>
${kv('Nombre de CAL tenues', i.nb_decisions_cal)}
${kv('PV signes electroniquement', i.nb_pv_signes)}
${kv('Audiences elus', i.nb_audiences)}
${kv('Audiences favorables', i.nb_favorables)}
${kv('Attributions', i.nb_attributions)}
${kv('Nouvelles demandes deposees', i.nb_nouvelles_demandes)}
${kv('Taux effort moyen des attributions', i.taux_effort_moyen, '%')}
${kv('DALO attribues', i.nb_dalo_attribues)}
${kv('Conformite DALO (objectif 25%)', i.compliance_dalo_pct, '%')}
${kv('Courriers envoyes', i.nb_courriers)}
</table>

<h2>Repartition par quartier (attributions)</h2>
<table>
<tr><th>Quartier</th><th style="text-align:right;">Nb</th></tr>
${Object.entries(r.repartition.par_quartier_attribue).sort((a, b) => b[1] - a[1]).map(([q, n]) => '<tr><td>' + q + '</td><td style="text-align:right;font-weight:700;">' + n + '</td></tr>').join('') || '<tr><td colspan="2" style="color:#94a3b8;">Aucune attribution ce mois</td></tr>'}
</table>

<h2>Repartition par bailleur</h2>
<table>
<tr><th>Bailleur</th><th style="text-align:right;">Nb decisions</th></tr>
${Object.entries(r.repartition.par_bailleur).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<tr><td>' + k + '</td><td style="text-align:right;font-weight:700;">' + n + '</td></tr>').join('') || '<tr><td colspan="2" style="color:#94a3b8;">-</td></tr>'}
</table>

<h2>Detail des attributions (${r.details.attributions.length})</h2>
<table>
<tr><th>Date</th><th>Candidat</th><th>Logement</th><th>Quartier</th><th>Bailleur</th><th>Loyer</th><th>DALO</th></tr>
${r.details.attributions.map(a => '<tr><td>' + (a.date || '-') + '</td><td>' + (a.candidat || '-') + '</td><td>' + (a.logement || '-') + ' (' + (a.typ || '-') + ')</td><td>' + (a.quartier || '-') + '</td><td>' + (a.bailleur || '-') + '</td><td style="text-align:right;">' + (a.loyer || 0) + ' EUR</td><td>' + (a.dalo ? 'Oui' : '-') + '</td></tr>').join('') || '<tr><td colspan="7" style="color:#94a3b8;">Aucune attribution</td></tr>'}
</table>

<h2>PV signes electroniquement (${r.details.pv_signes.length})</h2>
<table>
<tr><th>Date CAL</th><th>PV</th><th>Signataire</th><th>Horodatage</th><th>Hash</th></tr>
${r.details.pv_signes.map(p => '<tr><td>' + (p.date || '-') + '</td><td>' + (p.logement || p.id) + '</td><td>' + (p.signe_par || '-') + '</td><td style="font-size:10pt;">' + new Date(p.signe_le).toLocaleString('fr-FR') + '</td><td style="font-family:monospace;font-size:9pt;">' + (p.hash || '').substring(0, 20) + '...</td></tr>').join('') || '<tr><td colspan="5" style="color:#94a3b8;">Aucun PV signe</td></tr>'}
</table>

<div class="footer">
  Rapport archive dans Logivia. Conforme au Code de la construction et de l habitation (art. L441-2-1).<br>
  Mairie de Saint-Denis de la Reunion - 2 rue de Paris, 97400 Saint-Denis.
</div>
</body>
</html>`
  res.type('html').send(html)
})

// Envoi du digest mensuel sur Telegram (destinataires : directeur + agents connectes)
app.post('/api/rapports/:mois/envoyer-telegram', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  const path = join(getRapportsDir(), req.params.mois + '.json')
  if (!existsSync(path)) return res.status(404).json({ error: 'Rapport introuvable' })
  const r = JSON.parse(readFileSync(path, 'utf8'))
  const i = r.indicateurs
  const moisFr = new Date(r.mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const msg = '<b>[RAPPORT] Rapport mensuel - ' + moisFr + '</b>\n' +
    '<i>Mairie de Saint-Denis (974) - Service Habitat</i>\n\n' +
    '<b>Indicateurs cles</b>\n' +
    '- Attributions : <b>' + i.nb_attributions + '</b>\n' +
    '- CAL tenues : ' + i.nb_decisions_cal + ' (dont ' + i.nb_pv_signes + ' PV signes)\n' +
    '- Audiences : ' + i.nb_audiences + ' (favorables : ' + i.nb_favorables + ')\n' +
    '- Nouvelles demandes : ' + i.nb_nouvelles_demandes + '\n' +
    '- Taux effort moyen : ' + (i.taux_effort_moyen || '-') + '%\n' +
    '- Conformite DALO : <b>' + i.compliance_dalo_pct + '%</b> ' + (i.compliance_dalo_pct >= 25 ? '[OK]' : '[KO]') + '\n' +
    '- Courriers : ' + i.nb_courriers + '\n\n' +
    '<i>Rapport complet disponible dans Logivia.</i>'

  // Destinataires : tous les users (agent/directeur) avec chat_id
  const users = readData('users.json').filter(u => (u.role === 'directeur' || u.role === 'agent') && u.actif)
  const chats = users.map(u => tgGetChatId('user_' + u.id)).filter(Boolean)
  // Fallback : aussi les elus si demande
  if (req.body && req.body.inclure_elus) {
    const elus = readObj('referentiels.json', { elus: [] }).elus || []
    elus.forEach(e => { const c = tgGetChatId('elu_' + e.id); if (c) chats.push(c) })
  }

  let envoyes = 0
  for (const chat of chats) {
    const ok = await tgSend(chat, msg)
    if (ok) envoyes++
  }

  addLog(req.user, 'RAPPORT_TELEGRAM', 'mois: ' + r.mois + ' - envois: ' + envoyes + '/' + chats.length)
  res.json({ ok: true, envoyes, total: chats.length })
})

// Cron endpoint : appelable par un scheduler externe pour generer auto le rapport
// du mois precedent le 1er de chaque mois. Protege par secret en query.
app.post('/api/rapports/cron', (req, res) => {
  const secret = req.query.secret || (req.body && req.body.secret)
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Secret cron invalide' })
  }
  const d = new Date()
  d.setDate(1); d.setMonth(d.getMonth() - 1)
  const mois = d.toISOString().substring(0, 7)
  const dir = getRapportsDir()
  const path = join(dir, mois + '.json')
  const rapport = genererRapportMensuel(mois)
  writeFileSync(path, JSON.stringify(rapport, null, 2), 'utf8')
  // Envoi Telegram automatique
  const users = readData('users.json').filter(u => (u.role === 'directeur' || u.role === 'agent') && u.actif)
  const chats = users.map(u => tgGetChatId('user_' + u.id)).filter(Boolean)
  const i = rapport.indicateurs
  const moisFr = new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const msg = '<b>[AUTO] Rapport mensuel - ' + moisFr + '</b>\n' +
    '- Attributions : <b>' + i.nb_attributions + '</b>\n' +
    '- CAL : ' + i.nb_decisions_cal + ' (PV signes : ' + i.nb_pv_signes + ')\n' +
    '- Conformite DALO : ' + i.compliance_dalo_pct + '%'
  Promise.all(chats.map(c => tgSend(c, msg))).then(r2 => {
    console.log('[cron rapport] mois ' + mois + ' - envois Telegram : ' + r2.filter(Boolean).length + '/' + chats.length)
  }).catch(e => console.error('[cron rapport] ', e.message))
  res.json({ ok: true, mois, indicateurs: rapport.indicateurs, destinataires: chats.length })
})

// ============================================================
// PORTAIL CANDIDAT v2 (public) - auth renforcee, pieces, propositions,
// renouvellement, attestation PDF
// ============================================================

const CONTACT_974 = {
  service: 'Service Habitat - Mairie de Saint-Denis',
  adresse: '2 rue de Paris, 97400 Saint-Denis',
  tel: '0262 40 01 67',
  horaires: 'Lun-Ven 8h00-16h00',
  email: 'habitat@saintdenis.re'
}

// Liste officielle des pieces attendues pour un dossier de logement social
const PIECES_ATTENDUES = [
  { code: 'cni', libelle: 'Piece d identite (CNI / passeport / titre de sejour)', obligatoire: true, duree_validite_mois: 60 },
  { code: 'livret_famille', libelle: 'Livret de famille', obligatoire: false },
  { code: 'acte_naissance', libelle: 'Acte(s) de naissance des enfants', obligatoire: false },
  { code: 'avis_imposition_n1', libelle: 'Avis d imposition N-1', obligatoire: true, duree_validite_mois: 12 },
  { code: 'avis_imposition_n2', libelle: 'Avis d imposition N-2', obligatoire: true, duree_validite_mois: 24 },
  { code: 'justificatif_domicile', libelle: 'Justificatif de domicile (moins de 3 mois)', obligatoire: true, duree_validite_mois: 3 },
  { code: 'bulletins_salaire', libelle: '3 derniers bulletins de salaire', obligatoire: false, duree_validite_mois: 3 },
  { code: 'attestation_pole_emploi', libelle: 'Attestation Pole Emploi / France Travail', obligatoire: false, duree_validite_mois: 3 },
  { code: 'attestation_caf', libelle: 'Attestation CAF', obligatoire: false, duree_validite_mois: 3 },
  { code: 'jugement_divorce', libelle: 'Jugement de divorce / separation', obligatoire: false },
  { code: 'attestation_handicap', libelle: 'Reconnaissance MDPH / handicap', obligatoire: false },
  { code: 'attestation_grossesse', libelle: 'Certificat de grossesse', obligatoire: false },
  { code: 'decision_dalo', libelle: 'Decision DALO', obligatoire: false },
  { code: 'autre', libelle: 'Autre piece', obligatoire: false }
]

// --- SESSIONS PORTAIL ---
// Sessions courtes (30 min) indexees par token opaque
const PORTAIL_SESSIONS = new Map()
const PORTAIL_TTL_MS = 30 * 60 * 1000

function nettoyerSessionsExpirees() {
  const now = Date.now()
  for (const [tok, s] of PORTAIL_SESSIONS.entries()) {
    if (s.expire_at < now) PORTAIL_SESSIONS.delete(tok)
  }
}

function normNud(s) { return (s || '').toLowerCase().replace(/[\s-]/g, '') }
function normDate(s) {
  if (!s) return ''
  // Accepte YYYY-MM-DD ou JJ/MM/AAAA et renvoie YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return m[3] + '-' + m[2] + '-' + m[1]
  return s
}

function findDemByNud(nud) {
  const demandeurs = readData('demandeurs.json')
  return demandeurs.find(d => d.nud && normNud(d.nud) === normNud(nud))
}

function requirePortailAuth(req, res, next) {
  nettoyerSessionsExpirees()
  const tok = req.headers['x-portail-token'] || (req.query && req.query.token)
  if (!tok) return res.status(401).json({ error: 'Non authentifie' })
  const sess = PORTAIL_SESSIONS.get(tok)
  if (!sess) return res.status(401).json({ error: 'Session expiree' })
  // Rafraichit le TTL a chaque requete
  sess.expire_at = Date.now() + PORTAIL_TTL_MS
  req.portailDem = sess.dem_id
  next()
}

// Auth portail : NUD + date de naissance
app.post('/api/portail/auth', rlPortailAuth, (req, res) => {
  const { nud, date_naissance } = req.body || {}
  if (!nud) return res.status(400).json({ error: 'NUD requis' })
  const dem = findDemByNud(nud)
  if (!dem) return res.status(404).json({ error: 'Dossier introuvable' })

  // Si le demandeur n a pas de date de naissance dans sa fiche, on accepte
  // NUD seul (mode "compat"). Sinon on exige la correspondance exacte.
  if (dem.date_naissance) {
    if (!date_naissance) {
      return res.status(400).json({ error: 'Date de naissance requise', need_dob: true })
    }
    if (normDate(date_naissance) !== normDate(dem.date_naissance)) {
      addLog(null, 'PORTAIL_AUTH_KO', 'nud: ' + nud + ' (dob mismatch)')
      return res.status(401).json({ error: 'Informations incorrectes' })
    }
  }

  const token = randomBytes(24).toString('hex')
  PORTAIL_SESSIONS.set(token, {
    dem_id: dem.id,
    nud: dem.nud,
    expire_at: Date.now() + PORTAIL_TTL_MS
  })
  addLog(null, 'PORTAIL_AUTH_OK', 'nud: ' + dem.nud)
  res.json({
    ok: true,
    token,
    expires_in: PORTAIL_TTL_MS / 1000,
    need_dob_setup: !dem.date_naissance
  })
})

// Deconnexion
app.post('/api/portail/logout', requirePortailAuth, (req, res) => {
  const tok = req.headers['x-portail-token']
  PORTAIL_SESSIONS.delete(tok)
  res.json({ ok: true })
})

// Dossier complet du candidat authentifie (remplace l ancien dossier public)
app.get('/api/portail/dossier', requirePortailAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const audiences = readData('audiences.json')
  const decisions = readData('decisions_cal.json')
  const propositions = readData('propositions.json')
  const dem = demandeurs.find(d => d.id === req.portailDem)
  if (!dem) return res.status(404).json({ error: 'Dossier introuvable' })

  const audPubliques = audiences
    .filter(a => a.dem_id === dem.id)
    .map(a => ({ date: a.date_audience, type: 'Audience elu', favorable: a.favorable, statut: a.statut, quartier_attribue: a.quartier_attribue || null }))

  const decPubliques = decisions
    .filter(d => (d.candidats || []).some(c => c.dem_id === dem.id))
    .map(d => {
      const c = d.candidats.find(x => x.dem_id === dem.id)
      return { date: d.date_cal, logement_ref: d.logement_ref, decision: c ? c.decision : 'Examine' }
    })

  let etape = 1
  let statut = 'En cours d instruction'
  if (dem.statut === 'attribue') { etape = 4; statut = 'Logement attribue' }
  else if (audPubliques.some(a => a.statut === 'Attribue')) { etape = 4; statut = 'Attribution en cours' }
  else if (audPubliques.some(a => a.favorable)) { etape = 3; statut = 'Proposition attendue' }
  else if (audPubliques.length > 0) { etape = 2; statut = 'Suivi actif' }

  const historique = [
    ...(dem.parcours || []).map(p => ({ date: p.date, type: p.type })),
    ...audPubliques.map(a => ({ date: a.date, type: 'Audience elu - ' + (a.favorable ? 'Favorable' : 'Neutre') })),
    ...decPubliques.map(d => ({ date: d.date, type: 'Commission CAL - ' + d.decision }))
  ]

  // Renouvellement : base = date_depot ou created_at ou premier parcours
  const dateBase = dem.dernier_renouvellement || dem.date_depot || (dem.parcours && dem.parcours[0] && dem.parcours[0].date) || null
  let renouvellement = null
  if (dateBase) {
    const d = /^\d{2}\/\d{2}\/\d{4}$/.test(dateBase)
      ? new Date(dateBase.split('/').reverse().join('-'))
      : new Date(dateBase)
    if (!isNaN(d.getTime())) {
      const limite = new Date(d)
      limite.setFullYear(limite.getFullYear() + 1)
      const joursRestants = Math.ceil((limite.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      renouvellement = {
        date_base: d.toISOString().substring(0, 10),
        date_limite: limite.toISOString().substring(0, 10),
        jours_restants: joursRestants,
        urgent: joursRestants <= 60,
        expire: joursRestants <= 0
      }
    }
  }

  // Propositions en attente de reponse
  const propsAttente = propositions.filter(p => p.dem_id === dem.id && p.statut === 'en_attente')

  res.json({
    id: dem.id,
    nud: dem.nud,
    prenom: dem.prenom,
    nom_initial: dem.nom ? dem.nom[0] + '.' : '',
    nom: dem.nom,
    anc_mois: dem.anc || 0,
    typ_souhaitee: dem.typ_v,
    statut,
    etape,
    pieces_ok: !!dem.pieces,
    date_naissance_ok: !!dem.date_naissance,
    historique,
    actions_requises: [
      !dem.pieces && 'Pieces justificatives incompletes - utilisez le module pieces pour les deposer',
      renouvellement && renouvellement.urgent && !renouvellement.expire && 'Renouvellement de demande a effectuer dans ' + renouvellement.jours_restants + ' jours',
      renouvellement && renouvellement.expire && 'Renouvellement EN RETARD - risque de radiation',
      propsAttente.length > 0 && 'Vous avez ' + propsAttente.length + ' proposition(s) a traiter'
    ].filter(Boolean),
    renouvellement,
    propositions_en_attente: propsAttente.length,
    contact: CONTACT_974
  })
})

// --- PIECES JUSTIFICATIVES ---

function getPiecesDir(demId) {
  const dir = join(DATA, 'pieces', demId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

app.get('/api/portail/pieces', requirePortailAuth, (req, res) => {
  const pieces = readData('pieces_justificatives.json')
  const dem = readData('demandeurs.json').find(d => d.id === req.portailDem)
  const miennes = pieces.filter(p => p.dem_id === req.portailDem).map(p => ({
    id: p.id,
    code: p.code,
    libelle_type: (PIECES_ATTENDUES.find(x => x.code === p.code) || {}).libelle || p.code,
    filename: p.filename,
    mimetype: p.mimetype,
    size: p.size,
    uploaded_at: p.uploaded_at,
    statut: p.statut,
    motif_rejet: p.motif_rejet || null,
    validee_le: p.validee_le || null
  }))
  res.json({
    pieces_attendues: PIECES_ATTENDUES,
    pieces_deposees: miennes,
    pieces_manquantes: PIECES_ATTENDUES.filter(a => a.obligatoire && !miennes.some(m => m.code === a.code && m.statut !== 'refusee')),
    pieces_globalement_ok: !!(dem && dem.pieces)
  })
})

app.post('/api/portail/pieces/upload', rlUpload, requirePortailAuth, (req, res) => {
  const { code, filename, mimetype, contenu_base64 } = req.body || {}
  if (!code) return res.status(400).json({ error: 'Code piece requis' })
  if (!PIECES_ATTENDUES.find(p => p.code === code)) return res.status(400).json({ error: 'Type de piece inconnu' })
  if (!contenu_base64 || typeof contenu_base64 !== 'string') return res.status(400).json({ error: 'Contenu manquant' })

  const buf = Buffer.from(contenu_base64.replace(/^data:[^;]+;base64,/, ''), 'base64')
  if (buf.length > 8 * 1024 * 1024) return res.status(400).json({ error: 'Fichier trop volumineux (max 8 Mo)' })
  if (buf.length < 100) return res.status(400).json({ error: 'Fichier vide ou corrompu' })

  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
  if (mimetype && !allowedMimes.includes(mimetype)) {
    return res.status(400).json({ error: 'Type de fichier non autorise (PDF, JPG, PNG uniquement)' })
  }

  const all = readData('pieces_justificatives.json')
  const id = 'P' + Date.now() + randomBytes(3).toString('hex')
  const ext = (filename || '').split('.').pop() || (mimetype === 'application/pdf' ? 'pdf' : 'jpg')
  const safeName = id + '.' + ext.toLowerCase().replace(/[^a-z0-9]/g, '')
  const dir = getPiecesDir(req.portailDem)
  writeFileSync(join(dir, safeName), buf)

  const piece = {
    id,
    dem_id: req.portailDem,
    code,
    filename: filename || safeName,
    stored_name: safeName,
    mimetype: mimetype || 'application/octet-stream',
    size: buf.length,
    uploaded_at: new Date().toISOString(),
    uploaded_by: 'candidat',
    statut: 'en_attente',
    motif_rejet: null
  }
  all.push(piece)
  writeData('pieces_justificatives.json', all)

  // Ajouter un parcours dans le demandeur
  const demandeurs = readData('demandeurs.json')
  const idx = demandeurs.findIndex(d => d.id === req.portailDem)
  if (idx !== -1) {
    if (!demandeurs[idx].parcours) demandeurs[idx].parcours = []
    demandeurs[idx].parcours.push({
      date: nowDate(),
      type: 'Depot de piece',
      detail: 'Via portail : ' + (PIECES_ATTENDUES.find(x => x.code === code) || {}).libelle
    })
    writeData('demandeurs.json', demandeurs)
  }

  addLog(null, 'PORTAIL_UPLOAD_PIECE', 'dem: ' + req.portailDem + ' - ' + code + ' - ' + buf.length + ' octets')
  res.json({ ok: true, piece })
})

app.delete('/api/portail/pieces/:id', requirePortailAuth, (req, res) => {
  const all = readData('pieces_justificatives.json')
  const idx = all.findIndex(p => p.id === req.params.id && p.dem_id === req.portailDem)
  if (idx === -1) return res.status(404).json({ error: 'Piece introuvable' })
  if (all[idx].statut === 'validee') return res.status(403).json({ error: 'Piece deja validee - impossible de supprimer' })
  // Supprimer le fichier physique
  try { unlinkSync(join(getPiecesDir(req.portailDem), all[idx].stored_name)) } catch (e) { }
  const removed = all.splice(idx, 1)[0]
  writeData('pieces_justificatives.json', all)
  addLog(null, 'PORTAIL_DELETE_PIECE', 'dem: ' + req.portailDem + ' - ' + removed.code)
  res.json({ ok: true })
})

// Telechargement par le candidat de sa propre piece
app.get('/api/portail/pieces/:id/fichier', requirePortailAuth, (req, res) => {
  const all = readData('pieces_justificatives.json')
  const p = all.find(x => x.id === req.params.id && x.dem_id === req.portailDem)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  const path = join(getPiecesDir(req.portailDem), p.stored_name)
  if (!existsSync(path)) return res.status(404).json({ error: 'Fichier physique absent' })
  res.type(p.mimetype || 'application/octet-stream')
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(p.filename) + '"')
  res.send(readFileSync(path))
})

// --- COTE AGENT : validation / rejet des pieces ---

app.get('/api/pieces/:dem_id', requireAuth, (req, res) => {
  const pieces = readData('pieces_justificatives.json').filter(p => p.dem_id === req.params.dem_id)
  res.json({
    pieces_attendues: PIECES_ATTENDUES,
    pieces: pieces.map(p => ({
      ...p,
      libelle_type: (PIECES_ATTENDUES.find(x => x.code === p.code) || {}).libelle || p.code
    }))
  })
})

app.get('/api/pieces/:dem_id/:id/fichier', requireAuth, (req, res) => {
  const p = readData('pieces_justificatives.json').find(x => x.id === req.params.id && x.dem_id === req.params.dem_id)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  const path = join(getPiecesDir(req.params.dem_id), p.stored_name)
  if (!existsSync(path)) return res.status(404).json({ error: 'Fichier physique absent' })
  res.type(p.mimetype || 'application/octet-stream')
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(p.filename) + '"')
  res.send(readFileSync(path))
})

app.post('/api/pieces/:id/valider', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const all = readData('pieces_justificatives.json')
  const idx = all.findIndex(p => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Piece introuvable' })
  all[idx].statut = 'validee'
  all[idx].validee_le = new Date().toISOString()
  all[idx].validee_par = req.user.prenom + ' ' + req.user.nom
  all[idx].motif_rejet = null
  writeData('pieces_justificatives.json', all)
  addLog(req.user, 'PIECE_VALIDEE', all[idx].id + ' / ' + all[idx].code)
  res.json(all[idx])
})

app.post('/api/pieces/:id/refuser', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { motif } = req.body || {}
  if (!motif) return res.status(400).json({ error: 'Motif de refus requis' })
  const all = readData('pieces_justificatives.json')
  const idx = all.findIndex(p => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Piece introuvable' })
  all[idx].statut = 'refusee'
  all[idx].motif_rejet = motif
  all[idx].validee_le = new Date().toISOString()
  all[idx].validee_par = req.user.prenom + ' ' + req.user.nom
  writeData('pieces_justificatives.json', all)
  addLog(req.user, 'PIECE_REFUSEE', all[idx].id + ' / ' + motif)
  res.json(all[idx])
})

// --- PROPOSITIONS : accepter / refuser cote candidat ---

app.get('/api/portail/propositions', requirePortailAuth, (req, res) => {
  const props = readData('propositions.json').filter(p => p.dem_id === req.portailDem)
  const logements = readData('logements.json')
  const enrichies = props.map(p => {
    const l = logements.find(x => x.id === p.logement_id) || {}
    return {
      ...p,
      logement: {
        ref: l.ref, adresse: l.adresse, quartier: l.quartier, typ: l.typ,
        surface: l.surface, loyer: l.loyer, bailleur: l.bailleur, operation: l.operation
      }
    }
  }).sort((a, b) => (b.date_proposition || '').localeCompare(a.date_proposition || ''))
  res.json(enrichies)
})

app.post('/api/portail/proposition/:id/repondre', requirePortailAuth, (req, res) => {
  const { reponse, motif } = req.body || {}
  if (!['acceptee', 'refusee'].includes(reponse)) return res.status(400).json({ error: 'Reponse invalide' })
  if (reponse === 'refusee' && !motif) return res.status(400).json({ error: 'Motif requis pour un refus' })

  const all = readData('propositions.json')
  const idx = all.findIndex(p => p.id === req.params.id && p.dem_id === req.portailDem)
  if (idx === -1) return res.status(404).json({ error: 'Proposition introuvable' })
  if (all[idx].statut !== 'en_attente') return res.status(409).json({ error: 'Cette proposition est deja traitee' })

  // Verifier le delai
  if (all[idx].deadline && new Date(all[idx].deadline) < new Date()) {
    all[idx].statut = 'expiree'
    writeData('propositions.json', all)
    return res.status(410).json({ error: 'Delai depasse - la proposition a expire' })
  }

  all[idx].statut = reponse
  all[idx].motif_refus = motif || null
  all[idx].repondu_le = new Date().toISOString()
  all[idx].repondu_par = 'candidat_portail'
  writeData('propositions.json', all)

  // Trace parcours
  const demandeurs = readData('demandeurs.json')
  const di = demandeurs.findIndex(d => d.id === req.portailDem)
  if (di !== -1) {
    if (!demandeurs[di].parcours) demandeurs[di].parcours = []
    demandeurs[di].parcours.push({
      date: nowDate(),
      type: 'Reponse proposition',
      detail: reponse === 'acceptee' ? 'Proposition acceptee via portail' : 'Refus via portail - ' + motif
    })
    writeData('demandeurs.json', demandeurs)
  }
  addLog(null, 'PORTAIL_PROPOSITION_' + reponse.toUpperCase(), 'prop: ' + all[idx].id)
  res.json({ ok: true, proposition: all[idx] })
})

// Cote agent : creer une proposition pour un demandeur (apres CAL favorable)
app.post('/api/propositions', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { dem_id, logement_id, decision_cal_id } = req.body || {}
  if (!dem_id || !logement_id) return res.status(400).json({ error: 'dem_id et logement_id requis' })
  const all = readData('propositions.json')
  const deadline = new Date(); deadline.setDate(deadline.getDate() + 10)
  const prop = {
    id: 'PROP' + Date.now() + randomBytes(3).toString('hex'),
    dem_id, logement_id, decision_cal_id: decision_cal_id || null,
    date_proposition: new Date().toISOString(),
    deadline: deadline.toISOString(),
    statut: 'en_attente',
    cree_par: req.user.prenom + ' ' + req.user.nom
  }
  all.push(prop)
  writeData('propositions.json', all)
  addLog(req.user, 'PROPOSITION_CREEE', prop.id + ' dem: ' + dem_id)
  res.json(prop)
})

// Liste cote agent
app.get('/api/propositions', requireAuth, (req, res) => {
  const all = readData('propositions.json')
  res.json(all)
})

// --- RENOUVELLEMENT ---

app.post('/api/portail/renouveler', requirePortailAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const idx = demandeurs.findIndex(d => d.id === req.portailDem)
  if (idx === -1) return res.status(404).json({ error: 'Dossier introuvable' })

  const now = new Date()
  demandeurs[idx].dernier_renouvellement = now.toISOString().substring(0, 10)
  if (!demandeurs[idx].parcours) demandeurs[idx].parcours = []
  demandeurs[idx].parcours.push({
    date: nowDate(),
    type: 'Renouvellement',
    detail: 'Renouvellement de la demande via portail candidat'
  })
  writeData('demandeurs.json', demandeurs)
  addLog(null, 'PORTAIL_RENOUVELLEMENT', 'dem: ' + req.portailDem)

  const limite = new Date(now); limite.setFullYear(limite.getFullYear() + 1)
  res.json({
    ok: true,
    renouvelle_le: now.toISOString().substring(0, 10),
    prochaine_echeance: limite.toISOString().substring(0, 10)
  })
})

// --- DEFINITION DATE DE NAISSANCE (premiere connexion en mode compat) ---

app.post('/api/portail/date-naissance', requirePortailAuth, (req, res) => {
  const { date_naissance } = req.body || {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_naissance || '')) return res.status(400).json({ error: 'Format attendu : YYYY-MM-DD' })
  const demandeurs = readData('demandeurs.json')
  const idx = demandeurs.findIndex(d => d.id === req.portailDem)
  if (idx === -1) return res.status(404).json({ error: 'Dossier introuvable' })
  if (demandeurs[idx].date_naissance) {
    // Une fois definie, seul un agent peut la modifier (securite)
    return res.status(403).json({ error: 'Date de naissance deja definie - contactez le service habitat pour toute modification' })
  }
  demandeurs[idx].date_naissance = date_naissance
  writeData('demandeurs.json', demandeurs)
  addLog(null, 'PORTAIL_DOB_SET', 'dem: ' + req.portailDem)
  res.json({ ok: true })
})

// --- ATTESTATION OFFICIELLE PDF (HTML imprimable) ---

app.get('/api/portail/attestation', requirePortailAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === req.portailDem)
  if (!dem) return res.status(404).json({ error: 'Dossier introuvable' })

  const users = readData('users.json')
  const directeur = users.find(u => u.role === 'directeur' && u.actif) || { nom: '[Directeur]', prenom: '' }

  const now = new Date()
  const dateFr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const refAttest = 'ATT-' + dem.nud + '-' + now.toISOString().substring(0, 10).replace(/-/g, '')
  const hash = createHash('sha256').update(refAttest + '|' + dem.id + '|' + now.toISOString(), 'utf8').digest('hex').substring(0, 24)

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Attestation demande de logement - ${dem.nud}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; max-width: 800px; margin: 40px auto; padding: 0 30px; line-height: 1.6; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 30px; }
  .logo { width: 80px; height: 80px; background: linear-gradient(135deg,#1e3a8a,#E05C2A); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 28px; font-family: 'Helvetica Neue', Arial; }
  .titre-ville { color: #1e3a8a; font-size: 20pt; font-weight: 800; margin: 0; }
  .sous-titre { color: #64748b; font-size: 10pt; margin: 4px 0 0; }
  h1 { text-align: center; color: #1e3a8a; font-size: 22pt; margin: 30px 0 20px; text-transform: uppercase; letter-spacing: 0.04em; }
  .ref { text-align: right; font-size: 10pt; color: #64748b; font-family: monospace; }
  .corps { font-size: 12pt; text-align: justify; }
  .info-box { background: #f1f5f9; border-left: 4px solid #1e3a8a; padding: 14px 18px; margin: 20px 0; border-radius: 4px; }
  .info-box dt { font-weight: 700; display: inline-block; min-width: 180px; color: #1e3a8a; }
  .signature-zone { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; }
  .cachet { width: 160px; height: 160px; border: 3px solid #E05C2A; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #E05C2A; font-family: 'Helvetica Neue', Arial; font-weight: 700; text-align: center; font-size: 9pt; line-height: 1.2; transform: rotate(-8deg); }
  .cachet .ville { font-size: 11pt; margin-bottom: 2px; }
  .cachet .type { font-size: 8pt; margin-top: 4px; }
  .sig { width: 260px; text-align: center; }
  .sig .nom { font-weight: 700; color: #111; margin-top: 36px; border-top: 1px solid #94A3B8; padding-top: 6px; }
  .footer { margin-top: 50px; font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; line-height: 1.5; }
  .hash { font-family: monospace; font-size: 8pt; color: #94a3b8; word-break: break-all; }
  @media print { body { margin: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:10px;">
  <button onclick="window.print()" style="padding:8px 16px;background:#1e3a8a;color:#fff;border:none;border-radius:6px;cursor:pointer;">Telecharger PDF</button>
</div>

<div class="entete">
  <div style="display:flex;gap:14px;align-items:center;">
    <div class="logo">SD</div>
    <div>
      <h2 class="titre-ville">Mairie de Saint-Denis</h2>
      <div class="sous-titre">Commune chef-lieu - La Reunion (974)<br>Service Habitat &middot; 2 rue de Paris, 97400 Saint-Denis</div>
    </div>
  </div>
  <div class="ref">
    Reference :<br><b>${refAttest}</b><br>
    Date : ${dateFr}
  </div>
</div>

<h1>Attestation de demande de logement social</h1>

<div class="corps">
<p>Le Service Habitat de la Mairie de Saint-Denis de la Reunion certifie que&nbsp;:</p>

<div class="info-box">
<dt>Identite :</dt> Monsieur / Madame <b>${escapeHtml(dem.prenom || '')} ${escapeHtml(dem.nom || '')}</b><br>
<dt>Numero Unique (NUD) :</dt> <b>${escapeHtml(dem.nud || '')}</b><br>
<dt>Date de depot :</dt> ${escapeHtml(dem.date_depot || (dem.parcours && dem.parcours[0] && dem.parcours[0].date) || '-')}<br>
<dt>Anciennete :</dt> <b>${dem.anc || 0} mois</b><br>
<dt>Typologie demandee :</dt> ${escapeHtml(dem.typ_v || '-')}<br>
<dt>Composition du foyer :</dt> ${escapeHtml(dem.compo || '-')}
</div>

<p>a <b>depose une demande de logement social aupres de la Mairie de Saint-Denis de la Reunion</b> et que cette demande est actuellement <b>en cours d instruction</b>, enregistree dans le systeme Logivia et transmise au Systeme National d Enregistrement conformement a la reglementation en vigueur.</p>

<p>La presente attestation est delivree a l interesse(e) pour valoir ce que de droit.</p>

<p style="margin-top:30px;">Fait a Saint-Denis, le ${dateFr}.</p>
</div>

<div class="signature-zone">
  <div class="cachet">
    <div>MAIRIE DE</div>
    <div class="ville">SAINT-DENIS</div>
    <div>LA REUNION (974)</div>
    <div class="type">SERVICE HABITAT</div>
  </div>
  <div class="sig">
    Pour le Maire et par delegation,<br>
    Le Directeur du Service Habitat
    <div class="nom">${escapeHtml((directeur.prenom || '') + ' ' + (directeur.nom || ''))}</div>
  </div>
</div>

<div class="footer">
  Document officiel delivre par la Mairie de Saint-Denis de la Reunion - Service Habitat.<br>
  Cette attestation est authentifiee par un identifiant unique : <span class="hash">${hash}</span><br>
  Sa validite peut etre verifiee aupres du service emetteur (0262 40 01 67) ou sur le portail Logivia.
</div>

</body>
</html>`
  res.type('html').send(html)
})

// ============================================================
// RGPD PORTAIL : droit d acces (art. 15), demande effacement/rectification (art. 16/17/18)
// ============================================================

// Art. 15 : export complet des donnees du candidat (JSON)
app.get('/api/portail/mes-donnees', requirePortailAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const audiences = readData('audiences.json')
  const decisions = readData('decisions_cal.json')
  const propositions = readData('propositions.json')
  const pieces = readData('pieces_justificatives.json')
  const rgpdReqs = readData('rgpd_demandes.json')

  const dem = demandeurs.find(d => d.id === req.portailDem)
  if (!dem) return res.status(404).json({ error: 'Dossier introuvable' })

  const mesAudiences = audiences.filter(a => a.dem_id === dem.id)
  const mesDecisions = decisions.filter(d => (d.candidats || []).some(c => c.dem_id === dem.id))
  const mesPropositions = propositions.filter(p => p.dem_id === dem.id)
  const mesPieces = pieces.filter(p => p.dem_id === dem.id).map(p => {
    const { contenu_base64, ...rest } = p  // on n envoie pas le contenu binaire
    return rest
  })
  const mesDemandesRgpd = rgpdReqs.filter(r => r.dem_id === dem.id)

  addLog(null, 'RGPD_EXPORT_DONNEES', 'dem: ' + dem.id)

  const out = {
    genere_le: new Date().toISOString(),
    reference: 'EXPORT-RGPD-' + dem.nud + '-' + Date.now(),
    mention_art15: 'Export fourni au titre de l article 15 du RGPD (droit d acces). Durees de conservation : voir politique de confidentialite du portail.',
    demandeur: dem,
    audiences: mesAudiences,
    decisions_cal: mesDecisions,
    propositions: mesPropositions,
    pieces_justificatives: mesPieces,
    demandes_rgpd_anterieures: mesDemandesRgpd
  }

  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-' + dem.nud + '.json"')
  res.type('application/json').send(JSON.stringify(out, null, 2))
})

// Art. 16/17/18/21 : soumission d une demande d exercice de droit
app.post('/api/portail/demande-rgpd', rlRgpdReq, requirePortailAuth, (req, res) => {
  const { droit, message } = req.body || {}
  const DROITS_VALIDES = ['acces', 'rectification', 'effacement', 'limitation', 'opposition', 'portabilite']
  if (!DROITS_VALIDES.includes(droit)) {
    return res.status(400).json({ error: 'Droit invalide. Valeurs : ' + DROITS_VALIDES.join(', ') })
  }
  if (!message || String(message).trim().length < 10) {
    return res.status(400).json({ error: 'Merci de preciser votre demande (10 caracteres min).' })
  }
  if (String(message).length > 2000) {
    return res.status(400).json({ error: 'Message trop long (2000 caracteres max).' })
  }

  const all = readData('rgpd_demandes.json')
  const demande = {
    id: 'RGPD' + Date.now() + randomBytes(3).toString('hex'),
    dem_id: req.portailDem,
    droit,
    message: String(message).trim(),
    soumise_le: new Date().toISOString(),
    statut: 'recue',
    delai_legal: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
    reponse: null,
    traitee_le: null,
    traitee_par: null
  }
  all.push(demande)
  writeData('rgpd_demandes.json', all)
  addLog(null, 'RGPD_DEMANDE_RECUE', 'dem: ' + req.portailDem + ' droit: ' + droit)

  // Notification au DPO
  try { tgSend('[RGPD] Nouvelle demande ' + droit + ' - dem ' + req.portailDem + ' - ref ' + demande.id).catch(() => {}) } catch (e) {}

  res.json({
    ok: true,
    reference: demande.id,
    delai_legal: demande.delai_legal,
    message: 'Votre demande a bien ete recue. Vous recevrez une reponse sous 30 jours maximum, conformement a l article 12.3 du RGPD.'
  })
})

// Liste des demandes RGPD du candidat
app.get('/api/portail/mes-demandes-rgpd', requirePortailAuth, (req, res) => {
  const all = readData('rgpd_demandes.json')
  const miennes = all.filter(r => r.dem_id === req.portailDem).sort((a, b) => (b.soumise_le || '').localeCompare(a.soumise_le || ''))
  res.json(miennes)
})

// ============================================================
// RGPD ADMIN : cote DPO / directeur
// ============================================================

app.get('/api/rgpd/demandes', requireAuth, requireRole('directeur'), (req, res) => {
  const all = readData('rgpd_demandes.json').sort((a, b) => (b.soumise_le || '').localeCompare(a.soumise_le || ''))
  const demandeurs = readData('demandeurs.json')
  const enrichies = all.map(r => {
    const d = demandeurs.find(x => x.id === r.dem_id)
    return {
      ...r,
      demandeur_nud: d ? d.nud : null,
      demandeur_nom: d ? (d.prenom + ' ' + d.nom) : null
    }
  })
  res.json(enrichies)
})

app.post('/api/rgpd/demandes/:id/repondre', requireAuth, requireRole('directeur'), (req, res) => {
  const { reponse, statut } = req.body || {}
  const STATUTS = ['accordee', 'refusee', 'partiellement_accordee']
  if (!STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide' })
  if (!reponse || reponse.length < 10) return res.status(400).json({ error: 'Reponse requise (10 car. min)' })

  const all = readData('rgpd_demandes.json')
  const idx = all.findIndex(r => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Demande introuvable' })

  all[idx].reponse = reponse
  all[idx].statut = statut
  all[idx].traitee_le = new Date().toISOString()
  all[idx].traitee_par = (req.user.prenom || '') + ' ' + (req.user.nom || '')
  writeData('rgpd_demandes.json', all)
  addLog(req.user, 'RGPD_DEMANDE_TRAITEE', all[idx].id + ' statut: ' + statut)

  res.json(all[idx])
})

// --- COMPAT : ancien endpoint dossier public (lecture seule, pas de pieces ni propositions) ---
// Utilise par les anciens liens. Redirige vers le nouveau flow d auth.
app.get('/api/portail/dossier/:nud', (req, res) => {
  // Conserve pour compat descendante : retourne un dossier minimal sans auth DOB
  const dem = findDemByNud(req.params.nud)
  if (!dem) return res.status(404).json({ error: 'Dossier introuvable' })
  const audiences = readData('audiences.json')
  const decisions = readData('decisions_cal.json')

  const audPubliques = audiences
    .filter(a => a.dem_id === dem.id)
    .map(a => ({ date: a.date_audience, type: 'Audience elu', favorable: a.favorable, statut: a.statut }))
  const decPubliques = decisions
    .filter(d => (d.candidats || []).some(c => c.dem_id === dem.id))
    .map(d => {
      const c = d.candidats.find(x => x.dem_id === dem.id)
      return { date: d.date_cal, logement_ref: d.logement_ref, decision: c ? c.decision : 'Examine' }
    })

  let etape = 1, statut = 'En cours d instruction'
  if (dem.statut === 'attribue') { etape = 4; statut = 'Logement attribue' }
  else if (audPubliques.some(a => a.statut === 'Attribue')) { etape = 4; statut = 'Attribution en cours' }
  else if (audPubliques.some(a => a.favorable)) { etape = 3; statut = 'Proposition attendue' }
  else if (audPubliques.length > 0) { etape = 2; statut = 'Suivi actif' }

  res.json({
    nud: dem.nud,
    prenom: dem.prenom,
    nom_initial: dem.nom ? dem.nom[0] + '.' : '',
    anc_mois: dem.anc || 0,
    typ_souhaitee: dem.typ_v,
    statut,
    etape,
    pieces_ok: !!dem.pieces,
    historique: [
      ...(dem.parcours || []).map(p => ({ date: p.date, type: p.type })),
      ...audPubliques.map(a => ({ date: a.date, type: 'Audience elu - ' + (a.favorable ? 'Favorable' : 'Neutre') })),
      ...decPubliques.map(d => ({ date: d.date, type: 'Commission CAL - ' + d.decision }))
    ],
    actions_requises: dem.pieces ? [] : ['Pieces justificatives incompletes - connectez-vous au portail avec votre date de naissance pour les deposer'],
    contact: CONTACT_974,
    deprecated: true,
    message: 'Nouveau portail disponible avec authentification renforcee (NUD + date de naissance)'
  })
})

// ============================================================
// MATCH CANDIDAT (pour import)
// ============================================================

app.post('/api/match-candidat', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const { nud, nom, prenom } = req.body || {}
  const norm = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (nud) {
    const match = demandeurs.find(d => d.nud === nud)
    if (match) return res.json({ found: true, niveau: 1, dem: match })
  }

  if (nom && prenom) {
    const candidates = demandeurs.filter(d =>
      norm(d.nom) === norm(nom) && norm(d.prenom) === norm(prenom)
    )
    if (candidates.length === 1) return res.json({ found: true, niveau: 3, dem: candidates[0] })
    if (candidates.length > 1) return res.json({ found: false, homonymes: candidates })
  }

  res.json({ found: false })
})

// ============================================================
// TELEGRAM - chat_ids, liens, tests, digest
// ============================================================

// QR code data URL (utilitaire leger, via tiers gratuit sans cle)
function qrFor(url) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(url)
}

// Statut Telegram d un elu (connecte / non)
app.get('/api/telegram/statut/elu/:id', requireAuth, (req, res) => {
  const chatId = tgGetChatId('elu', req.params.id)
  res.json({ connecte: !!chatId, chat_id: chatId || null })
})

// Statut Telegram d un demandeur
app.get('/api/telegram/statut/demandeur/:id', requireAuth, (req, res) => {
  const chatId = tgGetChatId('demandeur', req.params.id)
  res.json({ connecte: !!chatId, chat_id: chatId || null })
})

// Lien de connexion personnel pour un elu (avec QR code)
app.get('/api/telegram/lien-elu/:id', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', {})
  const elu = (ref.elus || []).find(e => e.id === req.params.id)
  if (!elu) return res.status(404).json({ error: 'Elu introuvable' })
  const lien = genererLienElu(elu.id)
  res.json({ lien, qr: qrFor(lien), elu_nom: elu.nom + ' ' + (elu.prenom || '') })
})

// Lien de connexion personnel pour un candidat
app.get('/api/telegram/lien-candidat/:id', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === req.params.id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })
  const lien = genererLienCandidat(dem.id)
  res.json({ lien, qr: qrFor(lien), dem_nom: dem.nom + ' ' + dem.prenom })
})

// Enregistrer manuellement un chat_id pour un elu (utile pour test sans webhook)
app.post('/api/telegram/register-elu/:id', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const chatId = req.body && req.body.chat_id
  if (!chatId) return res.status(400).json({ error: 'chat_id requis' })
  tgSaveChatId('elu', req.params.id, chatId)
  addLog(req.user, 'TELEGRAM_REGISTER_ELU', 'elu ' + req.params.id + ' chat_id ' + chatId)
  res.json({ ok: true })
})

// Enregistrer manuellement un chat_id pour un demandeur
app.post('/api/telegram/register-demandeur/:id', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const chatId = req.body && req.body.chat_id
  if (!chatId) return res.status(400).json({ error: 'chat_id requis' })
  tgSaveChatId('demandeur', req.params.id, chatId)
  addLog(req.user, 'TELEGRAM_REGISTER_DEM', 'dem ' + req.params.id + ' chat_id ' + chatId)
  res.json({ ok: true })
})

// Envoyer un message test a un elu connecte
app.post('/api/telegram/test/:id', requireAuth, async (req, res) => {
  const chatId = tgGetChatId('elu', req.params.id)
  if (!chatId) return res.status(400).json({ error: 'Elu non connecte' })
  const ref = readObj('referentiels.json', {})
  const elu = (ref.elus || []).find(e => e.id === req.params.id)
  const ok = await tgSend(chatId, '[ok] <b>Message de test Logivia</b>\n\nBonjour ' + (elu ? elu.prenom + ' ' + elu.nom : '') + ',\n\nCe message confirme que les notifications Telegram fonctionnent pour votre compte.\n\n<i>Envoye depuis le tableau de bord Logivia - Saint-Denis.</i>')
  addLog(req.user, 'TELEGRAM_TEST', 'elu ' + req.params.id)
  res.json({ ok })
})

// Envoyer un message test a un candidat connecte
app.post('/api/telegram/test-candidat/:id', requireAuth, async (req, res) => {
  const chatId = tgGetChatId('demandeur', req.params.id)
  if (!chatId) return res.status(400).json({ error: 'Candidat non connecte' })
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === req.params.id)
  const ok = await tgSend(chatId, '[ok] <b>Message de test Logivia</b>\n\nBonjour ' + (dem ? dem.prenom : '') + ',\n\nCe message confirme que les notifications Telegram fonctionnent pour votre dossier.\n\n<i>Ville de Saint-Denis - Service Habitat.</i>')
  res.json({ ok })
})

// Envoyer digest hebdo immediat
app.post('/api/telegram/digest', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  try {
    await envoyerDigestHebdo()
    addLog(req.user, 'TELEGRAM_DIGEST', 'envoi manuel')
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Webhook entrant Telegram (utilise quand le bot reçoit un message)
/**
 * Envoi de test direct a un chat_id (pour le directeur qui veut
 * recevoir un message de test sur son propre Telegram sans
 * passer par l'enregistrement elu/demandeur).
 */
app.post('/api/telegram/test-direct', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  const { chat_id, texte } = req.body || {}
  if (!chat_id) return res.status(400).json({ error: 'chat_id requis. Ouvrez @CALSmartSaintDenis_bot sur Telegram, tapez /start, le chat_id vous sera affiche.' })
  const messageFinal = (texte && texte.trim()) ||
    '<b>Test Logivia</b>\n\nCeci est un message de test envoye par ' + req.user.nom +
    ' depuis l\'application Logivia.\n\nSi vous voyez ce message, l\'integration Telegram fonctionne correctement.\n\nHeure : ' + new Date().toLocaleString('fr-FR')
  try {
    const result = await tgSend(String(chat_id), messageFinal)
    if (result && result.ok) {
      addLog(req.user, 'TELEGRAM_TEST', 'chat_id: ' + chat_id)
      return res.json({ ok: true, message_id: result.result && result.result.message_id })
    }
    return res.status(500).json({ ok: false, error: (result && result.description) || 'Erreur Telegram inconnue' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
})

/**
 * Configure le webhook Telegram automatiquement.
 * A appeler une fois apres deploiement pour que Telegram notifie le serveur
 * sur chaque /start, /statut, etc.
 */
app.post('/api/telegram/setup-webhook', requireAuth, requireRole('directeur'), async (req, res) => {
  const appUrl = process.env.APP_URL || req.body.app_url
  if (!appUrl) return res.status(400).json({ error: 'APP_URL non definie. Passez app_url dans le body ou settez la variable d\'environnement.' })
  const webhookUrl = appUrl.replace(/\/$/, '') + '/api/telegram/webhook'
  const BOT_TOKEN = process.env.BOT_TOKEN || '8365732100:AAHhqqnayRjBSQMIpyy3YHxZh6fYnMPexI0'
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] })
    })
    const data = await r.json()
    addLog(req.user, 'TELEGRAM_WEBHOOK', 'URL: ' + webhookUrl + ' - ' + (data.description || ''))
    res.json({ ok: data.ok, webhook_url: webhookUrl, telegram_response: data })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

/**
 * Verifie l'etat du webhook Telegram (infos debug).
 */
app.get('/api/telegram/webhook-info', requireAuth, requireRole('directeur', 'agent'), async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '8365732100:AAHhqqnayRjBSQMIpyy3YHxZh6fYnMPexI0'
  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getWebhookInfo')
    const data = await r.json()
    res.json(data)
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    await tgHandleWebhook(req.body || {})
    res.json({ ok: true })
  } catch (e) {
    console.error('[Telegram webhook]', e.message)
    res.status(200).json({ ok: false })
  }
})

// Liste des elus avec leur etat de connexion
app.get('/api/telegram/elus-status', requireAuth, (req, res) => {
  const ref = readObj('referentiels.json', {})
  const all = tgGetAllChatIds('elu')
  const out = (ref.elus || []).map(e => ({
    id: e.id, nom: e.nom, prenom: e.prenom || '', secteur: e.secteur,
    connecte: !!all[e.id], chat_id: all[e.id] || null
  }))
  res.json(out)
})

// ============================================================
// COURRIERS OFFICIELS aux candidats (avec statuts)
// Statuts possibles :
//   en_attente : reponse en attente de traitement
//   prioritaire : dossier prioritise
//   deja_livre : operation de relogement deja effectuee
//   livre : logement attribue et livre
//   refuse : refus motive
//   en_etude : en instruction
// ============================================================

const COURRIER_STATUTS = ['en_attente', 'prioritaire', 'deja_livre', 'livre', 'refuse', 'en_etude', 'demande_pieces', 'relance']

const COURRIER_TEMPLATES = {
  en_attente: {
    libelle: 'Reponse en attente',
    couleur: '#D97706',
    objet: 'Votre demande de logement social - accuse de reception',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Nous accusons reception de votre demande de logement social (NUD ${dem.nud || '-'}).

Votre dossier est en cours d examen par nos services. Nous reviendrons vers vous des que votre situation aura ete etudiee par la commission d attribution.

Dans l attente, nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Ville de Saint-Denis`
  },
  prioritaire: {
    libelle: 'Dossier prioritaire',
    couleur: '#DC2626',
    objet: 'Votre demande de logement social - dossier reconnu prioritaire',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Nous vous informons que votre dossier de demande de logement social (NUD ${dem.nud || '-'}) a ete reconnu prioritaire par nos services au regard de votre situation.

Votre dossier sera presente en priorite lors des prochaines commissions d attribution.

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Ville de Saint-Denis`
  },
  deja_livre: {
    libelle: 'Operation deja livree',
    couleur: '#16A34A',
    objet: 'Votre demande de logement social - operation de relogement deja livree',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Nous vous informons que le programme auquel votre dossier avait ete rattache (NUD ${dem.nud || '-'}) a deja fait l objet d attributions completes.

Votre dossier reste actif et sera etudie sur les prochaines operations.

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Ville de Saint-Denis`
  },
  livre: {
    libelle: 'Logement attribue',
    couleur: '#16A34A',
    objet: 'Votre demande de logement social - attribution',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Nous avons le plaisir de vous informer qu un logement vous a ete attribue suite a votre demande (NUD ${dem.nud || '-'}).

Le bailleur prendra contact avec vous prochainement pour finaliser votre entree dans les lieux.

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Ville de Saint-Denis`
  },
  refuse: {
    libelle: 'Refus motive',
    couleur: '#DC2626',
    objet: 'Votre demande de logement social - decision',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Apres examen en commission, votre demande de logement social (NUD ${dem.nud || '-'}) n a pu etre retenue a ce jour.

Votre dossier reste neanmoins actif et sera reetudie pour les prochaines commissions.

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Ville de Saint-Denis`
  },
  en_etude: {
    libelle: 'En etude',
    couleur: '#1D6FA8',
    objet: 'Votre demande de logement social - etude en cours',
    corps: (dem) =>
`Madame, Monsieur ${dem.nom},

Votre dossier (NUD ${dem.nud || '-'}) est actuellement en cours d etude par nos services.

Nous reviendrons vers vous une fois cette etude terminee.

Service Habitat - Ville de Saint-Denis`
  },
  demande_pieces: {
    libelle: 'Demande de pieces complementaires',
    couleur: '#D97706',
    objet: 'Votre demande de logement social - pieces complementaires a fournir',
    corps: (dem, opts) =>
`Madame, Monsieur ${dem.nom},

Pour la poursuite de l instruction de votre dossier de demande de logement social (NUD ${dem.nud || '-'}), nous vous invitons a nous transmettre les pieces suivantes dans un delai de 30 jours a compter de la reception du present courrier :

${(opts && opts.pieces && opts.pieces.length ? opts.pieces : ['Avis d imposition de l annee N-1', 'Derniers bulletins de salaire (3 derniers mois)', 'Justificatif de domicile de moins de 3 mois', 'Livret de famille', 'Piece d identite en cours de validite']).map((p, i) => '- ' + p).join('\n')}

Passe ce delai, et faute de retour, votre dossier pourra etre considere comme incomplet et sa prise en compte reportee.

Vous pouvez deposer ces pieces :
- par voie postale au Service Habitat, 2 rue de Paris, 97400 Saint-Denis
- ou directement sur votre espace candidat via le portail en ligne

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Mairie de Saint-Denis de La Reunion`
  },
  relance: {
    libelle: 'Relance',
    couleur: '#E05C2A',
    objet: 'Relance - votre dossier de demande de logement social',
    corps: (dem, opts) =>
`Madame, Monsieur ${dem.nom},

Sauf erreur de notre part, nous n avons pas recu de votre part ${opts && opts.objet_relance ? 'le/les element(s) suivant(s) : ' + opts.objet_relance : 'les elements attendus pour la poursuite de l instruction de votre dossier'} (NUD ${dem.nud || '-'}).

Afin d eviter la mise en inactivite de votre demande, merci de nous faire parvenir ces elements dans les 15 jours qui suivent la reception du present courrier.

Pour toute question, vous pouvez contacter le Service Habitat aux heures d ouverture au public.

Nous vous prions d agreer, Madame, Monsieur, l expression de nos salutations distinguees.

Service Habitat - Mairie de Saint-Denis de La Reunion`
  }
}

// Lister les courriers
app.get('/api/courriers', requireAuth, (req, res) => {
  const all = readData('courriers.json')
  const qDem = req.query.dem_id
  const qStatut = req.query.statut
  let out = all
  if (qDem) out = out.filter(c => c.dem_id === qDem)
  if (qStatut) out = out.filter(c => c.statut === qStatut)
  out = out.slice().reverse()
  res.json(out)
})

// Templates dispos
app.get('/api/courriers/templates', requireAuth, (req, res) => {
  res.json(Object.entries(COURRIER_TEMPLATES).map(([k, v]) => ({
    statut: k, libelle: v.libelle, couleur: v.couleur, objet: v.objet
  })))
})

// Statistiques courriers
app.get('/api/courriers/stats', requireAuth, (req, res) => {
  const all = readData('courriers.json')
  const byStatut = {}
  for (const s of COURRIER_STATUTS) byStatut[s] = 0
  for (const c of all) byStatut[c.statut] = (byStatut[c.statut] || 0) + 1
  res.json({ total: all.length, par_statut: byStatut })
})

// Creer un courrier et l envoyer (Telegram si dispo + enregistrement)
app.post('/api/courriers', requireAuth, async (req, res) => {
  const { dem_id, statut, objet, corps, envoyer_telegram, pieces, objet_relance, logement_ref, bailleur } = req.body || {}
  if (!dem_id || !statut) return res.status(400).json({ error: 'dem_id et statut requis' })
  if (!COURRIER_STATUTS.includes(statut)) return res.status(400).json({ error: 'statut invalide' })
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === dem_id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })

  const tpl = COURRIER_TEMPLATES[statut]
  const all = readData('courriers.json')
  const opts = { pieces, objet_relance, logement_ref, bailleur }
  const courrier = {
    id: nextId(all, 'CO'),
    dem_id,
    dem_nom: dem.nom + ' ' + dem.prenom,
    dem_nud: dem.nud || '',
    statut,
    libelle_statut: tpl.libelle,
    objet: objet || tpl.objet,
    corps: corps || tpl.corps(dem, opts),
    options: opts,
    cree_par: req.user.nom || req.user.login,
    role: req.user.role,
    date_creation: nowDate(),
    heure_creation: nowTime(),
    telegram_envoye: false,
    telegram_chat_id: null,
    historique: [
      { date: nowDate(), heure: nowTime(), user: req.user.nom || req.user.login, action: 'creation', statut }
    ]
  }

  // Envoi Telegram si demande et candidat connecte
  if (envoyer_telegram) {
    const chatId = tgGetChatId('demandeur', dem_id)
    if (chatId) {
      const headline = '<b>' + tpl.libelle.toUpperCase() + '</b>\n<b>' + courrier.objet + '</b>\n\n'
      const ok = await tgSend(chatId, headline + courrier.corps)
      courrier.telegram_envoye = !!ok
      courrier.telegram_chat_id = chatId
      courrier.historique.push({
        date: nowDate(), heure: nowTime(),
        user: req.user.nom || req.user.login,
        action: ok ? 'envoi_telegram_ok' : 'envoi_telegram_echec'
      })
    } else {
      courrier.historique.push({
        date: nowDate(), heure: nowTime(),
        user: req.user.nom || req.user.login,
        action: 'envoi_telegram_indispo'
      })
    }
  }

  all.push(courrier)
  writeData('courriers.json', all)

  // Parcours + audit
  const idx = demandeurs.findIndex(d => d.id === dem_id)
  if (idx >= 0) {
    if (!Array.isArray(demandeurs[idx].parcours)) demandeurs[idx].parcours = []
    demandeurs[idx].parcours.unshift({
      date: nowDate(),
      type: 'Courrier officiel',
      detail: tpl.libelle + (courrier.telegram_envoye ? ' - envoye par Telegram' : ' - archive dossier')
    })
    writeData('demandeurs.json', demandeurs)
  }
  addLog(req.user, 'COURRIER_CREATION', dem.nom + ' ' + dem.prenom + ' / ' + tpl.libelle)
  addAudit(req.user, 'demandeur', dem_id, dem.nom + ' ' + dem.prenom, 'courrier_' + statut, [{ label: 'Courrier officiel', avant: '-', apres: tpl.libelle }], 'Courrier officiel : ' + tpl.libelle)

  res.json(courrier)
})

// ============================================================
// PDF COURRIER : HTML imprimable avec en-tete mairie 974
// - previsualisation : GET /api/courriers/:id/pdf (courrier existant)
// - apercu direct : POST /api/courriers/preview (sans creer le courrier)
// Format : HTML avec print CSS. L utilisateur fait "Imprimer > Sauver PDF".
// ============================================================

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderCourrierHtml(courrier, dem) {
  const tpl = COURRIER_TEMPLATES[courrier.statut] || { libelle: courrier.statut, couleur: '#E05C2A' }
  const dateFr = new Date(courrier.date_creation || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const adresseDem = [dem.adresse, dem.code_postal, dem.ville].filter(Boolean).join(' ')
  const corpsHtml = escapeHtml(courrier.corps).split('\n').map(l => l.trim() ? '<p>' + l + '</p>' : '<p>&nbsp;</p>').join('')
  const ref = 'Ref : ' + (courrier.id || 'CO') + ' / NUD : ' + (dem.nud || '-')
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(courrier.objet)} - ${escapeHtml(dem.nom)}</title>
<style>
  @page { size: A4; margin: 18mm 18mm 22mm 18mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 11.5pt; line-height: 1.55; margin: 0; }
  .entete { display: flex; gap: 18px; align-items: flex-start; border-bottom: 2px solid #E05C2A; padding-bottom: 14px; margin-bottom: 26px; }
  .logo { width: 70px; height: 70px; background: #E05C2A; color: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 26px; flex-shrink: 0; }
  .entete .txt { flex: 1; }
  .entete h1 { margin: 0; font-size: 17pt; color: #0F172A; letter-spacing: -0.01em; }
  .entete .sub { font-size: 10pt; color: #475569; margin-top: 2px; }
  .entete .sub b { color: #E05C2A; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 22px; font-size: 10pt; color: #475569; }
  .destinataire { text-align: right; margin: 22px 0 30px; font-size: 11.5pt; }
  .destinataire b { color: #0F172A; }
  .objet { background: #FEF3E9; border-left: 4px solid #E05C2A; padding: 10px 14px; margin: 18px 0 22px; font-weight: 600; font-size: 11pt; }
  .corps p { margin: 0 0 10px; text-align: justify; }
  .signature { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
  .signature .sig-box { width: 260px; }
  .signature .sig-box .line { border-top: 1px solid #94A3B8; margin-top: 55px; padding-top: 6px; font-size: 10pt; color: #475569; text-align: center; }
  .footer { margin-top: 44px; border-top: 1px solid #E2E8F0; padding-top: 10px; font-size: 9pt; color: #64748B; text-align: center; }
  .no-print { text-align: right; margin: 10px 0 20px; }
  .no-print button { padding: 10px 20px; background: #E05C2A; color: #fff; border: none; border-radius: 8px; font-size: 12pt; font-weight: 700; cursor: pointer; }
  @media print { .no-print { display: none; } body { margin: 0; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">Imprimer / Sauver en PDF</button>
  </div>
  <div class="entete">
    <div class="logo">SD</div>
    <div class="txt">
      <h1>Mairie de Saint-Denis</h1>
      <div class="sub"><b>La Reunion (974)</b> &middot; Service Habitat &middot; Commission d Attribution des Logements</div>
      <div class="sub">2 rue de Paris, 97400 Saint-Denis &middot; Tel : 02 62 40 62 62</div>
    </div>
  </div>
  <div class="meta">
    <div>${escapeHtml(ref)}</div>
    <div>Saint-Denis, le ${escapeHtml(dateFr)}</div>
  </div>
  <div class="destinataire">
    <b>${escapeHtml(dem.civilite || '')} ${escapeHtml(dem.prenom || '')} ${escapeHtml(dem.nom || '')}</b><br>
    ${escapeHtml(adresseDem) || '&nbsp;'}
  </div>
  <div class="objet"><b>Objet :</b> ${escapeHtml(courrier.objet)}</div>
  <div class="corps">${corpsHtml}</div>
  <div class="signature">
    <div></div>
    <div class="sig-box">
      <div class="line">Pour le Maire, l Adjoint delegue au Logement</div>
    </div>
  </div>
  <div class="footer">
    Mairie de Saint-Denis &middot; Service Habitat &middot; www.saintdenis.re &middot; Document genere le ${escapeHtml(new Date().toLocaleString('fr-FR'))}
  </div>
</body>
</html>`
}

// Telechargement PDF d un courrier existant (retourne HTML imprimable)
app.get('/api/courriers/:id/pdf', requireAuth, (req, res) => {
  const all = readData('courriers.json')
  const courrier = all.find(c => c.id === req.params.id)
  if (!courrier) return res.status(404).send('Courrier introuvable')
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === courrier.dem_id) || {}
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderCourrierHtml(courrier, dem))
})

// Apercu imprimable avant creation (pour les 4 boutons : genere le courrier ET affiche le PDF)
app.post('/api/courriers/preview', requireAuth, (req, res) => {
  const { dem_id, statut, objet, corps, pieces, objet_relance, logement_ref, bailleur } = req.body || {}
  if (!dem_id || !statut) return res.status(400).json({ error: 'dem_id et statut requis' })
  if (!COURRIER_STATUTS.includes(statut)) return res.status(400).json({ error: 'statut invalide' })
  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === dem_id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })
  const tpl = COURRIER_TEMPLATES[statut]
  const opts = { pieces, objet_relance, logement_ref, bailleur }
  const courrier = {
    id: 'APERCU',
    dem_id,
    statut,
    libelle_statut: tpl.libelle,
    objet: objet || tpl.objet,
    corps: corps || tpl.corps(dem, opts),
    date_creation: nowDate()
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderCourrierHtml(courrier, dem))
})

// Changer le statut d un courrier (reclassification)
app.put('/api/courriers/:id/statut', requireAuth, (req, res) => {
  const { statut, motif } = req.body || {}
  if (!COURRIER_STATUTS.includes(statut)) return res.status(400).json({ error: 'statut invalide' })
  const all = readData('courriers.json')
  const idx = all.findIndex(c => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Courrier introuvable' })
  const ancien = all[idx].statut
  all[idx].statut = statut
  all[idx].libelle_statut = COURRIER_TEMPLATES[statut].libelle
  all[idx].historique = all[idx].historique || []
  all[idx].historique.push({
    date: nowDate(), heure: nowTime(),
    user: req.user.nom || req.user.login,
    action: 'changement_statut',
    statut,
    ancien,
    motif: motif || ''
  })
  writeData('courriers.json', all)
  addAudit(req.user, 'courrier', req.params.id, all[idx].dem_nom, 'changement_statut', [{ label: 'Statut courrier', avant: COURRIER_TEMPLATES[ancien].libelle, apres: COURRIER_TEMPLATES[statut].libelle }], motif || ('Changement statut courrier vers ' + COURRIER_TEMPLATES[statut].libelle))
  res.json(all[idx])
})

// Supprimer un courrier (directeur uniquement)
app.delete('/api/courriers/:id', requireAuth, requireRole('directeur'), (req, res) => {
  const all = readData('courriers.json')
  const idx = all.findIndex(c => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Courrier introuvable' })
  const motif = (req.body && req.body.motif) || ''
  if (!motif) return res.status(400).json({ error: 'Motif requis', need_motif: true })
  const removed = all.splice(idx, 1)[0]
  writeData('courriers.json', all)
  addAudit(req.user, 'courrier', req.params.id, removed.dem_nom, 'suppression', [], motif)
  res.json({ ok: true })
})

// ============================================================
// TEMPS REEL (SSE + presence + verrouillage doux)
// ============================================================

/**
 * SSE endpoint : le token est passe en query string car EventSource
 * ne permet pas d'envoyer des headers custom.
 */
app.get('/api/events', (req, res) => {
  const token = req.query.token
  const session = getSession(token)
  if (!session) {
    res.status(401).end('Session invalide')
    return
  }
  registerSseClient(res, session.user)
})

app.get('/api/presence', requireAuth, (req, res) => {
  res.json({
    users: rtGetPresence(),
    connected_count: rtConnectedCount(),
    locks: rtGetAllLocks()
  })
})

app.get('/api/presence/on/:entity_type/:entity_id', requireAuth, (req, res) => {
  res.json({ users: rtWhoIsOnEntity(req.params.entity_type, req.params.entity_id) })
})

app.post('/api/presence/viewing', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body || {}
  rtSetPresence(req.user, {
    online: true,
    viewing: entity_type ? { entity_type, entity_id } : null
  })
  rtBroadcast('presence_update', rtGetPresence())
  res.json({ ok: true })
})

app.post('/api/presence/editing', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body || {}
  rtSetPresence(req.user, {
    online: true,
    editing: entity_type ? { entity_type, entity_id, since: Date.now() } : null
  })
  rtBroadcast('presence_update', rtGetPresence())
  res.json({ ok: true })
})

app.post('/api/presence/ping', requireAuth, (req, res) => {
  rtSetPresence(req.user, { online: true })
  res.json({ ok: true })
})

app.post('/api/locks/acquire', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body || {}
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type et entity_id requis' })
  const result = rtAcquireLock(req.user, entity_type, entity_id)
  if (!result.ok) return res.status(409).json(result)
  res.json(result)
})

app.post('/api/locks/release', requireAuth, (req, res) => {
  const { entity_type, entity_id } = req.body || {}
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type et entity_id requis' })
  const result = rtReleaseLock(req.user, entity_type, entity_id)
  if (!result.ok) return res.status(409).json(result)
  res.json(result)
})

app.get('/api/locks', requireAuth, (req, res) => {
  res.json({ locks: rtGetAllLocks() })
})

app.get('/api/locks/:entity_type/:entity_id', requireAuth, (req, res) => {
  res.json({ lock: rtGetLock(req.params.entity_type, req.params.entity_id) })
})

// ============================================================
// COMMENTAIRES INTERNES + MENTIONS @user
// ============================================================

/**
 * Extrait les mentions @login dans un texte.
 * Format accepte : @jean.dupont, @claire, @m.ali
 */
function extractMentions(texte) {
  if (!texte || typeof texte !== 'string') return []
  const re = /@([a-zA-Z0-9._-]{2,40})/g
  const out = new Set()
  let m
  while ((m = re.exec(texte)) !== null) out.add(m[1].toLowerCase())
  return Array.from(out)
}

app.get('/api/commentaires/:entity_type/:entity_id', requireAuth, (req, res) => {
  const all = readData('commentaires.json')
  const rows = all.filter(c =>
    c.entity_type === req.params.entity_type &&
    c.entity_id === req.params.entity_id
  ).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  res.json(rows)
})

app.post('/api/commentaires', requireAuth, (req, res) => {
  const { entity_type, entity_id, texte } = req.body || {}
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type et entity_id requis' })
  if (!texte || !texte.trim()) return res.status(400).json({ error: 'Texte requis' })

  const users = readData('users.json')
  const mentionsLogins = extractMentions(texte)
  const mentionedUsers = users
    .filter(u => u.actif && mentionsLogins.includes((u.login || '').toLowerCase()))
    .map(u => ({ id: u.id, login: u.login, nom: u.nom, prenom: u.prenom }))

  const all = readData('commentaires.json')
  const comment = {
    id: nextId(all, 'CM'),
    entity_type,
    entity_id,
    user_id: req.user.id,
    user_nom: req.user.nom,
    user_role: req.user.role,
    texte: texte.trim(),
    mentions: mentionedUsers,
    created_at: new Date().toISOString(),
    edited_at: null,
    reactions: {}
  }
  all.push(comment)
  writeData('commentaires.json', all)

  addLog(req.user, 'COMMENTAIRE_AJOUT', entity_type + ':' + entity_id)
  addAudit(req.user, entity_type, entity_id, '', 'commentaire', [
    { champ: 'commentaire', ancien: '', nouveau: texte.trim().slice(0, 200) }
  ], 'Ajout commentaire')

  // broadcast SSE : tout le monde voit le fil rafraichi
  rtBroadcast('comment_added', { entity_type, entity_id, comment })

  // notifie les utilisateurs mentionnes
  for (const m of mentionedUsers) {
    rtBroadcastToUser(m.id, 'mention', {
      from: { id: req.user.id, nom: req.user.nom, role: req.user.role },
      entity_type, entity_id,
      extrait: texte.trim().slice(0, 140),
      created_at: comment.created_at
    })
    // stocke aussi une notif persistante
    const notifs = readData('notifications.json')
    notifs.push({
      id: nextId(notifs, 'NT'),
      user_id: m.id,
      type: 'mention',
      entity_type, entity_id,
      titre: 'Mention de ' + req.user.nom,
      message: texte.trim().slice(0, 200),
      lu: false,
      created_at: comment.created_at
    })
    writeData('notifications.json', notifs)
  }

  res.json(comment)
})

app.put('/api/commentaires/:id', requireAuth, (req, res) => {
  const { texte } = req.body || {}
  if (!texte || !texte.trim()) return res.status(400).json({ error: 'Texte requis' })
  const all = readData('commentaires.json')
  const idx = all.findIndex(c => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Commentaire introuvable' })
  const c = all[idx]
  if (c.user_id !== req.user.id && req.user.role !== 'directeur') {
    return res.status(403).json({ error: 'Seul l\'auteur ou le directeur peut editer' })
  }
  const ancien = c.texte
  c.texte = texte.trim()
  c.edited_at = new Date().toISOString()
  writeData('commentaires.json', all)
  addAudit(req.user, c.entity_type, c.entity_id, '', 'commentaire_edit', [
    { champ: 'commentaire', ancien: ancien.slice(0, 200), nouveau: texte.trim().slice(0, 200) }
  ], 'Edition commentaire')
  rtBroadcast('comment_edited', { entity_type: c.entity_type, entity_id: c.entity_id, comment: c })
  res.json(c)
})

app.delete('/api/commentaires/:id', requireAuth, (req, res) => {
  const { motif } = req.body || {}
  if (!motif || !motif.trim()) return res.status(400).json({ error: 'Motif obligatoire', need_motif: true })
  const all = readData('commentaires.json')
  const idx = all.findIndex(c => c.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Commentaire introuvable' })
  const c = all[idx]
  if (c.user_id !== req.user.id && req.user.role !== 'directeur') {
    return res.status(403).json({ error: 'Seul l\'auteur ou le directeur peut supprimer' })
  }
  all.splice(idx, 1)
  writeData('commentaires.json', all)
  addAudit(req.user, c.entity_type, c.entity_id, '', 'commentaire_suppression', [], motif)
  rtBroadcast('comment_deleted', { entity_type: c.entity_type, entity_id: c.entity_id, comment_id: c.id })
  res.json({ ok: true })
})

app.post('/api/commentaires/:id/reaction', requireAuth, (req, res) => {
  const { emoji } = req.body || {}
  if (!emoji) return res.status(400).json({ error: 'emoji requis' })
  const all = readData('commentaires.json')
  const c = all.find(x => x.id === req.params.id)
  if (!c) return res.status(404).json({ error: 'Commentaire introuvable' })
  c.reactions = c.reactions || {}
  c.reactions[emoji] = c.reactions[emoji] || []
  const i = c.reactions[emoji].indexOf(req.user.id)
  if (i >= 0) c.reactions[emoji].splice(i, 1)
  else c.reactions[emoji].push(req.user.id)
  if (c.reactions[emoji].length === 0) delete c.reactions[emoji]
  writeData('commentaires.json', all)
  rtBroadcast('comment_edited', { entity_type: c.entity_type, entity_id: c.entity_id, comment: c })
  res.json(c)
})

// notifications persistees (mentions, etc.)
app.get('/api/mes-notifications', requireAuth, (req, res) => {
  const all = readData('notifications.json')
  const mine = all.filter(n => n.user_id === req.user.id)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  res.json({
    total: mine.length,
    non_lues: mine.filter(n => !n.lu).length,
    notifications: mine.slice(0, 100)
  })
})

app.put('/api/mes-notifications/lire-tout', requireAuth, (req, res) => {
  const all = readData('notifications.json')
  let n = 0
  for (const it of all) {
    if (it.user_id === req.user.id && !it.lu) { it.lu = true; n++ }
  }
  writeData('notifications.json', all)
  res.json({ ok: true, marquees: n })
})

app.put('/api/mes-notifications/:id/lire', requireAuth, (req, res) => {
  const all = readData('notifications.json')
  const n = all.find(x => x.id === req.params.id && x.user_id === req.user.id)
  if (!n) return res.status(404).json({ error: 'Notification introuvable' })
  n.lu = true
  writeData('notifications.json', all)
  res.json(n)
})

// ============================================================
// PIECES JUSTIFICATIVES + OCR AUTO-DETECTION
// ============================================================

/**
 * Classes de pieces attendues pour un dossier logement social.
 * Chaque classe a des mots-cles qui permettent l'auto-detection par OCR.
 */
const PIECE_TYPES = {
  piece_identite: {
    libelle: 'Piece d\'identite',
    icone: 'badge',
    obligatoire: true,
    mots_cles: ['carte nationale', 'identite', 'passeport', 'titre de sejour', 'cni']
  },
  livret_famille: {
    libelle: 'Livret de famille',
    icone: 'family_restroom',
    obligatoire: false,
    mots_cles: ['livret de famille', 'mariage', 'naissance']
  },
  avis_imposition: {
    libelle: 'Avis d\'imposition',
    icone: 'receipt_long',
    obligatoire: true,
    mots_cles: ['avis d\'impot', 'impot sur le revenu', 'revenu fiscal de reference', 'direction generale des finances', 'rfr']
  },
  bulletins_salaire: {
    libelle: 'Bulletins de salaire (3 derniers)',
    icone: 'payments',
    obligatoire: true,
    mots_cles: ['bulletin de salaire', 'net a payer', 'cotisations', 'employeur', 'siret']
  },
  attestation_caf: {
    libelle: 'Attestation CAF',
    icone: 'family_restroom',
    obligatoire: false,
    mots_cles: ['caisse d\'allocations familiales', 'caf', 'allocations', 'quotient familial', 'paje']
  },
  attestation_pole_emploi: {
    libelle: 'Attestation Pole Emploi',
    icone: 'work_off',
    obligatoire: false,
    mots_cles: ['pole emploi', 'france travail', 'allocation de retour', 'are', 'demandeur d\'emploi']
  },
  justificatif_domicile: {
    libelle: 'Justificatif de domicile',
    icone: 'home',
    obligatoire: true,
    mots_cles: ['facture', 'edf', 'engie', 'veolia', 'orange', 'bouygues', 'quittance de loyer']
  },
  rib: {
    libelle: 'RIB',
    icone: 'account_balance',
    obligatoire: false,
    mots_cles: ['releve d\'identite bancaire', 'rib', 'iban', 'bic']
  },
  certificat_scolarite: {
    libelle: 'Certificat de scolarite',
    icone: 'school',
    obligatoire: false,
    mots_cles: ['certificat de scolarite', 'inscription', 'ecole', 'college', 'lycee', 'universite', 'rectorat']
  },
  mdph: {
    libelle: 'Notification MDPH',
    icone: 'accessible',
    obligatoire: false,
    mots_cles: ['mdph', 'maison departementale des personnes handicapees', 'aah', 'pch', 'taux d\'incapacite']
  },
  jugement_divorce: {
    libelle: 'Jugement / ordonnance',
    icone: 'gavel',
    obligatoire: false,
    mots_cles: ['tribunal', 'jugement', 'divorce', 'ordonnance', 'juge aux affaires familiales', 'jaf']
  },
  attestation_hebergement: {
    libelle: 'Attestation d\'hebergement',
    icone: 'hotel',
    obligatoire: false,
    mots_cles: ['attestation d\'hebergement', 'herberge', 'hebergeur']
  },
  dalo: {
    libelle: 'Decision DALO',
    icone: 'verified',
    obligatoire: false,
    mots_cles: ['dalo', 'droit au logement opposable', 'commission de mediation']
  },
  autre: {
    libelle: 'Autre piece',
    icone: 'attach_file',
    obligatoire: false,
    mots_cles: []
  }
}

function detectPieceType(texteOuNomFichier) {
  const txt = (texteOuNomFichier || '').toLowerCase()
  let meilleur = { type: 'autre', score: 0, motsTrouves: [] }
  for (const [type, def] of Object.entries(PIECE_TYPES)) {
    const trouves = def.mots_cles.filter(mc => txt.includes(mc))
    if (trouves.length > meilleur.score) {
      meilleur = { type, score: trouves.length, motsTrouves: trouves }
    }
  }
  return meilleur
}

app.get('/api/pieces/types', requireAuth, (req, res) => {
  res.json(PIECE_TYPES)
})

app.get('/api/pieces/:dem_id', requireAuth, (req, res) => {
  const all = readData('pieces.json')
  const dem_pieces = all.filter(p => p.dem_id === req.params.dem_id)
    .sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''))
  // checklist des pieces obligatoires manquantes
  const presents = new Set(dem_pieces.filter(p => p.statut !== 'refusee').map(p => p.type))
  const manquantes = Object.entries(PIECE_TYPES)
    .filter(([k, v]) => v.obligatoire && !presents.has(k))
    .map(([k, v]) => ({ type: k, libelle: v.libelle, icone: v.icone }))
  res.json({ pieces: dem_pieces, manquantes, total: dem_pieces.length })
})

app.post('/api/pieces', requireAuth, (req, res) => {
  const {
    dem_id,
    nom_fichier,
    mime,
    taille,
    contenu_base64,
    texte_extrait,
    type_force
  } = req.body || {}

  if (!dem_id) return res.status(400).json({ error: 'dem_id requis' })
  if (!nom_fichier) return res.status(400).json({ error: 'nom_fichier requis' })

  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === dem_id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })

  // auto-detection : on combine le nom du fichier et le texte OCR extrait cote client
  const sourceDetection = (nom_fichier + ' ' + (texte_extrait || '')).toLowerCase()
  const detection = detectPieceType(sourceDetection)
  const type = type_force && PIECE_TYPES[type_force] ? type_force : detection.type

  const all = readData('pieces.json')
  const piece = {
    id: nextId(all, 'PJ'),
    dem_id,
    dem_nom: dem.nom + ' ' + (dem.prenom || ''),
    nom_fichier,
    mime: mime || 'application/octet-stream',
    taille: typeof taille === 'number' ? taille : 0,
    type,
    type_detecte: detection.type,
    detection_confiance: detection.score,
    detection_mots_trouves: detection.motsTrouves,
    type_force: !!type_force,
    texte_extrait: (texte_extrait || '').slice(0, 5000),
    // on stocke le contenu base64 pour relecture, mais tronque si trop gros
    contenu_base64: (contenu_base64 || '').slice(0, 2 * 1024 * 1024),
    statut: 'a_valider',
    uploaded_by: req.user.id,
    uploaded_by_nom: req.user.nom,
    uploaded_at: new Date().toISOString(),
    valide_par: null,
    valide_le: null,
    motif_refus: null
  }
  all.push(piece)
  writeData('pieces.json', all)

  addLog(req.user, 'PIECE_UPLOAD', dem_id + ' : ' + nom_fichier + ' (type: ' + type + ')')
  addAudit(req.user, 'demandeur', dem_id, dem.nom, 'piece_ajout', [
    { champ: 'piece', ancien: '', nouveau: nom_fichier + ' (' + (PIECE_TYPES[type]?.libelle || type) + ')' }
  ], 'Upload piece justificative')

  rtBroadcast('piece_uploaded', { dem_id, piece: { ...piece, contenu_base64: undefined } })
  res.json(piece)
})

app.put('/api/pieces/:id/valider', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const all = readData('pieces.json')
  const p = all.find(x => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  p.statut = 'validee'
  p.valide_par = req.user.nom
  p.valide_le = new Date().toISOString()
  p.motif_refus = null
  writeData('pieces.json', all)
  addAudit(req.user, 'demandeur', p.dem_id, p.dem_nom, 'piece_validation', [
    { champ: 'piece_' + p.type, ancien: 'a_valider', nouveau: 'validee' }
  ], 'Validation piece')
  rtBroadcast('piece_updated', { dem_id: p.dem_id, piece: { ...p, contenu_base64: undefined } })
  res.json(p)
})

app.put('/api/pieces/:id/refuser', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { motif } = req.body || {}
  if (!motif || !motif.trim()) return res.status(400).json({ error: 'Motif obligatoire', need_motif: true })
  const all = readData('pieces.json')
  const p = all.find(x => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  p.statut = 'refusee'
  p.valide_par = req.user.nom
  p.valide_le = new Date().toISOString()
  p.motif_refus = motif.trim()
  writeData('pieces.json', all)
  addAudit(req.user, 'demandeur', p.dem_id, p.dem_nom, 'piece_refus', [
    { champ: 'piece_' + p.type, ancien: 'a_valider', nouveau: 'refusee' }
  ], motif)
  rtBroadcast('piece_updated', { dem_id: p.dem_id, piece: { ...p, contenu_base64: undefined } })
  res.json(p)
})

app.put('/api/pieces/:id/reclassifier', requireAuth, (req, res) => {
  const { type } = req.body || {}
  if (!type || !PIECE_TYPES[type]) return res.status(400).json({ error: 'Type inconnu' })
  const all = readData('pieces.json')
  const p = all.find(x => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  const ancien = p.type
  p.type = type
  p.type_force = true
  writeData('pieces.json', all)
  addAudit(req.user, 'demandeur', p.dem_id, p.dem_nom, 'piece_reclassification', [
    { champ: 'type', ancien, nouveau: type }
  ], 'Reclassification manuelle')
  rtBroadcast('piece_updated', { dem_id: p.dem_id, piece: { ...p, contenu_base64: undefined } })
  res.json(p)
})

app.delete('/api/pieces/:id', requireAuth, (req, res) => {
  const { motif } = req.body || {}
  if (!motif || !motif.trim()) return res.status(400).json({ error: 'Motif obligatoire', need_motif: true })
  const all = readData('pieces.json')
  const idx = all.findIndex(x => x.id === req.params.id)
  if (idx < 0) return res.status(404).json({ error: 'Piece introuvable' })
  const p = all[idx]
  if (p.uploaded_by !== req.user.id && req.user.role !== 'directeur') {
    return res.status(403).json({ error: 'Seul l\'auteur ou le directeur peut supprimer' })
  }
  all.splice(idx, 1)
  writeData('pieces.json', all)
  addAudit(req.user, 'demandeur', p.dem_id, p.dem_nom, 'piece_suppression', [], motif)
  rtBroadcast('piece_deleted', { dem_id: p.dem_id, piece_id: p.id })
  res.json({ ok: true })
})

app.get('/api/pieces/:id/contenu', requireAuth, (req, res) => {
  const all = readData('pieces.json')
  const p = all.find(x => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Piece introuvable' })
  res.json({
    id: p.id,
    nom_fichier: p.nom_fichier,
    mime: p.mime,
    contenu_base64: p.contenu_base64 || ''
  })
})

// ============================================================
// WORKFLOW KANBAN (etapes dossier)
// ============================================================

const WORKFLOW_ETAPES = [
  { id: 'reception',    libelle: 'Reception',       couleur: '#64748b', ordre: 1, description: 'Demande enregistree, piece(s) en cours de collecte' },
  { id: 'instruction',  libelle: 'Instruction',     couleur: '#3b82f6', ordre: 2, description: 'Analyse des pieces, verification des criteres' },
  { id: 'cotation',     libelle: 'Cotation',        couleur: '#8b5cf6', ordre: 3, description: 'Calcul du score et priorisation' },
  { id: 'cal',          libelle: 'CAL programmee',  couleur: '#f59e0b', ordre: 4, description: 'Passage en commission d\'attribution' },
  { id: 'attribution',  libelle: 'Attribution',     couleur: '#10b981', ordre: 5, description: 'Logement propose au candidat' },
  { id: 'notification', libelle: 'Notification',    couleur: '#06b6d4', ordre: 6, description: 'Courrier / Telegram envoye' },
  { id: 'signature',    libelle: 'Bail signe',      couleur: '#16a34a', ordre: 7, description: 'Dossier finalise' },
  { id: 'archive',      libelle: 'Archive',         couleur: '#94a3b8', ordre: 8, description: 'Dossier cloture' }
]

app.get('/api/workflow/etapes', requireAuth, (req, res) => {
  res.json(WORKFLOW_ETAPES)
})

app.get('/api/workflow/kanban', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const pieces = readData('pieces.json')
  const byEtape = {}
  for (const e of WORKFLOW_ETAPES) byEtape[e.id] = []
  for (const d of demandeurs) {
    if (d.archive) continue
    const etape = d.workflow_etape || 'reception'
    if (!byEtape[etape]) byEtape[etape] = []
    const dem_pieces = pieces.filter(p => p.dem_id === d.id)
    const nbPiecesValid = dem_pieces.filter(p => p.statut === 'validee').length
    const piecesObligatoires = Object.values(PIECE_TYPES).filter(x => x.obligatoire).length
    byEtape[etape].push({
      id: d.id,
      nom: d.nom + ' ' + (d.prenom || ''),
      score: d.score || 0,
      typologie: d.typologie || '',
      composition: d.composition_familiale || '',
      dalo: d.dalo || false,
      urgence: d.urgence || 'normale',
      nb_pieces_validees: nbPiecesValid,
      nb_pieces_obligatoires: piecesObligatoires,
      date_depot: d.date_depot || d.created_at || null,
      quartier: d.quartier_souhaite || ''
    })
  }
  res.json({
    etapes: WORKFLOW_ETAPES,
    colonnes: byEtape,
    total: demandeurs.filter(d => !d.archive).length
  })
})

app.put('/api/workflow/deplacer/:dem_id', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const { etape, motif } = req.body || {}
  if (!etape) return res.status(400).json({ error: 'etape requise' })
  const etapeObj = WORKFLOW_ETAPES.find(e => e.id === etape)
  if (!etapeObj) return res.status(400).json({ error: 'Etape inconnue' })

  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === req.params.dem_id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })

  const ancienne = dem.workflow_etape || 'reception'
  if (ancienne === etape) return res.json(dem)

  dem.workflow_etape = etape
  dem.workflow_etape_at = new Date().toISOString()
  dem.workflow_etape_par = req.user.nom
  writeData('demandeurs.json', demandeurs)

  addLog(req.user, 'WORKFLOW_ETAPE', dem.id + ' : ' + ancienne + ' -> ' + etape)
  addAudit(req.user, 'demandeur', dem.id, dem.nom, 'workflow', [
    { champ: 'etape', ancien: ancienne, nouveau: etape }
  ], motif || 'Deplacement kanban')

  rtBroadcast('workflow_moved', {
    dem_id: dem.id,
    nom: dem.nom + ' ' + (dem.prenom || ''),
    ancienne,
    nouvelle: etape,
    par: req.user.nom
  })

  res.json(dem)
})

// ============================================================
// MESSAGERIE INTERNE (agent - candidat - elu) par dossier
// ============================================================

app.get('/api/messages/:dem_id', requireAuth, (req, res) => {
  const all = readData('messages.json')
  const msgs = all.filter(m => m.dem_id === req.params.dem_id)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  // marque comme lu pour l'utilisateur courant
  let modifie = false
  for (const m of msgs) {
    m.lu_par = m.lu_par || []
    if (!m.lu_par.includes(req.user.id) && m.from_user_id !== req.user.id) {
      m.lu_par.push(req.user.id)
      modifie = true
    }
  }
  if (modifie) writeData('messages.json', all)
  res.json(msgs)
})

app.post('/api/messages', requireAuth, (req, res) => {
  const { dem_id, texte, destinataires, canal } = req.body || {}
  if (!dem_id) return res.status(400).json({ error: 'dem_id requis' })
  if (!texte || !texte.trim()) return res.status(400).json({ error: 'texte requis' })

  const demandeurs = readData('demandeurs.json')
  const dem = demandeurs.find(d => d.id === dem_id)
  if (!dem) return res.status(404).json({ error: 'Demandeur introuvable' })

  const all = readData('messages.json')
  const message = {
    id: nextId(all, 'MS'),
    dem_id,
    from_user_id: req.user.id,
    from_user_nom: req.user.nom,
    from_role: req.user.role,
    canal: canal || 'interne', // interne | sms | email | telegram
    destinataires: Array.isArray(destinataires) ? destinataires : [],
    texte: texte.trim(),
    created_at: new Date().toISOString(),
    lu_par: [req.user.id],
    tracking: {
      envoye: true,
      livre: null,
      lu: null,
      erreur: null
    }
  }
  all.push(message)
  writeData('messages.json', all)

  // broadcast pour MAJ temps reel de la conversation
  rtBroadcast('message_sent', { dem_id, message })

  // notifie les destinataires s'ils sont connectes
  for (const uid of message.destinataires) {
    rtBroadcastToUser(uid, 'message_recu', { dem_id, from: req.user.nom, extrait: texte.slice(0, 140) })
  }

  addLog(req.user, 'MESSAGE_INTERNE', dem_id + ' : ' + message.destinataires.length + ' destinataire(s)')

  // si canal = telegram et qu'on a un chat_id du candidat, on envoie
  if (canal === 'telegram') {
    const chat = tgGetChatId('demandeur', dem_id)
    if (chat) {
      tgSend(chat, '<b>Message de ' + req.user.nom + '</b>\n\n' + texte).catch(() => {})
      message.tracking.livre = new Date().toISOString()
      writeData('messages.json', all)
    } else {
      message.tracking.erreur = 'Chat Telegram non enregistre'
      writeData('messages.json', all)
    }
  }

  res.json(message)
})

app.get('/api/mes-conversations', requireAuth, (req, res) => {
  const all = readData('messages.json')
  const demandeurs = readData('demandeurs.json')
  // mine = conversations ou je suis expediteur OU destinataire
  const mine = all.filter(m =>
    m.from_user_id === req.user.id ||
    (m.destinataires || []).includes(req.user.id)
  )
  // group by dem_id
  const byDem = {}
  for (const m of mine) {
    byDem[m.dem_id] = byDem[m.dem_id] || []
    byDem[m.dem_id].push(m)
  }
  const conv = Object.entries(byDem).map(([dem_id, msgs]) => {
    msgs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const dem = demandeurs.find(d => d.id === dem_id)
    const dernier = msgs[0]
    const nonLus = msgs.filter(m =>
      m.from_user_id !== req.user.id &&
      !(m.lu_par || []).includes(req.user.id)
    ).length
    return {
      dem_id,
      dem_nom: dem ? (dem.nom + ' ' + (dem.prenom || '')) : '(dossier supprime)',
      dernier_message: dernier.texte.slice(0, 140),
      dernier_auteur: dernier.from_user_nom,
      dernier_at: dernier.created_at,
      non_lus: nonLus,
      total: msgs.length
    }
  })
  conv.sort((a, b) => (b.dernier_at || '').localeCompare(a.dernier_at || ''))
  res.json(conv)
})

// ============================================================
// RELANCES AUTOMATIQUES
// ============================================================

const RELANCE_REGLES = [
  { id: 'piece_manquante_7', libelle: 'Piece manquante J+7',  delai_jours: 7,  type: 'piece', titre: 'Pieces manquantes' },
  { id: 'candidat_silence_15', libelle: 'Silence candidat J+15', delai_jours: 15, type: 'reponse_candidat', titre: 'Pas de reponse candidat' },
  { id: 'dossier_inactif_30', libelle: 'Dossier inactif J+30', delai_jours: 30, type: 'inactivite', titre: 'Dossier sans mise a jour' },
  { id: 'post_cal_7', libelle: 'Post-CAL J+7 (sans signature)', delai_jours: 7, type: 'post_cal', titre: 'Attribution sans signature' }
]

app.get('/api/relances/regles', requireAuth, (req, res) => {
  res.json(RELANCE_REGLES)
})

app.get('/api/relances', requireAuth, (req, res) => {
  const all = readData('relances.json')
  res.json(all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')))
})

/**
 * Calcule les relances a faire MAINTENANT en scannant les demandeurs.
 * Ne persiste QUE les nouvelles relances.
 */
app.post('/api/relances/analyser', requireAuth, requireRole('agent', 'directeur'), (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const pieces = readData('pieces.json')
  const messages = readData('messages.json')
  const relances = readData('relances.json')
  const nouvelles = []
  const now = Date.now()
  const joursMs = 24 * 3600 * 1000

  const dejaRelance = (dem_id, type) => {
    const recent = relances.find(r =>
      r.dem_id === dem_id &&
      r.regle === type &&
      (now - new Date(r.created_at).getTime()) < 7 * joursMs
    )
    return !!recent
  }

  for (const d of demandeurs) {
    if (d.archive) continue

    // Regle 1 : piece manquante depuis > 7j
    const piecesObl = Object.entries(PIECE_TYPES).filter(([k, v]) => v.obligatoire)
    const dem_pieces = pieces.filter(p => p.dem_id === d.id && p.statut !== 'refusee')
    const presents = new Set(dem_pieces.map(p => p.type))
    const manquantes = piecesObl.filter(([k]) => !presents.has(k)).map(([k, v]) => v.libelle)
    if (manquantes.length > 0) {
      const depotAge = d.date_depot ? (now - new Date(d.date_depot).getTime()) / joursMs : 999
      if (depotAge > 7 && !dejaRelance(d.id, 'piece_manquante_7')) {
        nouvelles.push({
          id: nextId(relances, 'RL'),
          dem_id: d.id,
          dem_nom: d.nom + ' ' + (d.prenom || ''),
          regle: 'piece_manquante_7',
          titre: 'Pieces manquantes depuis plus de 7 jours',
          detail: manquantes.join(', '),
          created_at: new Date().toISOString(),
          traitee: false,
          traitee_par: null,
          traitee_le: null
        })
      }
    }

    // Regle 2 : silence candidat J+15 - dernier message du candidat trop ancien
    const msgsDem = messages.filter(m => m.dem_id === d.id)
    const dernierCandidat = msgsDem.filter(m => m.from_role === 'candidat' || m.canal === 'telegram')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
    if (dernierCandidat) {
      const age = (now - new Date(dernierCandidat.created_at).getTime()) / joursMs
      if (age > 15 && !dejaRelance(d.id, 'candidat_silence_15')) {
        nouvelles.push({
          id: nextId(relances, 'RL'),
          dem_id: d.id,
          dem_nom: d.nom + ' ' + (d.prenom || ''),
          regle: 'candidat_silence_15',
          titre: 'Silence candidat > 15 jours',
          detail: 'Dernier contact : ' + dernierCandidat.created_at.slice(0, 10),
          created_at: new Date().toISOString(),
          traitee: false,
          traitee_par: null,
          traitee_le: null
        })
      }
    }

    // Regle 3 : dossier inactif 30j
    const lastAudit = d.updated_at || d.created_at || d.date_depot
    if (lastAudit) {
      const age = (now - new Date(lastAudit).getTime()) / joursMs
      if (age > 30 && !dejaRelance(d.id, 'dossier_inactif_30')) {
        nouvelles.push({
          id: nextId(relances, 'RL'),
          dem_id: d.id,
          dem_nom: d.nom + ' ' + (d.prenom || ''),
          regle: 'dossier_inactif_30',
          titre: 'Dossier sans mise a jour > 30 jours',
          detail: 'Derniere MAJ : ' + lastAudit.slice(0, 10),
          created_at: new Date().toISOString(),
          traitee: false,
          traitee_par: null,
          traitee_le: null
        })
      }
    }

    // Regle 4 : post-CAL, attribution sans signature > 7j
    if (d.workflow_etape === 'attribution' && d.workflow_etape_at) {
      const age = (now - new Date(d.workflow_etape_at).getTime()) / joursMs
      if (age > 7 && !dejaRelance(d.id, 'post_cal_7')) {
        nouvelles.push({
          id: nextId(relances, 'RL'),
          dem_id: d.id,
          dem_nom: d.nom + ' ' + (d.prenom || ''),
          regle: 'post_cal_7',
          titre: 'Attribution sans signature > 7 jours',
          detail: 'En attribution depuis ' + d.workflow_etape_at.slice(0, 10),
          created_at: new Date().toISOString(),
          traitee: false,
          traitee_par: null,
          traitee_le: null
        })
      }
    }
  }

  if (nouvelles.length > 0) {
    const all = [...relances, ...nouvelles]
    writeData('relances.json', all)
    addLog(req.user, 'RELANCES_ANALYSE', nouvelles.length + ' nouvelles')
    rtBroadcast('relances_generees', { nb: nouvelles.length })
  }

  res.json({
    ok: true,
    nouvelles: nouvelles.length,
    total: readData('relances.json').filter(r => !r.traitee).length,
    detail: nouvelles
  })
})

app.put('/api/relances/:id/traiter', requireAuth, (req, res) => {
  const { action, commentaire } = req.body || {}
  const all = readData('relances.json')
  const r = all.find(x => x.id === req.params.id)
  if (!r) return res.status(404).json({ error: 'Relance introuvable' })
  r.traitee = true
  r.traitee_par = req.user.nom
  r.traitee_le = new Date().toISOString()
  r.action = action || 'fait'
  r.commentaire = commentaire || ''
  writeData('relances.json', all)
  addAudit(req.user, 'demandeur', r.dem_id, r.dem_nom, 'relance_traitee', [], r.titre + ' / ' + (action || 'fait'))
  res.json(r)
})

// ============================================================
// PV CAL - SIGNATURE ELECTRONIQUE (PIN directeur + hash + horodatage)
// ============================================================

/**
 * Le directeur signe electroniquement un PV de CAL avec son PIN personnel.
 * Un hash SHA-256 du contenu de la decision est calcule + horodatage ISO + qui signe.
 * Ces trois elements constituent la "signature" et sont stockes sur la decision.
 * Le hash permet de detecter toute modification ulterieure (integrite).
 */
function hashDecision(dec) {
  // Canonical JSON : on trie les cles et on enleve les champs de signature
  const clone = { ...dec }
  delete clone.signature
  const sorted = JSON.stringify(clone, Object.keys(clone).sort())
  return createHash('sha256').update(sorted, 'utf8').digest('hex')
}

app.post('/api/cal/pv/:decision_id/signer', requireAuth, requireRole('directeur'), (req, res) => {
  const { pin } = req.body || {}
  if (!pin || typeof pin !== 'string' || pin.length < 4) {
    return res.status(400).json({ error: 'PIN requis (4 chiffres minimum)' })
  }

  // Recuperer le user complet (avec pin) - requireAuth ne renvoie pas le pin
  const users = readData('users.json')
  const user = users.find(u => u.id === req.user.id)
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

  // Le PIN peut etre stocke en clair sur le user (champ pin) ou dans l'env DIRECTEUR_PIN
  const expectedPin = user.pin || process.env.DIRECTEUR_PIN || ''
  if (!expectedPin) {
    return res.status(400).json({
      error: 'Aucun PIN configure. Le directeur doit d abord definir son PIN via /api/auth/set-pin ou la variable DIRECTEUR_PIN.'
    })
  }
  if (pin !== expectedPin) {
    addLog(req.user, 'PV_SIGNATURE_PIN_KO', 'decision: ' + req.params.decision_id)
    return res.status(401).json({ error: 'PIN incorrect' })
  }

  const decisions = readData('decisions_cal.json')
  const idx = decisions.findIndex(d => d.id === req.params.decision_id)
  if (idx === -1) return res.status(404).json({ error: 'Decision introuvable' })

  const dec = decisions[idx]
  if (dec.signature && dec.signature.signed) {
    return res.status(409).json({ error: 'Ce PV est deja signe', signature: dec.signature })
  }

  const horodatage = new Date().toISOString()
  const hash = hashDecision(dec)
  // Signature = hash salted par le nom du signataire + horodatage
  const sig = createHash('sha256').update(hash + '|' + req.user.id + '|' + horodatage, 'utf8').digest('hex')

  dec.signature = {
    signed: true,
    signed_by_id: req.user.id,
    signed_by_name: req.user.prenom + ' ' + req.user.nom,
    signed_by_role: req.user.role,
    signed_at: horodatage,
    content_hash: hash,
    signature_hash: sig,
    algorithm: 'SHA-256',
    pin_verified: true
  }
  decisions[idx] = dec
  writeData('decisions_cal.json', decisions)

  addLog(req.user, 'PV_SIGNATURE', 'decision: ' + dec.id + ' - hash: ' + sig.substring(0, 12))
  addAudit(req.user, 'decision_cal', dec.id, dec.nom_commission || dec.id, 'signature', [
    { champ: 'signature', label: 'Signature electronique', avant: 'non signe', apres: 'signe par ' + req.user.prenom + ' ' + req.user.nom }
  ], 'Signature electronique du PV CAL')

  res.json({ ok: true, signature: dec.signature })
})

/**
 * Verification d'integrite : recalcule le hash et compare.
 */
app.get('/api/cal/pv/:decision_id/verifier', requireAuth, (req, res) => {
  const decisions = readData('decisions_cal.json')
  const dec = decisions.find(d => d.id === req.params.decision_id)
  if (!dec) return res.status(404).json({ error: 'Decision introuvable' })
  if (!dec.signature || !dec.signature.signed) {
    return res.json({ signed: false })
  }
  const recalcule = hashDecision(dec)
  const valide = recalcule === dec.signature.content_hash
  res.json({
    signed: true,
    valide,
    hash_stocke: dec.signature.content_hash,
    hash_recalcule: recalcule,
    signature: dec.signature
  })
})

/**
 * Definir / changer son PIN (directeur uniquement).
 */
app.post('/api/auth/set-pin', requireAuth, requireRole('directeur'), (req, res) => {
  const { pin, password } = req.body || {}
  if (!pin || !/^\d{4,8}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN invalide (4 a 8 chiffres)' })
  }
  const users = readData('users.json')
  const idx = users.findIndex(u => u.id === req.user.id)
  if (idx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' })
  // Confirmation par mot de passe
  if (users[idx].password !== password) {
    return res.status(401).json({ error: 'Mot de passe incorrect' })
  }
  users[idx].pin = pin
  writeData('users.json', users)
  addLog(req.user, 'SET_PIN', 'PIN directeur mis a jour')
  res.json({ ok: true })
})

// ============================================================
// PV CAL - generation HTML imprimable (type PDF)
// ============================================================

app.get('/api/cal/pv/:decision_id', requireAuth, (req, res) => {
  const decisions = readData('decisions_cal.json')
  const dec = decisions.find(d => d.id === req.params.decision_id)
  if (!dec) return res.status(404).json({ error: 'Decision introuvable' })

  const demandeurs = readData('demandeurs.json')
  const logements = readData('logements.json')
  const elus = readData('referentiels.json') // pas exact, selon le schema
  const logement = logements.find(l => l.id === dec.logement_id) || {}
  const candidats = (dec.candidats || []).map(c => {
    const d = demandeurs.find(x => x.id === c.dem_id) || {}
    return { ...c, nom: d.nom, prenom: d.prenom, score: d.score, typologie: d.typologie }
  })

  const style = `
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { border-bottom: 3px solid #1e3a8a; padding-bottom: 8px; color: #1e3a8a; }
    h2 { color: #1e3a8a; margin-top: 28px; }
    .entete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
    .logo { font-weight: bold; font-size: 20px; color: #1e3a8a; }
    .meta { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .meta dt { font-weight: 600; display: inline-block; min-width: 180px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #1e3a8a; color: white; padding: 10px; text-align: left; }
    td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
    tr.retenu { background: #dcfce7; font-weight: 600; }
    .decision { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 220px; }
    .footer { margin-top: 40px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    @media print { body { margin: 0; } .no-print { display: none; } }
  `

  const dateFr = new Date(dec.date || Date.now()).toLocaleDateString('fr-FR')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>PV CAL ${dec.id} - ${dec.nom_commission || ''}</title>
<style>${style}</style>
</head>
<body>
<div class="no-print" style="margin: 10px 0; text-align: right;">
  <button onclick="window.print()" style="padding: 8px 16px; background: #1e3a8a; color: white; border: none; border-radius: 6px; cursor: pointer;">Imprimer / PDF</button>
</div>
<div class="entete">
  <div class="logo">Logivia &middot; Ville de Saint-Denis</div>
  <div style="text-align: right; font-size: 12px; color: #64748b;">
    Reference : ${dec.id}<br>
    Edition : ${new Date().toLocaleString('fr-FR')}
  </div>
</div>
<h1>Proces-verbal de la Commission d'Attribution des Logements</h1>
<div class="meta">
  <dt>Date :</dt> ${dateFr}<br>
  <dt>Commission :</dt> ${dec.nom_commission || 'CAL'}<br>
  <dt>President :</dt> ${dec.president || '(non renseigne)'}<br>
  <dt>Bailleur :</dt> ${logement.bailleur || '(non renseigne)'}
</div>

<h2>Logement concerne</h2>
<div class="meta">
  <dt>Reference :</dt> ${logement.id || ''}<br>
  <dt>Adresse :</dt> ${logement.adresse || ''} - ${logement.code_postal || ''} ${logement.ville || ''}<br>
  <dt>Typologie :</dt> ${logement.typologie || ''} - ${logement.surface || '?'} m<sup>2</sup><br>
  <dt>Loyer :</dt> ${logement.loyer || '?'} &euro; / mois<br>
  <dt>Financement :</dt> ${logement.financement || '(non renseigne)'}
</div>

<h2>Candidats examines (${candidats.length})</h2>
<table>
<thead>
<tr><th>Rang</th><th>Candidat</th><th>Composition</th><th>Score</th><th>Typologie demandee</th><th>Decision</th></tr>
</thead>
<tbody>
${candidats.map((c, i) => `
  <tr class="${c.statut === 'retenu' ? 'retenu' : ''}">
    <td>${i + 1}</td>
    <td>${c.nom || ''} ${c.prenom || ''}</td>
    <td>${c.composition || '-'}</td>
    <td>${c.score || 0}</td>
    <td>${c.typologie || '-'}</td>
    <td><b>${(c.statut || 'examine').toUpperCase()}</b></td>
  </tr>
`).join('')}
</tbody>
</table>

<div class="decision">
  <b>Decision de la commission :</b><br>
  ${dec.decision_texte || 'Decision non renseignee.'}
</div>

${dec.motif ? `<p><b>Motif :</b> ${dec.motif}</p>` : ''}

<div class="signatures">
  <div class="sig">Le President<br>${dec.president || ''}</div>
  <div class="sig">Le Rapporteur<br>&nbsp;</div>
  <div class="sig">Le Secretaire<br>&nbsp;</div>
</div>

${dec.signature && dec.signature.signed ? `
<div style="margin-top: 40px; padding: 16px; border: 2px solid #16a34a; border-radius: 8px; background: #f0fdf4;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
    <b style="color: #166534; font-size: 13pt;">&#10004; PV signe electroniquement</b>
    <span style="font-size: 10pt; color: #16a34a; font-weight: 600;">Algorithme : ${dec.signature.algorithm || 'SHA-256'}</span>
  </div>
  <div style="font-size: 11pt; color: #166534; line-height: 1.7;">
    <b>Signataire :</b> ${dec.signature.signed_by_name || ''} (${dec.signature.signed_by_role || 'directeur'})<br>
    <b>Horodatage :</b> ${new Date(dec.signature.signed_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium' })}<br>
    <b>Empreinte du contenu (hash) :</b><br>
    <code style="font-size: 9pt; color: #1e293b; background: #fff; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; word-break: break-all; display: inline-block; max-width: 100%;">${dec.signature.content_hash || ''}</code><br>
    <b>Signature :</b><br>
    <code style="font-size: 9pt; color: #1e293b; background: #fff; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px; word-break: break-all; display: inline-block; max-width: 100%;">${dec.signature.signature_hash || ''}</code>
  </div>
  <div style="margin-top: 10px; font-size: 9pt; color: #475569; font-style: italic;">
    La signature electronique ci-dessus garantit l integrite et la non-repudiation du present PV.
    Toute modification ulterieure du contenu invalide la signature. Verification : GET /api/cal/pv/${dec.id}/verifier
  </div>
</div>
` : `
<div style="margin-top: 40px; padding: 12px; border: 1px dashed #94a3b8; border-radius: 8px; background: #f8fafc;">
  <b style="color: #64748b;">PV non signe electroniquement</b><br>
  <span style="font-size: 10pt; color: #64748b;">Le directeur peut signer ce PV avec son PIN personnel (bouton "Signer le PV" dans l interface).</span>
</div>
`}

<div class="footer">
  PV genere automatiquement par Logivia v3.0 - Ville de Saint-Denis.<br>
  Conformement au Code de la construction et de l'habitation, art. L441-2, ce PV est a conserver 10 ans.<br>
  ${dec.signature && dec.signature.signed ? 'Signature electronique conforme aux principes eIDAS (integrite + horodatage + identification).' : 'Signature electronique disponible via PIN directeur.'}
</div>
</body>
</html>`

  res.type('html').send(html)
})

// ============================================================
// IA PREDICTIVE - estimation delai d'attribution
// ============================================================

/**
 * Modele simple base sur les demandeurs passes deja attribues.
 * Clustering par typologie + tranche de composition + DALO.
 */
function calculerDelaiMoyen(demandeurs, critere) {
  const attribuees = demandeurs.filter(d =>
    d.workflow_etape === 'signature' &&
    d.date_depot && d.workflow_etape_at &&
    critere(d)
  )
  if (attribuees.length === 0) return null
  const delais = attribuees.map(d => {
    const dep = new Date(d.date_depot).getTime()
    const att = new Date(d.workflow_etape_at).getTime()
    return Math.max(0, (att - dep) / (1000 * 3600 * 24))
  })
  delais.sort((a, b) => a - b)
  const moy = delais.reduce((s, x) => s + x, 0) / delais.length
  const median = delais[Math.floor(delais.length / 2)]
  return {
    echantillon: attribuees.length,
    delai_moyen_jours: Math.round(moy),
    delai_median_jours: Math.round(median),
    delai_min_jours: Math.round(delais[0]),
    delai_max_jours: Math.round(delais[delais.length - 1])
  }
}

app.post('/api/ia/predict-delai', requireAuth, (req, res) => {
  const { typologie, composition, dalo, score, prioritaire } = req.body || {}
  const demandeurs = readData('demandeurs.json')

  // 1. meme typologie + DALO
  const niv1 = calculerDelaiMoyen(demandeurs, d =>
    d.typologie === typologie && !!d.dalo === !!dalo
  )
  // 2. meme typologie uniquement
  const niv2 = calculerDelaiMoyen(demandeurs, d => d.typologie === typologie)
  // 3. global
  const niv3 = calculerDelaiMoyen(demandeurs, () => true)

  const meilleur = niv1 || niv2 || niv3
  if (!meilleur) {
    return res.json({
      disponible: false,
      message: 'Pas assez de donnees historiques pour une prediction fiable.'
    })
  }

  // ajustements selon score et DALO (heuristiques)
  let ajuste = meilleur.delai_moyen_jours
  if (score && score > 200) ajuste = Math.round(ajuste * 0.75)
  if (score && score > 350) ajuste = Math.round(ajuste * 0.6)
  if (dalo) ajuste = Math.round(ajuste * 0.5)
  if (prioritaire) ajuste = Math.round(ajuste * 0.65)

  // signaux faibles : candidats similaires actuellement bloques
  const similaires = demandeurs.filter(d =>
    d.typologie === typologie &&
    !d.archive &&
    d.workflow_etape &&
    d.workflow_etape !== 'signature' &&
    d.workflow_etape !== 'archive'
  )
  const enAttente = similaires.length

  const signaux = []
  if (enAttente > 20) signaux.push({ niveau: 'alerte', texte: enAttente + ' candidats en file d\'attente pour ce profil typologique' })
  if (niv1 && niv1.echantillon < 3) signaux.push({ niveau: 'info', texte: 'Peu de dossiers similaires historises (' + niv1.echantillon + '). Prediction a prendre avec prudence.' })
  if (!dalo && !prioritaire && ajuste > 365) signaux.push({ niveau: 'alerte', texte: 'Delai superieur a 1 an. Envisager une demande DALO si la situation le justifie.' })
  if (dalo && ajuste > 180) signaux.push({ niveau: 'alerte', texte: 'DALO avec delai > 6 mois : possible manquement legal, alerter le directeur.' })

  res.json({
    disponible: true,
    profil: { typologie, composition, dalo, score, prioritaire },
    base_statistique: {
      niveau: niv1 ? 'typologie + DALO' : niv2 ? 'typologie' : 'global',
      echantillon: meilleur.echantillon,
      moyenne: meilleur.delai_moyen_jours,
      mediane: meilleur.delai_median_jours,
      min: meilleur.delai_min_jours,
      max: meilleur.delai_max_jours
    },
    estimation_jours: ajuste,
    estimation_mois: Math.round(ajuste / 30 * 10) / 10,
    intervalle_confiance: {
      bas: Math.round(ajuste * 0.7),
      haut: Math.round(ajuste * 1.4)
    },
    concurrents_actuels: enAttente,
    signaux_faibles: signaux
  })
})

app.get('/api/ia/stats-globales', requireAuth, (req, res) => {
  const demandeurs = readData('demandeurs.json')
  const parTypo = {}
  for (const d of demandeurs) {
    if (d.archive) continue
    const t = d.typologie || 'inconnu'
    if (!parTypo[t]) parTypo[t] = { total: 0, attribues: 0, delais: [] }
    parTypo[t].total++
    if (d.workflow_etape === 'signature' && d.date_depot && d.workflow_etape_at) {
      parTypo[t].attribues++
      const dep = new Date(d.date_depot).getTime()
      const att = new Date(d.workflow_etape_at).getTime()
      parTypo[t].delais.push(Math.max(0, (att - dep) / (1000 * 3600 * 24)))
    }
  }
  const out = Object.entries(parTypo).map(([typo, v]) => ({
    typologie: typo,
    total: v.total,
    attribues: v.attribues,
    taux_attribution: v.total ? Math.round(v.attribues / v.total * 100) : 0,
    delai_moyen_jours: v.delais.length ? Math.round(v.delais.reduce((s, x) => s + x, 0) / v.delais.length) : null
  }))
  res.json({ par_typologie: out })
})

// ============================================================
// EXPORT CSV universel - demandeurs/audiences/decisions/logements/elus
// ============================================================
//
// Format CSV avec separateur ';' (standard Excel FR) + BOM UTF-8
// pour que les accents s'ouvrent correctement dans Excel sans reglage.
// Filtres alignes sur les endpoints de liste correspondants.

function csvEscape(v) {
  if (v === null || v === undefined) return ''
  let s
  if (typeof v === 'boolean') s = v ? 'Oui' : 'Non'
  else if (Array.isArray(v)) s = v.join(', ')
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCsv(rows, columns) {
  const cols = columns && columns.length
    ? columns
    : Object.keys(rows[0] || {}).map(k => ({ key: k, label: k }))
  const header = cols.map(c => csvEscape(c.label)).join(';')
  const body = rows.map(r => cols.map(c => {
    const val = typeof c.get === 'function' ? c.get(r) : r[c.key]
    return csvEscape(val)
  }).join(';')).join('\r\n')
  // BOM UTF-8 pour Excel
  return '\uFEFF' + header + '\r\n' + body + (body ? '\r\n' : '')
}

const EXPORT_COLUMNS = {
  demandeurs: [
    { key: 'id', label: 'ID' },
    { key: 'nud', label: 'NUD' },
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prenom' },
    { key: 'statut', label: 'Statut' },
    { key: 'typ_v', label: 'Typologie voulue' },
    { key: 'typ_min', label: 'Typologie min' },
    { key: 'typ_max', label: 'Typologie max' },
    { key: 'anc', label: 'Anciennete (ans)' },
    { key: 'adultes', label: 'Adultes' },
    { key: 'enfants', label: 'Enfants' },
    { key: 'compo', label: 'Composition' },
    { key: 'rev', label: 'Revenus' },
    { key: 'quartier_origine', label: 'Quartier origine' },
    { key: 'quartiers', label: 'Quartiers souhaites' },
    { key: 'secteurs', label: 'Secteurs' },
    { key: 'dalo', label: 'DALO' },
    { key: 'violences', label: 'Violences' },
    { key: 'sans_log', label: 'Sans logement' },
    { key: 'handicap', label: 'Handicap' },
    { key: 'expulsion', label: 'Expulsion' },
    { key: 'mutation', label: 'Mutation' },
    { key: 'grossesse', label: 'Grossesse' },
    { key: 'suroc', label: 'Suroccupation' },
    { key: 'pieces', label: 'Pieces completes' },
    { key: 'workflow_etape', label: 'Etape workflow' },
    { key: 'date_depot', label: 'Date depot' }
  ],
  audiences: [
    { key: 'id', label: 'ID' },
    { key: 'date_audience', label: 'Date audience' },
    { key: 'dem_id', label: 'ID demandeur' },
    { key: 'elu_id', label: 'ID elu' },
    { key: 'objet', label: 'Objet' },
    { key: 'quartier_origine', label: 'Quartier origine' },
    { key: 'quartier_elu', label: 'Quartier elu' },
    { key: 'quartier_souhaite', label: 'Quartier souhaite' },
    { key: 'quartier_attribue', label: 'Quartier attribue' },
    { key: 'favorable', label: 'Favorable' },
    { key: 'statut', label: 'Statut' },
    { key: 'notes', label: 'Notes' }
  ],
  decisions: [
    { key: 'id_cal', label: 'ID CAL' },
    { key: 'date_cal', label: 'Date CAL' },
    { key: 'logement_ref', label: 'Ref logement' },
    { key: 'logement_adresse', label: 'Adresse' },
    { key: 'dem_id', label: 'ID demandeur' },
    { key: 'dem_nom', label: 'Nom demandeur' },
    { key: 'decision', label: 'Decision' },
    { key: 'agent_nom', label: 'Agent' }
  ],
  logements: [
    { key: 'id', label: 'ID' },
    { key: 'ref', label: 'Reference' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'quartier', label: 'Quartier' },
    { key: 'typ', label: 'Typologie' },
    { key: 'surf', label: 'Surface' },
    { key: 'loyer', label: 'Loyer' },
    { key: 'charges', label: 'Charges' },
    { key: 'etage', label: 'Etage' },
    { key: 'ascenseur', label: 'Ascenseur' },
    { key: 'bailleur', label: 'Bailleur' },
    { key: 'statut', label: 'Statut' },
    { key: 'date_dispo', label: 'Date disponibilite' }
  ],
  elus: [
    { key: 'id', label: 'ID' },
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prenom' },
    { key: 'secteur', label: 'Secteur' },
    { key: 'quartiers', label: 'Quartiers' },
    { key: 'telephone', label: 'Telephone' },
    { key: 'email', label: 'Email' },
    { key: 'actif', label: 'Actif' }
  ]
}

app.get('/api/export/:entity', requireAuth, requireRole('directeur', 'agent'), (req, res) => {
  const entity = req.params.entity
  let rows = []

  try {
    if (entity === 'demandeurs') {
      rows = readData('demandeurs.json')
      const { statut, quartier, dalo, search } = req.query
      if (statut) rows = rows.filter(x => x.statut === statut)
      else rows = rows.filter(x => !x.statut || x.statut !== 'archive')
      if (quartier) rows = rows.filter(x => (x.quartiers || []).includes(quartier))
      if (dalo === 'true') rows = rows.filter(x => !!x.dalo)
      if (search) {
        const q = search.toLowerCase()
        rows = rows.filter(x => (x.nom + ' ' + x.prenom + ' ' + (x.nud || '')).toLowerCase().includes(q))
      }
    } else if (entity === 'audiences') {
      rows = readData('audiences.json')
      const { elu_id, dem_id, statut } = req.query
      if (elu_id) rows = rows.filter(x => x.elu_id === elu_id)
      if (dem_id) rows = rows.filter(x => x.dem_id === dem_id)
      if (statut) rows = rows.filter(x => x.statut === statut)
      // Restriction elu : que ses audiences
      if (req.user.role === 'elu' && req.user.elu_id) {
        rows = rows.filter(x => x.elu_id === req.user.elu_id)
      }
    } else if (entity === 'decisions' || entity === 'decisions-cal') {
      const decs = readData('decisions_cal.json')
      // Une ligne par candidat de chaque decision
      rows = decs.flatMap(d => (d.candidats || []).map(c => ({
        id_cal: d.id,
        date_cal: d.date_cal,
        logement_ref: d.logement_ref,
        logement_adresse: d.logement_adresse,
        dem_id: c.dem_id,
        dem_nom: c.nom || '',
        decision: c.decision || '',
        agent_nom: d.agent_nom || ''
      })))
    } else if (entity === 'logements') {
      rows = readData('logements.json')
    } else if (entity === 'elus') {
      const ref = readObj('referentiels.json', { elus: [] })
      rows = (ref.elus || []).filter(e => e.actif !== false)
    } else {
      return res.status(400).json({ error: 'Entite inconnue : ' + entity })
    }
  } catch (e) {
    return res.status(500).json({ error: 'Lecture donnees impossible : ' + e.message })
  }

  const cols = EXPORT_COLUMNS[entity] || Object.keys(rows[0] || {}).map(k => ({ key: k, label: k }))
  const csv = toCsv(rows, cols)
  const today = new Date().toISOString().split('T')[0]
  const filename = 'logivia_' + entity + '_' + today + '.csv'

  addLog(req.user, 'EXPORT_' + entity.toUpperCase(), rows.length + ' lignes')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"')
  res.send(csv)
})

// ============================================================
// CATCH-ALL React Router (production)
// ============================================================

if (existsSync(join(DIST, 'index.html'))) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(DIST, 'index.html'))
    }
  })
}

// ============================================================
// PURGE RGPD : retention / anonymisation automatique (cron interne)
// ============================================================

const RETENTION = {
  AUDIT_ANS: 5,
  LOGS_MOIS: 12,
  DEMANDES_RADIEES_MOIS: 12,
  DEMANDES_ATTRIBUEES_ANS: 5,
  RGPD_DEMANDES_ANS: 3,
  PIECES_AP_TRAITEMENT_MOIS: 12,
  COMPTE_INACTIF_DESACTIVATION_MOIS: 6,
  COMPTE_INACTIF_SUPPRESSION_MOIS: 24
}

function daysAgo(n) { return Date.now() - n * 86400000 }
function parseDateIso(s) {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function purgerRetention() {
  const rapport = {
    date: new Date().toISOString(),
    audit_supprimes: 0,
    logs_supprimes: 0,
    demandes_anonymisees: 0,
    rgpd_demandes_supprimees: 0,
    pieces_supprimees: 0,
    comptes_desactives: 0,
    comptes_supprimes: 0
  }

  try {
    // 1. Audit > 5 ans
    const audit = readData('audit.json')
    const cutoffAudit = daysAgo(RETENTION.AUDIT_ANS * 365)
    const auditKeep = audit.filter(a => (parseDateIso(a.date) || Date.now()) > cutoffAudit)
    rapport.audit_supprimes = audit.length - auditKeep.length
    if (rapport.audit_supprimes > 0) writeData('audit.json', auditKeep)

    // 2. Logs > 12 mois
    const logs = readData('logs.json')
    const cutoffLogs = daysAgo(RETENTION.LOGS_MOIS * 30)
    const logsKeep = logs.filter(l => (parseDateIso(l.date) || Date.now()) > cutoffLogs)
    rapport.logs_supprimes = logs.length - logsKeep.length
    if (rapport.logs_supprimes > 0) writeData('logs.json', logsKeep)

    // 3. Anonymisation des demandes attribuees > 5 ans
    const demandeurs = readData('demandeurs.json')
    const cutoffAttrib = daysAgo(RETENTION.DEMANDES_ATTRIBUEES_ANS * 365)
    let changedDem = false
    demandeurs.forEach((d, i) => {
      if (d.statut === 'attribue' && !d.anonymise && d.date_attribution) {
        if ((parseDateIso(d.date_attribution) || Date.now()) < cutoffAttrib) {
          demandeurs[i] = {
            id: d.id,
            nud: 'ANON-' + createHash('sha256').update(d.nud || '', 'utf8').digest('hex').substring(0, 12),
            nom: '[ANONYMISE]',
            prenom: '',
            date_naissance: null,
            adresse: null,
            tel: null,
            email: null,
            anc: d.anc,
            adultes: d.adultes,
            enfants: d.enfants,
            typ_v: d.typ_v,
            secteurs: d.secteurs,
            statut: 'anonymise',
            date_attribution: d.date_attribution,
            anonymise: true,
            anonymise_le: new Date().toISOString(),
            parcours: []
          }
          rapport.demandes_anonymisees++
          changedDem = true
        }
      }
    })
    if (changedDem) writeData('demandeurs.json', demandeurs)

    // 4. Demandes RGPD traitees > 3 ans
    const rgpd = readData('rgpd_demandes.json')
    const cutoffRgpd = daysAgo(RETENTION.RGPD_DEMANDES_ANS * 365)
    const rgpdKeep = rgpd.filter(r => {
      if (r.statut === 'recue') return true
      const date = parseDateIso(r.traitee_le || r.soumise_le) || Date.now()
      return date > cutoffRgpd
    })
    rapport.rgpd_demandes_supprimees = rgpd.length - rgpdKeep.length
    if (rapport.rgpd_demandes_supprimees > 0) writeData('rgpd_demandes.json', rgpdKeep)

    // 5. Pieces d une demande attribuee ou radiee depuis > 12 mois
    const pieces = readData('pieces_justificatives.json')
    const cutoffPieces = daysAgo(RETENTION.PIECES_AP_TRAITEMENT_MOIS * 30)
    const piecesKeep = []
    for (const p of pieces) {
      const dem = demandeurs.find(d => d.id === p.dem_id)
      if (!dem) continue  // orpheline : drop
      if (['attribue', 'anonymise', 'radie'].includes(dem.statut)) {
        const refDate = parseDateIso(dem.date_attribution || dem.date_radiation) || Date.now()
        if (refDate < cutoffPieces) {
          // purge fichier physique
          try {
            const filePath = join(DATA, 'pieces', p.dem_id, p.stored_name)
            if (existsSync(filePath)) unlinkSync(filePath)
          } catch (e) {}
          rapport.pieces_supprimees++
          continue
        }
      }
      piecesKeep.push(p)
    }
    if (rapport.pieces_supprimees > 0) writeData('pieces_justificatives.json', piecesKeep)

    // 6. Comptes inactifs
    const users = readData('users.json')
    const cutoffDesactiv = daysAgo(RETENTION.COMPTE_INACTIF_DESACTIVATION_MOIS * 30)
    const cutoffSupp = daysAgo(RETENTION.COMPTE_INACTIF_SUPPRESSION_MOIS * 30)
    const usersKeep = []
    let changedUsers = false
    for (const u of users) {
      const last = parseDateIso(u.last_login || u.cree_le) || Date.now()
      if (last < cutoffSupp && !u.actif) {
        rapport.comptes_supprimes++
        changedUsers = true
        continue
      }
      if (last < cutoffDesactiv && u.actif) {
        u.actif = false
        u.desactive_le = new Date().toISOString()
        u.motif_desactivation = 'Inactivite > 6 mois (RGPD)'
        rapport.comptes_desactives++
        changedUsers = true
      }
      usersKeep.push(u)
    }
    if (changedUsers) writeData('users.json', usersKeep)

    // 7. Nettoyage sessions portail expirees (deja fait ailleurs, mais redondance sans cout)
    try { nettoyerSessionsExpirees() } catch (e) {}

    // 8. Consigner le rapport dans audit
    try { addLog(null, 'RGPD_PURGE', JSON.stringify(rapport)) } catch (e) {}

    console.log('[RGPD-purge] ' + JSON.stringify(rapport))
  } catch (err) {
    console.error('[RGPD-purge] Erreur:', err.message)
  }

  return rapport
}

// Endpoint admin pour declencher une purge manuelle
app.post('/api/rgpd/purger', requireAuth, requireRole('directeur'), (req, res) => {
  const rapport = purgerRetention()
  res.json(rapport)
})

// Endpoint cron externe (protege par CRON_SECRET)
app.post('/api/rgpd/cron-purge', (req, res) => {
  const secret = req.headers['x-cron-secret'] || (req.query && req.query.secret)
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'cron secret invalide' })
  }
  const rapport = purgerRetention()
  res.json(rapport)
})

// Demarrage d une purge automatique quotidienne en interne (leger, ok pour 1 seul process)
setInterval(purgerRetention, 24 * 60 * 60 * 1000).unref?.()
// Premier passage 5 min apres le demarrage (evite de bloquer le boot)
setTimeout(purgerRetention, 5 * 60 * 1000).unref?.()

// ============================================================
// SAUVEGARDE BASE SQLITE (quotidien + endpoint manuel)
// ============================================================

async function sauvegardeQuotidienne() {
  try {
    const info = await dbBackupNow()
    const rot = dbRotateBackups(30) // garde 30 jours
    console.log('[backup] ' + info.filename + ' (' + Math.round(info.size_bytes / 1024) + ' ko) — rotation : ' + rot.deleted + ' ancien(s) supprime(s)')
    return { ok: true, backup: info, rotation: rot }
  } catch (e) {
    console.error('[backup] erreur : ' + e.message)
    return { ok: false, error: e.message }
  }
}

// Endpoint : déclencher une sauvegarde à la demande (directeur)
app.post('/api/admin/backup-now', requireAuth, requireRole('directeur'), async (req, res) => {
  const r = await sauvegardeQuotidienne()
  if (!r.ok) return res.status(500).json(r)
  res.json(r)
})

// Endpoint : lister les sauvegardes
app.get('/api/admin/backups', requireAuth, requireRole('directeur'), (req, res) => {
  res.json({
    db: dbStats(),
    backups: dbListBackups(),
    entries: dbListFiles()
  })
})

// Endpoint : télécharger une sauvegarde spécifique
app.get('/api/admin/backups/:filename', requireAuth, requireRole('directeur'), (req, res) => {
  const safe = /^logivia-\d{4}-\d{2}-\d{2}\.db$/.test(req.params.filename)
  if (!safe) return res.status(400).json({ error: 'nom de fichier invalide' })
  const p = join(dbGetBackupDir(), req.params.filename)
  if (!existsSync(p)) return res.status(404).json({ error: 'introuvable' })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.filename + '"')
  res.send(readFileSync(p))
})

// Endpoint : télécharger la base courante (chaude — à utiliser de préférence après un /backup-now)
app.get('/api/admin/db-download', requireAuth, requireRole('directeur'), async (req, res) => {
  try {
    const info = await dbBackupNow() // snapshot atomique, pas de lecture "à chaud" risquée
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', 'attachment; filename="' + info.filename + '"')
    res.send(readFileSync(info.path))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Endpoint cron externe pour backup (protégé par CRON_SECRET, même secret que la purge RGPD)
app.post('/api/admin/cron-backup', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || (req.query && req.query.secret)
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'cron secret invalide' })
  }
  const r = await sauvegardeQuotidienne()
  if (!r.ok) return res.status(500).json(r)
  res.json(r)
})

// Première sauvegarde 10 min après démarrage (laisse le temps au boot), puis toutes les 24h
setTimeout(() => { sauvegardeQuotidienne().catch(() => {}) }, 10 * 60 * 1000).unref?.()
setInterval(() => { sauvegardeQuotidienne().catch(() => {}) }, 24 * 60 * 60 * 1000).unref?.()

// ============================================================
// DEMARRAGE
// ============================================================

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  Logivia v3.1 · Ville de Saint-Denis     ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log('  Port          : ' + PORT)
  console.log('  Data          : ' + DATA + (process.env.DATA_DIR ? ' (volume persistant)' : ' (ephemere, dev)'))
  const s = (() => { try { return dbStats() } catch (_) { return null } })()
  console.log('  Base SQLite   : ' + (s ? s.path + ' (' + s.file_count + ' entrees, ' + Math.round(s.size_bytes / 1024) + ' ko)' : 'non initialisee — fallback JSON'))
  console.log('  Backups       : ' + (s ? dbGetBackupDir() + ' (' + dbListBackups().length + ' sauvegarde(s))' : 'n/a'))
  console.log('  Telegram      : ' + (process.env.BOT_TOKEN ? 'token via env' : 'token fallback code'))
  console.log('  App URL       : ' + (process.env.APP_URL || '(APP_URL non definie - les liens Telegram utiliseront l\'URL par defaut)'))
  console.log('  Build prod    : ' + existsSync(join(DIST, 'index.html')))
  console.log('  Temps reel SSE: actif sur /api/events\n')
})