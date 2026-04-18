/**
 * Logivia - Composants temps reel
 *  - RealtimeProvider + useRealtime (EventSource)
 *  - PresenceBadge, PresenceStrip, LockBanner
 *  - CommentsThread avec mentions @user
 *  - NotificationsBell + NotificationsPanel
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'

// ==========================================================
// CONTEXT
// ==========================================================

const RealtimeContext = createContext(null)

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime doit etre utilise dans un RealtimeProvider')
  return ctx
}

/**
 * Provider : ouvre une connexion SSE /api/events, maintient la liste des
 * presences + locks + notifications recus, expose une API pour declarer
 * ce que l'utilisateur regarde/edite et pour s'abonner aux evenements.
 */
export function RealtimeProvider({ token, user, children }) {
  const [connected, setConnected] = useState(false)
  const [presence, setPresence] = useState([])
  const [locks, setLocks] = useState([])
  const [notifications, setNotifications] = useState([])
  const [nonLues, setNonLues] = useState(0)
  const esRef = useRef(null)
  const listenersRef = useRef({}) // event -> Set<fn>
  const reconnectTimerRef = useRef(null)

  const emit = useCallback((evt, data) => {
    const set = listenersRef.current[evt]
    if (!set) return
    for (const fn of set) {
      try { fn(data) } catch (e) { console.error('[realtime listener] ' + evt, e) }
    }
  }, [])

  const subscribe = useCallback((evt, fn) => {
    if (!listenersRef.current[evt]) listenersRef.current[evt] = new Set()
    listenersRef.current[evt].add(fn)
    return () => { listenersRef.current[evt] && listenersRef.current[evt].delete(fn) }
  }, [])

  // fetch initial des notifications
  const refreshNotifications = useCallback(async () => {
    if (!token) return
    try {
      const r = await fetch('/api/mes-notifications', { headers: { 'x-auth-token': token } })
      if (!r.ok) return
      const d = await r.json()
      setNotifications(d.notifications || [])
      setNonLues(d.non_lues || 0)
    } catch (_) {}
  }, [token])

  const marquerLu = useCallback(async (id) => {
    if (!token) return
    try {
      await fetch('/api/mes-notifications/' + id + '/lire', {
        method: 'PUT',
        headers: { 'x-auth-token': token }
      })
      refreshNotifications()
    } catch (_) {}
  }, [token, refreshNotifications])

  const marquerToutLu = useCallback(async () => {
    if (!token) return
    try {
      await fetch('/api/mes-notifications/lire-tout', {
        method: 'PUT',
        headers: { 'x-auth-token': token }
      })
      refreshNotifications()
    } catch (_) {}
  }, [token, refreshNotifications])

  // Ouverture SSE
  useEffect(() => {
    if (!token || !user) return
    let stopped = false

    const connect = () => {
      if (stopped) return
      try {
        const es = new EventSource('/api/events?token=' + encodeURIComponent(token))
        esRef.current = es

        es.addEventListener('hello', (ev) => {
          setConnected(true)
          emit('hello', JSON.parse(ev.data))
        })
        es.addEventListener('presence_update', (ev) => {
          const arr = JSON.parse(ev.data)
          setPresence(arr)
          emit('presence_update', arr)
        })
        es.addEventListener('lock_acquired', (ev) => {
          const lk = JSON.parse(ev.data)
          setLocks(prev => [...prev.filter(x => !(x.entity_type === lk.entity_type && x.entity_id === lk.entity_id)), lk])
          emit('lock_acquired', lk)
        })
        es.addEventListener('lock_released', (ev) => {
          const data = JSON.parse(ev.data)
          setLocks(prev => prev.filter(x => !(x.entity_type === data.entity_type && x.entity_id === data.entity_id)))
          emit('lock_released', data)
        })
        es.addEventListener('lock_expired', (ev) => {
          const data = JSON.parse(ev.data)
          setLocks(prev => prev.filter(x => !(x.entity_type === data.entity_type && x.entity_id === data.entity_id)))
          emit('lock_expired', data)
        })
        es.addEventListener('comment_added', (ev) => emit('comment_added', JSON.parse(ev.data)))
        es.addEventListener('comment_edited', (ev) => emit('comment_edited', JSON.parse(ev.data)))
        es.addEventListener('comment_deleted', (ev) => emit('comment_deleted', JSON.parse(ev.data)))
        es.addEventListener('mention', (ev) => {
          const data = JSON.parse(ev.data)
          emit('mention', data)
          refreshNotifications()
        })
        es.addEventListener('piece_uploaded', (ev) => emit('piece_uploaded', JSON.parse(ev.data)))
        es.addEventListener('piece_updated', (ev) => emit('piece_updated', JSON.parse(ev.data)))
        es.addEventListener('piece_deleted', (ev) => emit('piece_deleted', JSON.parse(ev.data)))
        es.addEventListener('workflow_moved', (ev) => emit('workflow_moved', JSON.parse(ev.data)))
        es.addEventListener('message_sent', (ev) => emit('message_sent', JSON.parse(ev.data)))
        es.addEventListener('message_recu', (ev) => {
          emit('message_recu', JSON.parse(ev.data))
          refreshNotifications()
        })
        es.addEventListener('relances_generees', (ev) => emit('relances_generees', JSON.parse(ev.data)))

        es.onerror = () => {
          setConnected(false)
          try { es.close() } catch (_) {}
          if (stopped) return
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = setTimeout(connect, 3000)
        }
      } catch (e) {
        console.error('[realtime] connection error', e)
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }
    }
    connect()
    refreshNotifications()

    return () => {
      stopped = true
      clearTimeout(reconnectTimerRef.current)
      try { esRef.current && esRef.current.close() } catch (_) {}
      esRef.current = null
      setConnected(false)
    }
  }, [token, user, emit, refreshNotifications])

  // ping periodique pour maintenir la presence
  useEffect(() => {
    if (!token) return
    const id = setInterval(() => {
      fetch('/api/presence/ping', { method: 'POST', headers: { 'x-auth-token': token } }).catch(() => {})
    }, 45000)
    return () => clearInterval(id)
  }, [token])

  // API exposee
  const declareViewing = useCallback(async (entity_type, entity_id) => {
    if (!token) return
    await fetch('/api/presence/viewing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ entity_type, entity_id })
    }).catch(() => {})
  }, [token])

  const declareEditing = useCallback(async (entity_type, entity_id) => {
    if (!token) return
    await fetch('/api/presence/editing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ entity_type, entity_id })
    }).catch(() => {})
  }, [token])

  const acquireLock = useCallback(async (entity_type, entity_id) => {
    const r = await fetch('/api/locks/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ entity_type, entity_id })
    })
    const data = await r.json()
    return { ok: r.ok, ...data }
  }, [token])

  const releaseLock = useCallback(async (entity_type, entity_id) => {
    await fetch('/api/locks/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ entity_type, entity_id })
    }).catch(() => {})
  }, [token])

  const value = useMemo(() => ({
    connected, presence, locks, notifications, nonLues,
    subscribe, declareViewing, declareEditing, acquireLock, releaseLock,
    refreshNotifications, marquerLu, marquerToutLu,
    user, token
  }), [connected, presence, locks, notifications, nonLues, subscribe, declareViewing, declareEditing, acquireLock, releaseLock, refreshNotifications, marquerLu, marquerToutLu, user, token])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

