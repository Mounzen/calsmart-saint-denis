/**
 * Logivia — couche persistance Supabase (Postgres)
 *
 * Remplace l'ancienne implémentation SQLite/Railway par Supabase, tout en
 * gardant EXACTEMENT la même API (readData / readObj / writeData / listFiles /
 * stats / backupNow / listBackups / rotateBackups). Résultat : les ~280 appels
 * existants dans server/index.js continuent de fonctionner, moyennant l'ajout
 * de `await` (voir DEPLOIEMENT-SUPABASE-VERCEL.md).
 *
 * Table utilisée : logivia_kv (file text PK, data jsonb, updated_at bigint,
 * size_bytes int). Voir supabase/schema.sql.
 *
 * IMPORTANT : toutes les fonctions dégradent proprement (retour vide/null,
 * jamais d'exception) quand SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY sont
 * absentes. En Express 4, une promesse rejetée dans un handler async n'est
 * PAS rattrapée automatiquement — une exception ici ferait planter tout le
 * process. Voir aussi le filet de sécurité process.on('unhandledRejection')
 * dans server/index.js.
 *
 * Variables d'environnement requises (à définir dans Vercel) :
 *   SUPABASE_URL              : URL du projet (https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY : clé service_role (JAMAIS exposée au frontend)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

let supabase = null

function client() {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  supabase = createClient(url, key, { auth: { persistSession: false } })
  return supabase
}

export async function openDatabase(seedDataDir) {
  const sb = client()
  if (!sb) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const { count, error } = await sb.from('logivia_kv').select('file', { count: 'exact', head: true })
  if (error) throw new Error('[db] connexion Supabase impossible : ' + error.message)

  if (count === 0 && seedDataDir && existsSync(seedDataDir)) {
    await importJsonFiles(seedDataDir)
  }
  return sb
}

async function importJsonFiles(dataDir) {
  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'))
  if (files.length === 0) return 0
  const now = Date.now()
  const rows = []
  for (const f of files) {
    try {
      const raw = readFileSync(join(dataDir, f), 'utf8').trim()
      if (!raw) continue
      const parsed = JSON.parse(raw)
      rows.push({ file: f, data: parsed, updated_at: now, size_bytes: Buffer.byteLength(raw, 'utf8') })
    } catch (e) {
      console.error('[db] import skip ' + f + ': ' + e.message)
    }
  }
  if (rows.length === 0) return 0
  const sb = client()
  if (!sb) return 0
  const { error } = await sb.from('logivia_kv').upsert(rows, { onConflict: 'file' })
  if (error) throw new Error('[db] import seed échoué : ' + error.message)
  console.log('[db] ' + rows.length + ' fichier(s) JSON importé(s) dans Supabase')
  return rows.length
}

export async function readData(file) {
  const sb = client()
  if (!sb) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const { data, error } = await sb.from('logivia_kv').select('data').eq('file', file).maybeSingle()
  if (error) { console.error('[db.readData] ' + file + ': ' + error.message); return [] }
  if (!data) return []
  return Array.isArray(data.data) ? data.data : []
}

export async function readObj(file, fallback) {
  const sb = client()
  if (!sb) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const { data, error } = await sb.from('logivia_kv').select('data').eq('file', file).maybeSingle()
  if (error) { console.error('[db.readObj] ' + file + ': ' + error.message); return fallback || {} }
  if (!data) return fallback || {}
  return (typeof data.data === 'object' && !Array.isArray(data.data)) ? data.data : (fallback || {})
}

export async function writeData(file, data) {
  const sb = client()
  if (!sb) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const json = JSON.stringify(data)
  const { error } = await sb.from('logivia_kv').upsert({
    file, data, updated_at: Date.now(), size_bytes: Buffer.byteLength(json, 'utf8')
  }, { onConflict: 'file' })
  if (error) { console.error('[db.writeData] ' + file + ': ' + error.message); return false }
  return true
}

// NOTE : readData/readObj/writeData lèvent volontairement une exception si
// Supabase n'est pas configuré — server/index.js les enveloppe déjà dans un
// try/catch avec repli JSON local (voir les wrappers dans index.js). Les
// fonctions ci-dessous, elles, n'ont pas de tel filet côté appelant : elles
// dégradent donc elles-mêmes en silence (tableau vide / null / 0).

export async function listFiles() {
  const sb = client()
  if (!sb) return []
  const { data, error } = await sb.from('logivia_kv').select('file, updated_at, size_bytes').order('file')
  if (error) { console.error('[db.listFiles] ' + error.message); return [] }
  return data
}

export async function stats() {
  const sb = client()
  if (!sb) return null
  const { count, error } = await sb.from('logivia_kv').select('file', { count: 'exact', head: true })
  if (error) { console.error('[db.stats] ' + error.message); return null }
  const { data: rows } = await sb.from('logivia_kv').select('size_bytes, updated_at')
  const size_bytes = (rows || []).reduce((s, r) => s + (r.size_bytes || 0), 0)
  const last = (rows || []).reduce((m, r) => Math.max(m, r.updated_at || 0), 0)
  return {
    path: 'supabase://logivia_kv',
    size_bytes,
    file_count: count,
    schema_version: '2-supabase',
    last_modified: last ? new Date(last).toISOString() : null
  }
}

export async function backupNow() {
  const sb = client()
  if (!sb) return { path: null, filename: null, size_bytes: 0, created_at: null, error: 'Supabase non configuré' }
  const { data, error } = await sb.from('logivia_kv').select('*').not('file', 'like', '_backups/%')
  if (error) throw new Error('[db.backupNow] ' + error.message)
  const snapshot = { exported_at: new Date().toISOString(), files: data }
  const json = JSON.stringify(snapshot)
  const filename = 'backup-' + new Date().toISOString().slice(0, 10) + '-' + Date.now() + '.json'
  await sb.from('logivia_kv').upsert({
    file: '_backups/' + filename, data: snapshot, updated_at: Date.now(),
    size_bytes: Buffer.byteLength(json, 'utf8')
  })
  return { path: '_backups/' + filename, filename, size_bytes: Buffer.byteLength(json, 'utf8'), created_at: snapshot.exported_at }
}

export async function listBackups() {
  const sb = client()
  if (!sb) return []
  const { data, error } = await sb.from('logivia_kv').select('file, updated_at, size_bytes').like('file', '_backups/%').order('updated_at', { ascending: false })
  if (error) { console.error('[db.listBackups] ' + error.message); return [] }
  return data.map(d => ({ filename: d.file.replace('_backups/', ''), size_bytes: d.size_bytes, created_at: new Date(d.updated_at).toISOString() }))
}

export async function rotateBackups(keep = 14) {
  const all = await listBackups()
  const toDelete = all.slice(keep)
  if (toDelete.length === 0) return 0
  const sb = client()
  if (!sb) return 0
  for (const b of toDelete) {
    await sb.from('logivia_kv').delete().eq('file', '_backups/' + b.filename)
  }
  return toDelete.length
}

export function getDbPath() { return 'supabase://logivia_kv' }
export function getBackupDir() { return 'supabase://logivia_kv/_backups' }
export function closeDatabase() { /* rien à fermer : client HTTP Supabase */ }
