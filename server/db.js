/**
 * Logivia — couche persistance SQLite
 *
 * Stratégie : remplacement transparent des helpers readData / readObj / writeData.
 * On stocke chaque "fichier logique" (ex : demandeurs.json) comme une ligne dans
 * une table kv (key, data, updated_at). Les lectures/écritures sont ACID,
 * atomiques, et protégées par une transaction SQLite.
 *
 * Avantages immédiats vs fichiers .json :
 *  - Plus de corruption possible en cas de coupure (atomicité ACID)
 *  - Journal WAL : lectures concurrentes, 1 seul rédacteur (parfait pour une mairie)
 *  - Sauvegarde = 1 seul fichier .db (copie atomique)
 *  - Prépare le terrain pour des requêtes indexées ultérieures (schéma relationnel
 *    possible dans une 2e passe sans casser l'existant)
 *
 * Chiffrement : SQLCipher peut être activé ultérieurement en remplaçant
 * `better-sqlite3` par `better-sqlite3-multiple-ciphers` et en passant la clé
 * via DB_ENCRYPTION_KEY. Laissé optionnel pour ne pas alourdir le déploiement
 * initial Railway.
 */

import Database from 'better-sqlite3'
import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

let db = null
let DB_PATH = null
let BACKUP_DIR = null
let cachedStatements = {}

/**
 * Ouvre (ou crée) la base SQLite.
 * À appeler une seule fois au démarrage du serveur.
 */