// ==========================================================
// PRESENCE UI
// ==========================================================

function initials(nom) {
  if (!nom) return '?'
  const parts = nom.trim().split(/\s+/)
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

function colorForUser(id) {
  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
  if (!id) return palette[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return palette[h % palette.length]
}

export function UserBadge({ user, size = 28, title }) {
  const bg = colorForUser(user.user_id || user.id)
  return (
    <span
      title={title || user.nom}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: bg, color: 'white',
        fontSize: Math.round(size * 0.42), fontWeight: 700,
        border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
      }}
    >
      {initials(user.nom)}
    </span>
  )
}

/**
 * PresenceStrip : barre qui affiche qui regarde/edite une entite.
 * - Signale automatiquement au backend que je regarde (ou edite) cette entite
 * - Se desabonne au demontage
 */
export function PresenceStrip({ entityType, entityId, editing = false }) {
  const { presence, declareViewing, declareEditing, user } = useRealtime()

  useEffect(() => {
    if (!entityType || !entityId) return
    if (editing) declareEditing(entityType, entityId)
    else declareViewing(entityType, entityId)
    return () => {
      if (editing) declareEditing(null, null)
      else declareViewing(null, null)
    }
  }, [entityType, entityId, editing, declareViewing, declareEditing])

  const surPage = presence.filter(p => {
    if (p.user_id === user.id) return false
    const v = p.viewing && p.viewing.entity_type === entityType && p.viewing.entity_id === entityId
    const e = p.editing && p.editing.entity_type === entityType && p.editing.entity_id === entityId
    return v || e
  })

  if (surPage.length === 0) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
      padding: '6px 12px', fontSize: 13, marginBottom: 10
    }}>
      <span style={{ color: '#0369a1', fontWeight: 600 }}>En ligne sur cette fiche :</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {surPage.map(p => (
          <UserBadge
            key={p.user_id}
            user={p}
            size={24}
            title={p.nom + ' (' + p.role + ')' + (p.editing && p.editing.entity_id === entityId ? ' - edite' : ' - consulte')}
          />
        ))}
      </div>
      <span style={{ color: '#0369a1', fontSize: 12 }}>
        {surPage.map(p => p.nom + (p.editing && p.editing.entity_id === entityId ? ' (edite)' : '')).join(', ')}
      </span>
    </div>
  )
}

