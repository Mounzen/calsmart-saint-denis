/**
 * Logivia — stockage des fichiers (pièces justificatives) via Supabase Storage
 *
 * Remplace l'écriture sur disque local (server/data/pieces/<dem_id>/<fichier>),
 * incompatible avec un déploiement serverless (pas de disque persistant entre
 * deux invocations Vercel).
 *
 * Bucket : logivia-pieces (privé — accès uniquement via la clé service_role
 * côté serveur, jamais exposé directement au navigateur).
 *
 * Créer le bucket une fois dans Supabase (Dashboard > Storage > New bucket
 * "logivia-pieces", Public: NON) — voir supabase/schema.sql pour le reste.
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'logivia-pieces'
let supabase = null

function client() {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  supabase = createClient(url, key, { auth: { persistSession: false } })
  return supabase
}

function pathFor(demId, storedName) {
  return demId + '/' + storedName
}

export async function uploadPiece(demId, storedName, buffer, mimetype) {
  const sb = client()
  if (!sb) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
  const { error } = await sb.storage.from(BUCKET).upload(pathFor(demId, storedName), buffer, {
    contentType: mimetype || 'application/octet-stream',
    upsert: true
  })
  if (error) throw new Error('[storage.upload] ' + error.message)
  return true
}

export async function downloadPiece(demId, storedName) {
  const sb = client()
  if (!sb) return null
  const { data, error } = await sb.storage.from(BUCKET).download(pathFor(demId, storedName))
  if (error) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function deletePiece(demId, storedName) {
  const sb = client()
  if (!sb) return false
  const { error } = await sb.storage.from(BUCKET).remove([pathFor(demId, storedName)])
  if (error) console.error('[storage.delete] ' + error.message)
  return !error
}