export function openDatabase(dataDir) {
  if (db) return db

  DB_PATH = join(dataDir, 'logivia.db')
  BACKUP_DIR = join(dataDir, 'backups')
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

  const isFresh = !existsSync(DB_PATH)

  db = new Database(DB_PATH)

  // Robustesse : WAL pour concurrence lecture, synchronous NORMAL (compromis perf/durabilité)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  // Schéma : table kv principale
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      file TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv(updated_at DESC);

    -- Table meta : versionning, flags migration, stats
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // Préparation des statements (cache)
  cachedStatements = {
    selectKv:   db.prepare('SELECT data FROM kv WHERE file = ?'),
    upsertKv:   db.prepare(`
      INSERT INTO kv (file, data, updated_at, size_bytes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at,
        size_bytes = excluded.size_bytes
    `),
    countKv:    db.prepare('SELECT COUNT(*) AS n FROM kv'),
    listKv:     db.prepare('SELECT file, updated_at, size_bytes FROM kv ORDER BY file'),
    selectMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    upsertMeta: db.prepare(`
      INSERT INTO meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
  }

  // Migration automatique : si base neuve ou vide, on importe les JSON présents
  const count = cachedStatements.countKv.get().n
  if (count === 0) {
    const imported = importJsonFiles(dataDir)
    if (imported > 0) {
      console.log('[db] ' + imported + ' fichier(s) JSON importe(s) depuis ' + dataDir)
    } else if (isFresh) {
      console.log('[db] base neuve, aucun JSON a importer')
    }
    cachedStatements.upsertMeta.run('schema_version', '1', Date.now())
    cachedStatements.upsertMeta.run('created_at', new Date().toISOString(), Date.now())
  }

  return db
}

/**
 * Importe en bloc tous les fichiers .json du dataDir vers la table kv.
 * Exécuté en transaction : soit tout passe, soit rien n'est inséré.
 */
function importJsonFiles(dataDir) {
  if (!existsSync(dataDir)) return 0
  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return 0

  const now = Date.now()
  const tx = db.transaction((list) => {
    let n = 0
    for (const f of list) {
      try {
        const raw = readFileSync(join(dataDir, f), 'utf8').trim()
        if (!raw) continue
        // On valide que c'est du JSON parseable ; sinon on saute
        JSON.parse(raw)
        cachedStatements.upsertKv.run(f, raw, now, Buffer.byteLength(raw, 'utf8'))
        n++
      } catch (e) {
        console.error('[db] import skip ' + f + ': ' + e.message)
      }
    }
    return n
  })

  return tx(files)
}

/**
 * Lit un fichier logique et renvoie un tableau.
 * API identique à l'ancien readData().
 */
export function readData(file) {
  if (!db) throw new Error('db non initialisée — appelle openDatabase() d\'abord')
  try {
    const row = cachedStatements.selectKv.get(file)
    if (!row) return []
    const parsed = JSON.parse(row.data)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[db.readData] ' + file + ': ' + e.message)
    return []
  }
}

/**
 * Lit un fichier logique et renvoie un objet.
 * API identique à l'ancien readObj().
 */
export function readObj(file, fallback) {
  if (!db) throw new Error('db non initialisée — appelle openDatabase() d\'abord')
  try {
    const row = cachedStatements.selectKv.get(file)
    if (!row) return fallback || {}
    const parsed = JSON.parse(row.data)
    return (typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : (fallback || {})
  } catch (e) {
    console.error('[db.readObj] ' + file + ': ' + e.message)
    return fallback || {}
  }
}

/**
 * Écrit un fichier logique (atomique, transactionnel).
 * API identique à l'ancien writeData().
 */
export function writeData(file, data) {
  if (!db) throw new Error('db non initialisée — appelle openDatabase() d\'abord')
  try {
    const json = JSON.stringify(data, null, 2)
    cachedStatements.upsertKv.run(file, json, Date.now(), Buffer.byteLength(json, 'utf8'))
    return true
  } catch (e) {
    console.error('[db.writeData] ' + file + ': ' + e.message)
    return false
  }
}

/**
 * Liste toutes les entrées kv (pour diagnostic).
 */
export function listFiles() {
  if (!db) return []
  return cachedStatements.listKv.all()
}

/**
 * Renvoie stats globales (diagnostic).
 */
export function stats() {
  if (!db) return null
  const count = cachedStatements.countKv.get().n
  const st = statSync(DB_PATH)
  const schemaVersion = cachedStatements.selectMeta.get('schema_version')?.value || '?'
  return {
    path: DB_PATH,
    size_bytes: st.size,
    file_count: count,
    schema_version: schemaVersion,
    last_modified: st.mtime.toISOString()
  }
}

/**
 * Sauvegarde complète : copie atomique du fichier .db vers backups/YYYY-MM-DD.db
 * Utilise l'API backup de SQLite (pas de copie bête qui risque des incohérences WAL).
 */
export async function backupNow() {
  if (!db) throw new Error('db non initialisée')
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const backupPath = join(BACKUP_DIR, 'logivia-' + today + '.db')

  // better-sqlite3 backup API (natif SQLite, atomique)
  await db.backup(backupPath)

  const st = statSync(backupPath)
  return {
    path: backupPath,
    filename: 'logivia-' + today + '.db',
    size_bytes: st.size,
    created_at: st.mtime.toISOString()
  }
}

/**
 * Liste les sauvegardes présentes.
 */
export function listBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('logivia-') && f.endsWith('.db'))
    .map(f => {
      const p = join(BACKUP_DIR, f)
      const st = statSync(p)
      return {
        filename: f,
        size_bytes: st.size,
        created_at: st.mtime.toISOString()
      }
    })
    .sort((a, b) => b.filename.localeCompare(a.filename))
}

/**
 * Rotation : garde les N derniers backups, supprime les plus anciens.
 * Par défaut N = 30 (1 mois de rétention).
 */
export function rotateBackups(keep = 30) {
  const all = listBackups()
  if (all.length <= keep) return { kept: all.length, deleted: 0 }
  const toDelete = all.slice(keep)
  let deleted = 0
  for (const b of toDelete) {
    try {
      unlinkSync(join(BACKUP_DIR, b.filename))
      deleted++
    } catch (e) {
      console.error('[db.rotateBackups] ' + b.filename + ': ' + e.message)
    }
  }
  return { kept: keep, deleted }
}

/**
 * Renvoie le chemin du fichier .db courant (pour download direct).
 */
export function getDbPath() {
  return DB_PATH
}

/**
 * Renvoie le chemin du dossier backups (pour download direct).
 */
export function getBackupDir() {
  return BACKUP_DIR
}

/**
 * Ferme proprement la base (avant shutdown serveur).
 */
export function closeDatabase() {
  if (db) {
    try { db.close() } catch (e) { /* noop */ }
    db = null
  }
}