/**
 * PresenceGlobale : mini-liste en haut de page avec tous les agents en ligne.
 */
export function PresenceGlobale() {
  const { presence, user, connected } = useRealtime()
  const autres = presence.filter(p => p.user_id !== user.id)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: connected ? '#10b981' : '#ef4444'
      }} />
      <span style={{ fontSize: 12, color: '#64748b' }}>
        {connected ? 'Temps reel actif' : 'Hors ligne'}
      </span>
      {autres.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {autres.slice(0, 5).map(p => (
            <UserBadge key={p.user_id} user={p} size={22} title={p.nom + ' (' + p.role + ')'} />
          ))}
          {autres.length > 5 && (
            <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>+{autres.length - 5}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ==========================================================
// LOCK BANNER - signale si l'entite est editee par un autre
// ==========================================================

export function LockBanner({ entityType, entityId, autoAcquire = false }) {
  const { locks, user, acquireLock, releaseLock } = useRealtime()
  const lock = locks.find(l => l.entity_type === entityType && l.entity_id === entityId)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!autoAcquire) return
    if (lock && lock.user_id !== user.id) return
    acquireLock(entityType, entityId).then(r => {
      if (!r.ok) setError('Verrou occupe par ' + (r.holder && r.holder.user_nom))
    })
    return () => releaseLock(entityType, entityId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, autoAcquire])

  if (!lock) return null
  if (lock.user_id === user.id) {
    return (
      <div style={{
        background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8,
        padding: 10, marginBottom: 10, fontSize: 13, color: '#166534'
      }}>
        Vous editez cette fiche (verrou doux actif 5 min, renouvele automatiquement).
      </div>
    )
  }
  return (
    <div style={{
      background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
      padding: 10, marginBottom: 10, fontSize: 13, color: '#92400e'
    }}>
      <b>{lock.user_nom}</b> ({lock.role}) edite cette fiche depuis {new Date(lock.since).toLocaleTimeString('fr-FR')}.
      Vos modifications risquent d'entrer en conflit.
      {error && <div style={{ marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ==========================================================
// COMMENTAIRES + MENTIONS
// ==========================================================

/**
 * CommentsThread : fil de commentaires pour une entite (demandeur/logement).
 * - Chargement initial /api/commentaires/:type/:id
 * - Push temps reel via SSE comment_added/edited/deleted
 * - Composeur avec autocomplete @login
 */
export function CommentsThread({ entityType, entityId }) {
  const { token, user, subscribe } = useRealtime()
  const [items, setItems] = useState([])
  const [texte, setTexte] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [mentionState, setMentionState] = useState(null) // { start, query }
  const textRef = useRef(null)

  const reload = useCallback(async () => {
    if (!entityType || !entityId) return
    setLoading(true)
    try {
      const r = await fetch('/api/commentaires/' + entityType + '/' + entityId, {
        headers: { 'x-auth-token': token }
      })
      if (r.ok) setItems(await r.json())
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    // pour la liste des mentions, on recupere les users actifs
    fetch('/api/users', { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : [])
      .then(arr => Array.isArray(arr) ? setUsers(arr) : setUsers([]))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    const off1 = subscribe('comment_added', (ev) => {
      if (ev.entity_type === entityType && ev.entity_id === entityId) {
        setItems(prev => prev.find(c => c.id === ev.comment.id) ? prev : [...prev, ev.comment])
      }
    })
    const off2 = subscribe('comment_edited', (ev) => {
      if (ev.entity_type === entityType && ev.entity_id === entityId) {
        setItems(prev => prev.map(c => c.id === ev.comment.id ? ev.comment : c))
      }
    })
    const off3 = subscribe('comment_deleted', (ev) => {
      if (ev.entity_type === entityType && ev.entity_id === entityId) {
        setItems(prev => prev.filter(c => c.id !== ev.comment_id))
      }
    })
    return () => { off1(); off2(); off3() }
  }, [entityType, entityId, subscribe])

  // gestion du @mention
  const handleChange = (e) => {
    const v = e.target.value
    setTexte(v)
    const cur = e.target.selectionStart
    const before = v.slice(0, cur)
    const m = /@([a-zA-Z0-9._-]{0,40})$/.exec(before)
    if (m) setMentionState({ start: cur - m[0].length, query: m[1].toLowerCase() })
    else setMentionState(null)
  }

  const candidats = useMemo(() => {
    if (!mentionState) return []
    const q = mentionState.query
    return users.filter(u => u.actif && (
      (u.login || '').toLowerCase().includes(q) ||
      (u.nom || '').toLowerCase().includes(q)
    )).slice(0, 5)
  }, [mentionState, users])

  const insererMention = (u) => {
    if (!mentionState) return
    const before = texte.slice(0, mentionState.start)
    const after = texte.slice((textRef.current && textRef.current.selectionStart) || mentionState.start)
    const inject = '@' + u.login + ' '
    const neu = before + inject + after
    setTexte(neu)
    setMentionState(null)
    setTimeout(() => {
      if (textRef.current) {
        const pos = before.length + inject.length
        textRef.current.focus()
        textRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const envoyer = async () => {
    if (!texte.trim() || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/commentaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, texte })
      })
      if (r.ok) {
        const c = await r.json()
        setItems(prev => prev.find(x => x.id === c.id) ? prev : [...prev, c])
        setTexte('')
      } else {
        const e = await r.json().catch(() => ({}))
        alert(e.error || 'Erreur')
      }
    } finally {
      setSending(false)
    }
  }

  const supprimer = async (c) => {
    const motif = prompt('Motif de suppression ? (obligatoire)')
    if (!motif || !motif.trim()) return
    const r = await fetch('/api/commentaires/' + c.id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ motif })
    })
    if (r.ok) setItems(prev => prev.filter(x => x.id !== c.id))
  }

  const reactionner = async (c, emoji) => {
    const r = await fetch('/api/commentaires/' + c.id + '/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ emoji })
    })
    if (r.ok) {
      const updated = await r.json()
      setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
    }
  }

  const formaterTexte = (t) => {
    // encapsule les @mentions dans un span bleu
    const parts = []
    const re = /@([a-zA-Z0-9._-]+)/g
    let last = 0, m, k = 0
    while ((m = re.exec(t)) !== null) {
      if (m.index > last) parts.push(<span key={'t' + k++}>{t.slice(last, m.index)}</span>)
      parts.push(<span key={'m' + k++} style={{ color: '#1e3a8a', fontWeight: 600, background: '#dbeafe', padding: '1px 4px', borderRadius: 4 }}>{m[0]}</span>)
      last = m.index + m[0].length
    }
    if (last < t.length) parts.push(<span key={'t' + k++}>{t.slice(last)}</span>)
    return parts
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: 14, marginTop: 14
    }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Commentaires internes ({items.length})</span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>Mentions : tape @login pour notifier</span>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Chargement...</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Aucun commentaire pour le moment.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
          {items.map(c => (
            <div key={c.id} style={{
              background: c.user_id === user.id ? '#eff6ff' : '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 8, padding: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <UserBadge user={{ user_id: c.user_id, nom: c.user_nom }} size={24} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.user_nom}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {c.user_role} - {new Date(c.created_at).toLocaleString('fr-FR')}
                  {c.edited_at ? ' (modifie)' : ''}
                </span>
                {(c.user_id === user.id || user.role === 'directeur') && (
                  <button
                    onClick={() => supprimer(c)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                  >Supprimer</button>
                )}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: '#1f2937', whiteSpace: 'pre-wrap' }}>{formaterTexte(c.texte)}</div>
              {c.mentions && c.mentions.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                  Mentionne : {c.mentions.map(m => m.nom + ' (' + m.login + ')').join(', ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {['👍', '✅', '❓', '⚠️'].map(em => {
                  const count = (c.reactions && c.reactions[em]) ? c.reactions[em].length : 0
                  const mine = (c.reactions && c.reactions[em]) ? c.reactions[em].includes(user.id) : false
                  return (
                    <button
                      key={em}
                      onClick={() => reactionner(c, em)}
                      style={{
                        background: mine ? '#dbeafe' : 'transparent',
                        border: '1px solid ' + (mine ? '#3b82f6' : '#e2e8f0'),
                        borderRadius: 12, padding: '2px 8px', fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >{em}{count > 0 ? ' ' + count : ''}</button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, position: 'relative' }}>
        <textarea
          ref={textRef}
          value={texte}
          onChange={handleChange}
          placeholder="Votre commentaire. Mentionnez vos collegues avec @login."
          rows={3}
          style={{
            width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1',
            fontSize: 14, resize: 'vertical', fontFamily: 'inherit'
          }}
        />
        {candidats.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 56, left: 10, background: 'white',
            border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 10, minWidth: 220
          }}>
            {candidats.map(u => (
              <div
                key={u.id}
                onClick={() => insererMention(u)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <div style={{ fontWeight: 600 }}>@{u.login}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{u.nom} {u.prenom || ''} - {u.role}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Ctrl+Entree pour envoyer
          </span>
          <button
            onClick={envoyer}
            disabled={sending || !texte.trim()}
            style={{
              padding: '8px 16px', background: sending ? '#94a3b8' : '#1e3a8a',
              color: 'white', border: 'none', borderRadius: 6,
              fontWeight: 600, cursor: sending ? 'wait' : 'pointer', fontSize: 13
            }}
          >{sending ? 'Envoi...' : 'Publier'}</button>
        </div>
      </div>
    </div>
  )
}

// ==========================================================
// NOTIFICATIONS BELL + PANEL
// ==========================================================

export function NotificationsBell({ onOpen }) {
  const { nonLues, connected } = useRealtime()
  return (
    <button
      onClick={onOpen}
      style={{
        position: 'relative', background: 'transparent', border: '1px solid #e2e8f0',
        borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8
      }}
      title={connected ? 'Notifications' : 'Deconnecte du serveur temps reel'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
      <span style={{ fontSize: 13 }}>Notifs</span>
      {nonLues > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700,
          minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>{nonLues > 99 ? '99+' : nonLues}</span>
      )}
    </button>
  )
}

export function NotificationsPanel({ onClose, onNavigate }) {
  const { notifications, marquerLu, marquerToutLu, refreshNotifications } = useRealtime()
  useEffect(() => { refreshNotifications() }, [refreshNotifications])

  return (
    <div style={{
      position: 'fixed', bottom: 76, right: 20, width: 380, maxHeight: '75vh',
      background: 'white', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
      zIndex: 1000, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: '#1e3a8a' }}>Notifications</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={marquerToutLu} style={{ background: 'none', border: 'none', color: '#1e3a8a', cursor: 'pointer', fontSize: 12 }}>Tout marquer lu</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer' }}>X</button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Aucune notification.
          </div>
        ) : notifications.map(n => (
          <div
            key={n.id}
            onClick={() => {
              marquerLu(n.id)
              if (onNavigate && n.link) onNavigate(n.link)
              if (onClose) onClose()
            }}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #f1f5f9',
              cursor: 'pointer',
              background: n.lu ? 'white' : '#f8fafc',
              display: 'flex', flexDirection: 'column', gap: 4
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: n.lu ? 500 : 700, color: '#1e293b', fontSize: 13 }}>
                {n.titre || n.type || 'Notification'}
              </span>
              {!n.lu && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: 9, padding: '1px 6px', borderRadius: 4 }}>
                  NEW
                </span>
              )}
            </div>
            {n.message && (
              <div style={{ fontSize: 12, color: '#475569' }}>{n.message}</div>
            )}
            {n.date && (
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {new Date(n.date).toLocaleString('fr-FR')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}