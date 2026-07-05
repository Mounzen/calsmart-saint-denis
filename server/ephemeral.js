/**
 * Logivia — store éphémère partagé (Supabase)
 *
 * Remplace les Map() en mémoire utilisées pour :
 *  - les sessions agents (namespace 'session')
 *  - les sessions portail candidat (namespace 'portail')
 *  - le state/nonce OAuth FranceConnect (namespace 'fc_state')
 *  - l'id_token FranceConnect pour le RP-logout (namespace 'fc_idtoken')
 *
 * Nécessaire en serverless : une Map() en mémoire ne survit pas entre deux
 * invocations qui peuvent atterrir sur des instances différentes (ex : la
 * requête de login et la requête suivante avec le token).
 *
 * Table : logivia_ephemeral (namespace, key, value jsonb, expires_at bigint)
 */

import { createClient } from '@supabase/supabase-js'

let supabase = null
let supabaseUnavailable = false
// Repli en mémoire si Supabase n'est pas configuré (dev local sans clés,
// ou incident réseau) : évite un crash du process sur une session/OAuth
// state qui ne peut pas être persistée. En mode dégradé, ce repli ne
// fonctionne que sur UNE seule instance de serveur (pas de partage entre
// invocations serverless) — acceptable en secours, pas en usage normal.
const memoryFallback = new Map()

function client() {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    supabaseUnavailable = true
    return null
  }
  supabase = createClient(url, key, { auth: { persistSession: false } })
  return supabase
}

export async function ephSet(namespace, key, value, ttlMs) {
  const sb = client()
  if (!sb) {
    memoryFallback.set(namespace + ':' + key, { value, expires_at: Date.now() + ttlMs })
    return true
  }
  const { error } = await sb.from('logivia_ephemeral').upsert({
    namespace, key, value, expires_at: Date.now() + ttlMs
  }, { onConflict: 'namespace,key' })
  if (error) console.error('[ephemeral.set] ' + namespace + '/' + key + ': ' + error.message)
  return !error
}

export async function ephGet(namespace, key) {
  const sb = client()
  if (!sb) {
    const entry = memoryFallback.get(namespace + ':' + key)
    if (!entry) return null
    if (entry.expires_at < Date.now()) { memoryFallback.delete(namespace + ':' + key); return null }
    return entry.value
  }
  const { data, error } = await sb.from('logivia_ephemeral')
    .select('value, expires_at').eq('namespace', namespace).eq('key', key).maybeSingle()
  if (error) { console.error('[ephemeral.get] ' + namespace + '/' + key + ': ' + error.message); return null }
  if (!data) return null
  if (data.expires_at < Date.now()) { ephDelete(namespace, key).catch(() => {}); return null }
  return data.value
}

export async function ephDelete(namespace, key) {
  const sb = client()
  if (!sb) { memoryFallback.delete(namespace + ':' + key); return true }
  const { error } = await sb.from('logivia_ephemeral').delete().eq('namespace', namespace).eq('key', key)
  if (error) console.error('[ephemeral.delete] ' + namespace + '/' + key + ': ' + error.message)
  return !error
}

/** Ménage occasionnel des entrées expirées (appelé au fil de l'eau, pas critique). */
export async function ephCleanup() {
  const sb = client()
  if (!sb) {
    const now = Date.now()
    for (const [k, v] of memoryFallback.entries()) if (v.expires_at < now) memoryFallback.delete(k)
    return
  }
  await sb.from('logivia_ephemeral').delete().lt('expires_at', Date.now())
}
