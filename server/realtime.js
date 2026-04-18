/**
 * Logivia - Module temps reel (SSE + presence + verrouillage doux)
 * Ville de Saint-Denis
 *
 * Pas de dependance externe : Server-Sent Events natifs via Express.
 * - Un client s'abonne a /api/events?token=...
 * - Le serveur broadcast les evenements (presence, commentaires, locks, pieces, workflow)
 * - Les locks sont SOFT : 5 min d'expiration automatique, pas de blocage dur.
 */

// ==========================================================
// BUS D'EVENEMENTS SSE
// ==========================================================

// clients connectes : Map<clientId, { res, user, connected_at }>
const clients = new Map()
let nextClientId = 1

export function registerSseClient(res, user) {
  const id = nextClientId++
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders && res.flushHeaders()

  clients.set(id, { res, user, connected_at: Date.now() })

  // hello initial
  writeEvent(res, 'hello', {
    client_id: id,
    server_time: new Date().toISOString(),
    user: { id: user.id, nom: user.nom, role: user.role }
  })

  // marque l'utilisateur comme present
  setPresence(user, { online: true })
  broadcast('presence_update', getPresenceSummary())

  // heartbeat toutes les 25s pour tenir la connexion vivante
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch (_) {}
  }, 25000)

  const cleanup = () => {
    clearInterval(hb)
    clients.delete(id)
    removePresence(user.id)
    broadcast('presence_update', getPresenceSummary())
  }
  res.on('close', cleanup)
  res.on('error', cleanup)

  return id
}

function writeEvent(res, event, data) {
  try {
    res.write('event: ' + event + '\n')
    res.write('data: ' + JSON.stringify(data) + '\n\n')
  } catch (e) {
    // connection closed, ignore
  }
}

/**
 * Broadcast un evenement a tous les clients connectes.
 * filter : optionnel, fonction (user) => boolean pour cibler.
 */
export function broadcast(event, data, filter = null) {
  for (const [, client] of clients) {
    if (filter && !filter(client.user)) continue
    writeEvent(client.res, event, data)
  }
}

export function broadcastToUser(user_id, event, data) {
  broadcast(event, data, u => u.id === user_id)
}

export function broadcastToRoles(roles, event, data) {
  const arr = Array.isArray(roles) ? roles : [roles]
  broadcast(event, data, u => arr.includes(u.role))
}

export function getConnectedClientsCount() {
  return clients.size
}

// ==========================================================
// PRESENCE
// ==========================================================

// presence en memoire : Map<user_id, { user_id, nom, role, online, viewing, editing, last_ping, connected_since }>
const presence = new Map()

export function setPresence(user, patch) {
  const existing = presence.get(user.id) || {
    user_id: user.id,
    nom: user.nom,
    role: user.role,
    online: false,
    viewing: null,
    editing: null,
    last_ping: Date.now(),
    connected_since: Date.now()
  }
  const updated = { ...existing, ...patch, last_ping: Date.now() }
  presence.set(user.id, updated)
  return updated
}

export function removePresence(user_id) {
  const p = presence.get(user_id)
  if (p) {
    presence.set(user_id, { ...p, online: false, viewing: null, editing: null, last_ping: Date.now() })
    // on garde la trace 30s avant purge pour montrer "deconnecte a l'instant"
    setTimeout(() => {
      const cur = presence.get(user_id)
      if (cur && !cur.online) presence.delete(user_id)
    }, 30000)
  }
}

export function getPresenceSummary() {
  const arr = []
  for (const [, p] of presence) arr.push(p)
  return arr.filter(p => p.online)
}

/**
 * Retourne les utilisateurs qui visualisent ou editent une entite donnee.
 */
export function whoIsOnEntity(entity_type, entity_id) {
  const arr = []
  for (const [, p] of presence) {
    if (!p.online) continue
    if (p.viewing && p.viewing.entity_type === entity_type && p.viewing.entity_id === entity_id) {
      arr.push({ ...p, mode: 'viewing' })
    }
    if (p.editing && p.editing.entity_type === entity_type && p.editing.entity_id === entity_id) {
      arr.push({ ...p, mode: 'editing' })
    }
  }
  // dedupe par user_id, on garde editing prioritaire
  const map = new Map()
  for (const u of arr) {
    const existing = map.get(u.user_id)
    if (!existing || u.mode === 'editing') map.set(u.user_id, u)
  }
  return Array.from(map.values())
}

// ==========================================================
// VERROUILLAGE DOUX (SOFT LOCK)
// ==========================================================

// locks en memoire : Map<"entity_type:entity_id", { user_id, user_nom, role, since, expires_at }>
const locks = new Map()
const LOCK_DURATION_MS = 5 * 60 * 1000 // 5 minutes

function lockKey(entity_type, entity_id) {
  return entity_type + ':' + entity_id
}

/**
 * Tente d'acquerir un lock doux.
 * - si deja lock par quelqu'un d'autre (non expire), retourne { ok:false, holder }
 * - sinon, cree ou renouvelle le lock pour cet utilisateur
 */
export function acquireLock(user, entity_type, entity_id) {
  const key = lockKey(entity_type, entity_id)
  const now = Date.now()
  const existing = locks.get(key)

  if (existing && existing.expires_at > now && existing.user_id !== user.id) {
    return {
      ok: false,
      holder: existing,
      remaining_sec: Math.round((existing.expires_at - now) / 1000)
    }
  }

  const lock = {
    entity_type,
    entity_id,
    user_id: user.id,
    user_nom: user.nom,
    role: user.role,
    since: existing && existing.user_id === user.id ? existing.since : now,
    expires_at: now + LOCK_DURATION_MS
  }
  locks.set(key, lock)

  broadcast('lock_acquired', lock)
  return { ok: true, lock }
}

export function releaseLock(user, entity_type, entity_id) {
  const key = lockKey(entity_type, entity_id)
  const existing = locks.get(key)
  if (!existing) return { ok: true, released: false }
  if (existing.user_id !== user.id && user.role !== 'directeur') {
    return { ok: false, error: 'Lock detenu par un autre utilisateur' }
  }
  locks.delete(key)
  broadcast('lock_released', { entity_type, entity_id, by: user.nom })
  return { ok: true, released: true }
}

export function getLock(entity_type, entity_id) {
  const key = lockKey(entity_type, entity_id)
  const lock = locks.get(key)
  if (!lock) return null
  if (lock.expires_at <= Date.now()) {
    locks.delete(key)
    return null
  }
  return lock
}

export function getAllLocks() {
  const now = Date.now()
  const arr = []
  for (const [key, lock] of locks) {
    if (lock.expires_at <= now) { locks.delete(key); continue }
    arr.push(lock)
  }
  return arr
}

// nettoyage periodique
setInterval(() => {
  const now = Date.now()
  for (const [key, lock] of locks) {
    if (lock.expires_at <= now) {
      locks.delete(key)
      broadcast('lock_expired', { entity_type: lock.entity_type, entity_id: lock.entity_id })
    }
  }
  // purge presence : si pas de ping depuis 2 min, marque hors-ligne
  for (const [uid, p] of presence) {
    if (p.online && now - p.last_ping > 120000) {
      presence.set(uid, { ...p, online: false, viewing: null, editing: null })
      broadcast('presence_update', getPresenceSummary())
    }
  }
}, 30000)
