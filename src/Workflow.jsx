/**
 * Logivia - Modules metier "vivants"
 *  - PiecesUploader (upload + OCR auto-detection)
 *  - PiecesChecklist (avec manquantes)
 *  - KanbanPage (vue workflow par etape)
 *  - MessagerieThread (conversations par dossier)
 *  - MessageriePage (vue globale)
 *  - RelancesPage
 *  - IAPredictionCard (estimation delai)
 *  - IAStatsPage (stats globales)
 *  - PVCALLink (bouton impression PV)
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRealtime, UserBadge } from './Realtime.jsx'

// ==========================================================
// HELPERS
// ==========================================================

function fmtDate(s) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('fr-FR') } catch (_) { return s }
}
function fmtDateTime(s) {
  if (!s) return '-'
  try { return new Date(s).toLocaleString('fr-FR') } catch (_) { return s }
}

function Btn({ children, variant = 'primary', ...rest }) {
  const styles = {
    primary: { background: '#1e3a8a', color: 'white' },
    ghost:   { background: 'transparent', color: '#1e3a8a', border: '1px solid #1e3a8a' },
    danger:  { background: '#ef4444', color: 'white' },
    success: { background: '#10b981', color: 'white' },
    warn:    { background: '#f59e0b', color: 'white' }
  }
  const s = styles[variant] || styles.primary
  return (
    <button {...rest} style={{
      padding: '6px 12px', border: 'none', borderRadius: 6, fontWeight: 600,
      cursor: rest.disabled ? 'not-allowed' : 'pointer', fontSize: 13,
      opacity: rest.disabled ? 0.6 : 1, ...s, ...(rest.style || {})
    }}>{children}</button>
  )
}

// ==========================================================
// PIECES JUSTIFICATIVES - Uploader + Liste + Checklist
// ==========================================================

/**
 * Lecture d'un fichier en base64 + tentative d'extraction de texte
 * (ici: juste le nom + PDF text-layer simulee cote client).
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

/**
 * Pseudo-OCR cote client : pour les images et PDF, on n'execute pas Tesseract
 * (pas de dep). On propose a l'utilisateur de coller le texte extrait manuellement
 * OU on utilise seulement le nom de fichier. La detection serveur s'appuie sur
 * nom + texte_extrait.
 */
export function PiecesUploader({ demId, onUploaded }) {
  const { token, subscribe } = useRealtime()
  const [types, setTypes] = useState({})
  const [pieces, setPieces] = useState([])
  const [manquantes, setManquantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null) // { file, base64, detected, type_choisi, texte }
  const fileRef = useRef(null)

  const reload = useCallback(async () => {
    if (!demId) return
    setLoading(true)
    try {
      const [rTypes, rPieces] = await Promise.all([
        fetch('/api/pieces/types', { headers: { 'x-auth-token': token } }),
        fetch('/api/pieces/' + demId, { headers: { 'x-auth-token': token } })
      ])
      if (rTypes.ok) setTypes(await rTypes.json())
      if (rPieces.ok) {
        const d = await rPieces.json()
        setPieces(d.pieces || [])
        setManquantes(d.manquantes || [])
      }
    } finally { setLoading(false) }
  }, [demId, token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const off1 = subscribe('piece_uploaded', ev => { if (ev.dem_id === demId) reload() })
    const off2 = subscribe('piece_updated', ev => { if (ev.dem_id === demId) reload() })
    const off3 = subscribe('piece_deleted', ev => { if (ev.dem_id === demId) reload() })
    return () => { off1(); off2(); off3() }
  }, [demId, subscribe, reload])

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      const base64 = await readFileAsBase64(file)
      // preview - detection cote client sur le nom uniquement (pour indication)
      const nomLower = (file.name || '').toLowerCase()
      let best = { type: 'autre', score: 0 }
      for (const [type, def] of Object.entries(types)) {
        const trouves = (def.mots_cles || []).filter(mc => nomLower.includes(mc))
        if (trouves.length > best.score) best = { type, score: trouves.length }
      }
      setPreview({ file, base64, detected: best.type, type_choisi: best.type, texte: '' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmerUpload = async () => {
    if (!preview) return
    setUploading(true)
    try {
      const body = {
        dem_id: demId,
        nom_fichier: preview.file.name,
        mime: preview.file.type || 'application/octet-stream',
        taille: preview.file.size,
        contenu_base64: preview.base64,
        texte_extrait: preview.texte || '',
        type_force: preview.type_choisi !== preview.detected ? preview.type_choisi : null
      }
      const r = await fetch('/api/pieces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(body)
      })
      if (r.ok) {
        setPreview(null)
        reload()
        if (onUploaded) onUploaded()
      } else {
        const e = await r.json().catch(() => ({}))
        alert(e.error || 'Erreur')
      }
    } finally { setUploading(false) }
  }

  const valider = async (p) => {
    await fetch('/api/pieces/' + p.id + '/valider', {
      method: 'PUT', headers: { 'x-auth-token': token }
    })
    reload()
  }

  const refuser = async (p) => {
    const motif = prompt('Motif du refus (obligatoire) :')
    if (!motif || !motif.trim()) return
    await fetch('/api/pieces/' + p.id + '/refuser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ motif })
    })
    reload()
  }

  const supprimer = async (p) => {
    const motif = prompt('Motif de suppression (obligatoire) :')
    if (!motif || !motif.trim()) return
    await fetch('/api/pieces/' + p.id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ motif })
    })
    reload()
  }

  const reclasser = async (p, type) => {
    await fetch('/api/pieces/' + p.id + '/reclassifier', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ type })
    })
    reload()
  }

  const ouvrir = async (p) => {
    const r = await fetch('/api/pieces/' + p.id + '/contenu', { headers: { 'x-auth-token': token } })
    if (!r.ok) return alert('Impossible d\'ouvrir')
    const d = await r.json()
    if (!d.contenu_base64) return alert('Fichier non disponible')
    const win = window.open('', '_blank')
    if (!win) return
    const src = 'data:' + (d.mime || 'application/octet-stream') + ';base64,' + d.contenu_base64
    if ((d.mime || '').startsWith('image/')) {
      win.document.write('<img src="' + src + '" style="max-width:100%">')
    } else if (d.mime === 'application/pdf') {
      win.document.write('<embed src="' + src + '" type="application/pdf" style="width:100vw;height:100vh">')
    } else {
      win.document.write('<a href="' + src + '" download="' + (d.nom_fichier || 'fichier') + '">Telecharger ' + (d.nom_fichier || '') + '</a>')
    }
  }

  const statutStyle = (s) => {
    if (s === 'validee') return { bg: '#dcfce7', bd: '#86efac', col: '#166534', lib: 'Validee' }
    if (s === 'refusee') return { bg: '#fee2e2', bd: '#fca5a5', col: '#991b1b', lib: 'Refusee' }
    return { bg: '#fef3c7', bd: '#fcd34d', col: '#92400e', lib: 'A valider' }
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginTop: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Pieces justificatives ({pieces.length})</span>
        <label style={{ cursor: 'pointer', background: '#1e3a8a', color: 'white', padding: '6px 14px', borderRadius: 6, fontSize: 13 }}>
          + Ajouter une piece
          <input ref={fileRef} type="file" onChange={handleFile} style={{ display: 'none' }} accept="image/*,application/pdf,.doc,.docx" />
        </label>
      </div>

      {manquantes.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 13, color: '#92400e' }}>
          <b>{manquantes.length} piece(s) obligatoire(s) manquante(s) :</b> {manquantes.map(m => m.libelle).join(', ')}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>Chargement...</div>
      ) : pieces.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Aucune piece uploadee.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pieces.map(p => {
            const st = statutStyle(p.statut)
            const def = types[p.type] || {}
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 10, borderRadius: 6,
                background: st.bg, border: '1px solid ' + st.bd
              }}>
                <div style={{ flex: '0 0 auto', fontSize: 22 }}>📎</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.nom_fichier}
                  </div>
                  <div style={{ fontSize: 11, color: st.col, marginTop: 2 }}>
                    <b>{def.libelle || p.type}</b>
                    {p.type !== p.type_detecte && <span style={{ marginLeft: 6, color: '#64748b' }}>(detecte: {p.type_detecte}, corrige)</span>}
                    {' - '}{fmtDateTime(p.uploaded_at)} par {p.uploaded_by_nom}
                    {' - '}{st.lib}
                    {p.motif_refus && <span> - Motif: {p.motif_refus}</span>}
                  </div>
                </div>
                <select
                  value={p.type}
                  onChange={(e) => reclasser(p, e.target.value)}
                  style={{ padding: 4, fontSize: 11, borderRadius: 4 }}
                >
                  {Object.entries(types).map(([k, v]) => (
                    <option key={k} value={k}>{v.libelle}</option>
                  ))}
                </select>
                <Btn variant="ghost" onClick={() => ouvrir(p)} style={{ padding: '4px 8px', fontSize: 12 }}>Voir</Btn>
                {p.statut !== 'validee' && (
                  <Btn variant="success" onClick={() => valider(p)} style={{ padding: '4px 8px', fontSize: 12 }}>Valider</Btn>
                )}
                {p.statut !== 'refusee' && (
                  <Btn variant="warn" onClick={() => refuser(p)} style={{ padding: '4px 8px', fontSize: 12 }}>Refuser</Btn>
                )}
                <Btn variant="danger" onClick={() => supprimer(p)} style={{ padding: '4px 8px', fontSize: 12 }}>Suppr</Btn>
              </div>
            )
          })}
        </div>
      )}

      {preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 20, maxWidth: 500, width: '92%' }}>
            <h3 style={{ marginTop: 0, color: '#1e3a8a' }}>Confirmer l'upload</h3>
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              <b>Fichier :</b> {preview.file.name}<br />
              <b>Taille :</b> {Math.round(preview.file.size / 1024)} ko
            </div>
            <div style={{ marginBottom: 10, fontSize: 13 }}>
              <b>Type detecte automatiquement :</b>{' '}
              <span style={{ color: '#1e3a8a', fontWeight: 600 }}>{types[preview.detected]?.libelle || preview.detected}</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Corriger le type si necessaire :</label>
              <select
                value={preview.type_choisi}
                onChange={(e) => setPreview({ ...preview, type_choisi: e.target.value })}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                {Object.entries(types).map(([k, v]) => (
                  <option key={k} value={k}>{v.libelle}{v.obligatoire ? ' *' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                Coller le texte extrait du document (optionnel - aide l'OCR serveur) :
              </label>
              <textarea
                value={preview.texte}
                onChange={(e) => setPreview({ ...preview, texte: e.target.value })}
                rows={3}
                placeholder="Copiez quelques lignes du document pour ameliorer la detection..."
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setPreview(null)} disabled={uploading}>Annuler</Btn>
              <Btn variant="primary" onClick={confirmerUpload} disabled={uploading}>
                {uploading ? 'Upload...' : 'Confirmer l\'upload'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================================
// KANBAN WORKFLOW
// ==========================================================

export function KanbanPage({ onOpenDemandeur }) {
  const { token, subscribe, user } = useRealtime()
  const [etapes, setEtapes] = useState([])
  const [colonnes, setColonnes] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dragged, setDragged] = useState(null)
  const [hoverCol, setHoverCol] = useState(null)

  const peutDeplacer = user && (user.role === 'agent' || user.role === 'directeur')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/workflow/kanban', { headers: { 'x-auth-token': token } })
      if (r.ok) {
        const d = await r.json()
        setEtapes(d.etapes || [])
        setColonnes(d.colonnes || {})
        setTotal(d.total || 0)
      }
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const off = subscribe('workflow_moved', () => reload())
    return off
  }, [subscribe, reload])

  const deplacer = async (dem_id, etape) => {
    const r = await fetch('/api/workflow/deplacer/' + dem_id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ etape, motif: 'Deplacement kanban' })
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert(e.error || 'Erreur de deplacement')
    }
    reload()
  }

  const onDrop = (etapeId) => {
    if (!dragged || !peutDeplacer) return
    if (dragged.etape === etapeId) return
    deplacer(dragged.dem_id, etapeId)
    setDragged(null)
    setHoverCol(null)
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#1e3a8a', margin: 0 }}>Kanban workflow</h1>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          {total} dossiers actifs repartis sur {etapes.length} etapes.
          {peutDeplacer ? ' Glisser-deposer pour deplacer.' : ' (Lecture seule - vous n\'avez pas les droits de deplacement.)'}
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#64748b' }}>Chargement...</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 20 }}>
          {etapes.map(e => {
            const items = colonnes[e.id] || []
            const isHover = hoverCol === e.id && dragged
            return (
              <div
                key={e.id}
                onDragOver={ev => { if (peutDeplacer) { ev.preventDefault(); setHoverCol(e.id) } }}
                onDragLeave={() => setHoverCol(null)}
                onDrop={() => onDrop(e.id)}
                style={{
                  flex: '0 0 280px',
                  background: isHover ? '#eff6ff' : '#f8fafc',
                  border: '2px solid ' + (isHover ? e.couleur : '#e2e8f0'),
                  borderRadius: 10, padding: 10,
                  minHeight: 400
                }}
              >
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: e.couleur, fontSize: 13, textTransform: 'uppercase' }}>
                    {e.libelle} ({items.length})
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{e.description}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.length === 0 ? (
                    <div style={{ color: '#cbd5e1', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                      (vide)
                    </div>
                  ) : items.map(d => (
                    <div
                      key={d.id}
                      draggable={peutDeplacer}
                      onDragStart={() => setDragged({ dem_id: d.id, etape: e.id })}
                      onDragEnd={() => setDragged(null)}
                      onClick={() => onOpenDemandeur && onOpenDemandeur(d.id)}
                      style={{
                        background: 'white', border: '1px solid #e2e8f0',
                        borderLeft: '4px solid ' + e.couleur,
                        borderRadius: 6, padding: 8, cursor: peutDeplacer ? 'grab' : 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{d.nom}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                        {d.typologie || '?'} - {d.composition || '?'} - Score {d.score || 0}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                        {d.dalo && (
                          <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>DALO</span>
                        )}
                        {d.urgence === 'urgente' && (
                          <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>URGENT</span>
                        )}
                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>
                          {d.nb_pieces_validees}/{d.nb_pieces_obligatoires} PJ
                        </span>
                        {d.quartier && (
                          <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{d.quartier}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ==========================================================
// MESSAGERIE
// ==========================================================

export function MessagerieThread({ demId }) {
  const { token, user, subscribe } = useRealtime()
  const [messages, setMessages] = useState([])
  const [texte, setTexte] = useState('')
  const [destinataires, setDestinataires] = useState([])
  const [canal, setCanal] = useState('interne')
  const [users, setUsers] = useState([])
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const reload = useCallback(async () => {
    if (!demId) return
    const r = await fetch('/api/messages/' + demId, { headers: { 'x-auth-token': token } })
    if (r.ok) setMessages(await r.json())
  }, [demId, token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    fetch('/api/users', { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : []).then(arr => Array.isArray(arr) && setUsers(arr))
      .catch(() => {})
  }, [token])

  useEffect(() => {
    const off = subscribe('message_sent', ev => { if (ev.dem_id === demId) reload() })
    return off
  }, [demId, subscribe, reload])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const envoyer = async () => {
    if (!texte.trim() || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ dem_id: demId, texte, destinataires, canal })
      })
      if (r.ok) {
        setTexte('')
        reload()
      }
    } finally { setSending(false) }
  }

  const toggleDest = (uid) => {
    setDestinataires(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginTop: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: '#1e3a8a' }}>Messagerie du dossier ({messages.length})</div>
      <div ref={scrollRef} style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>Pas encore de message sur ce dossier.</div>
        ) : messages.map(m => {
          const mine = m.from_user_id === user.id
          return (
            <div key={m.id} style={{
              alignSelf: mine ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              background: mine ? '#dbeafe' : '#f1f5f9',
              borderRadius: 10, padding: 10, fontSize: 13
            }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: mine ? '#1e3a8a' : '#475569' }}>
                {m.from_user_nom} ({m.from_role}) {m.canal !== 'interne' ? ' - ' + m.canal.toUpperCase() : ''}
              </div>
              <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.texte}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                {fmtDateTime(m.created_at)}
                {m.tracking && m.tracking.livre && ' - livre ' + fmtDateTime(m.tracking.livre)}
                {m.tracking && m.tracking.erreur && ' - ERREUR: ' + m.tracking.erreur}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 6, fontSize: 12, flexWrap: 'wrap' }}>
        <b>Canal :</b>
        {['interne', 'telegram'].map(c => (
          <label key={c} style={{ cursor: 'pointer' }}>
            <input type="radio" checked={canal === c} onChange={() => setCanal(c)} /> {c === 'interne' ? 'Equipe interne' : 'Telegram candidat'}
          </label>
        ))}
      </div>

      {canal === 'interne' && (
        <div style={{ marginBottom: 6, fontSize: 12 }}>
          <b>Destinataires (optionnel, notifications push) :</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {users.filter(u => u.id !== user.id && u.actif).slice(0, 10).map(u => (
              <label key={u.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: destinataires.includes(u.id) ? '#dbeafe' : '#f1f5f9',
                padding: '2px 8px', borderRadius: 12, cursor: 'pointer', fontSize: 11
              }}>
                <input type="checkbox" checked={destinataires.includes(u.id)} onChange={() => toggleDest(u.id)} style={{ margin: 0 }} />
                {u.nom} ({u.role})
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.ctrlKey && e.key === 'Enter') envoyer() }}
          placeholder="Votre message..."
          rows={2}
          style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
        />
        <Btn onClick={envoyer} disabled={sending || !texte.trim()}>
          {sending ? 'Envoi...' : 'Envoyer'}
        </Btn>
      </div>
    </div>
  )
}

export function MessageriePage({ onOpenDemandeur }) {
  const { token, subscribe } = useRealtime()
  const [conv, setConv] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/mes-conversations', { headers: { 'x-auth-token': token } })
      if (r.ok) setConv(await r.json())
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const off = subscribe('message_sent', reload)
    const off2 = subscribe('message_recu', reload)
    return () => { off(); off2() }
  }, [subscribe, reload])

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ color: '#1e3a8a', margin: 0, marginBottom: 16 }}>Mes conversations</h1>
      {loading ? (
        <div style={{ color: '#64748b' }}>Chargement...</div>
      ) : conv.length === 0 ? (
        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucune conversation pour le moment.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conv.map(c => (
            <div
              key={c.dem_id}
              onClick={() => onOpenDemandeur && onOpenDemandeur(c.dem_id)}
              style={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: 12, cursor: 'pointer',
                borderLeft: c.non_lus > 0 ? '4px solid #1e3a8a' : '1px solid #e2e8f0'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{c.dem_nom}</div>
                {c.non_lus > 0 && (
                  <span style={{ background: '#ef4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                    {c.non_lus} non lu(s)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                <b>{c.dernier_auteur} :</b> {c.dernier_message}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                {c.total} message(s) - {fmtDateTime(c.dernier_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==========================================================
// RELANCES AUTOMATIQUES
// ==========================================================

export function RelancesPage({ onOpenDemandeur }) {
  const { token, subscribe } = useRealtime()
  const [relances, setRelances] = useState([])
  const [loading, setLoading] = useState(true)
  const [analysing, setAnalysing] = useState(false)
  const [filtre, setFiltre] = useState('actives')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/relances', { headers: { 'x-auth-token': token } })
      if (r.ok) setRelances(await r.json())
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const off = subscribe('relances_generees', reload)
    return off
  }, [subscribe, reload])

  const analyser = async () => {
    setAnalysing(true)
    try {
      const r = await fetch('/api/relances/analyser', {
        method: 'POST', headers: { 'x-auth-token': token }
      })
      if (r.ok) {
        const d = await r.json()
        alert(d.nouvelles + ' nouvelle(s) relance(s) detectee(s).')
        reload()
      } else {
        const e = await r.json().catch(() => ({}))
        alert(e.error || 'Erreur')
      }
    } finally { setAnalysing(false) }
  }

  const traiter = async (r) => {
    const commentaire = prompt('Commentaire (optionnel) :')
    const res = await fetch('/api/relances/' + r.id + '/traiter', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ action: 'relance_envoyee', commentaire })
    })
    if (res.ok) reload()
  }

  const affiches = relances.filter(r => filtre === 'actives' ? !r.traitee : filtre === 'traitees' ? r.traitee : true)

  const couleurRegle = {
    piece_manquante_7: '#f59e0b',
    candidat_silence_15: '#ef4444',
    dossier_inactif_30: '#8b5cf6',
    post_cal_7: '#06b6d4'
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ color: '#1e3a8a', margin: 0 }}>Relances automatiques</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filtre} onChange={e => setFiltre(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="actives">Actives</option>
            <option value="traitees">Traitees</option>
            <option value="toutes">Toutes</option>
          </select>
          <Btn variant="primary" onClick={analyser} disabled={analysing}>
            {analysing ? 'Analyse...' : 'Lancer l\'analyse'}
          </Btn>
        </div>
      </div>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#1e3a8a' }}>
        Le systeme scanne tous les dossiers actifs et detecte 4 types de relances :
        pieces manquantes > 7j, silence candidat > 15j, dossier inactif > 30j, attribution sans signature > 7j.
        La meme regle ne se redeclenche pas plus d'une fois par semaine.
      </div>

      {loading ? (
        <div style={{ color: '#64748b' }}>Chargement...</div>
      ) : affiches.length === 0 ? (
        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucune relance {filtre === 'actives' ? 'active' : filtre === 'traitees' ? 'traitee' : ''}.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {affiches.map(r => (
            <div key={r.id} style={{
              background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: 12, borderLeft: '4px solid ' + (couleurRegle[r.regle] || '#64748b'),
              opacity: r.traitee ? 0.6 : 1
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    <span
                      onClick={() => onOpenDemandeur && onOpenDemandeur(r.dem_id)}
                      style={{ color: '#1e3a8a', textDecoration: 'underline', cursor: 'pointer' }}
                    >{r.dem_nom}</span>
                    <span style={{ marginLeft: 10, color: couleurRegle[r.regle] || '#64748b' }}>
                      {r.titre}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                    {r.detail} - genere {fmtDateTime(r.created_at)}
                  </div>
                  {r.traitee && (
                    <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>
                      Traitee par {r.traitee_par} le {fmtDateTime(r.traitee_le)}
                      {r.commentaire ? ' - ' + r.commentaire : ''}
                    </div>
                  )}
                </div>
                {!r.traitee && (
                  <Btn variant="success" onClick={() => traiter(r)}>Marquer traitee</Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==========================================================
// IA PREDICTIVE
// ==========================================================

export function IAPredictionCard({ demandeur }) {
  const { token } = useRealtime()
  const [pred, setPred] = useState(null)
  const [loading, setLoading] = useState(false)

  const predire = useCallback(async () => {
    if (!demandeur) return
    setLoading(true)
    try {
      const r = await fetch('/api/ia/predict-delai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          typologie: demandeur.typologie,
          composition: demandeur.composition_familiale,
          dalo: !!demandeur.dalo,
          score: demandeur.score || 0,
          prioritaire: demandeur.urgence === 'urgente'
        })
      })
      if (r.ok) setPred(await r.json())
    } finally { setLoading(false) }
  }, [demandeur, token])

  useEffect(() => { predire() }, [predire])

  if (loading || !pred) {
    return (
      <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13, color: '#64748b' }}>
        {loading ? 'Estimation IA en cours...' : 'Aucune prediction disponible.'}
      </div>
    )
  }

  if (!pred.disponible) {
    return (
      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13, color: '#92400e' }}>
        {pred.message}
      </div>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #93c5fd', borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 14, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>IA - Estimation du delai d'attribution</span>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1e3a8a', lineHeight: 1 }}>
            ≈ {pred.estimation_mois} mois
          </div>
          <div style={{ fontSize: 12, color: '#475569' }}>
            ({pred.intervalle_confiance.bas} à {pred.intervalle_confiance.haut} jours - intervalle 70%)
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: '#475569' }}>
          <div><b>Base statistique :</b> {pred.base_statistique.niveau} ({pred.base_statistique.echantillon} dossiers)</div>
          <div><b>Moyenne :</b> {pred.base_statistique.moyenne}j - <b>Mediane :</b> {pred.base_statistique.mediane}j</div>
          <div><b>Concurrents :</b> {pred.concurrents_actuels} dossiers similaires actifs</div>
        </div>
      </div>
      {pred.signaux_faibles && pred.signaux_faibles.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pred.signaux_faibles.map((s, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 4,
                background: s.niveau === 'alerte' ? '#fee2e2' : '#eff6ff',
                color: s.niveau === 'alerte' ? '#991b1b' : '#1e3a8a'
              }}
            >
              {s.niveau === 'alerte' ? '⚠️ ' : 'ℹ️ '}{s.texte}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function IAStatsPage() {
  const { token } = useRealtime()
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ia/stats-globales', { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : { par_typologie: [] })
      .then(d => { setStats(d.par_typologie || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  const maxDelai = Math.max(1, ...stats.map(s => s.delai_moyen_jours || 0))

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ color: '#1e3a8a', margin: 0, marginBottom: 16 }}>IA - Statistiques globales d'attribution</h1>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#1e3a8a' }}>
        Ces statistiques alimentent le modele predictif. Plus l'historique est riche, plus les predictions sont fiables.
      </div>
      {loading ? (
        <div style={{ color: '#64748b' }}>Chargement...</div>
      ) : stats.length === 0 ? (
        <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Pas encore de donnees historiques.</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1e3a8a', color: 'white', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>Typologie</th>
                <th style={{ padding: 10 }}>Total actifs</th>
                <th style={{ padding: 10 }}>Attribues</th>
                <th style={{ padding: 10 }}>Taux</th>
                <th style={{ padding: 10 }}>Delai moyen</th>
                <th style={{ padding: 10 }}>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.typologie} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 10, fontWeight: 600 }}>{s.typologie}</td>
                  <td style={{ padding: 10 }}>{s.total}</td>
                  <td style={{ padding: 10 }}>{s.attribues}</td>
                  <td style={{ padding: 10 }}>{s.taux_attribution}%</td>
                  <td style={{ padding: 10 }}>{s.delai_moyen_jours !== null ? s.delai_moyen_jours + ' j' : '-'}</td>
                  <td style={{ padding: 10, minWidth: 150 }}>
                    <div style={{ background: '#e2e8f0', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{
                        width: ((s.delai_moyen_jours || 0) / maxDelai * 100) + '%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #f59e0b, #ef4444)'
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==========================================================
// PV CAL - Lien de generation
// ==========================================================

export function PVCALButton({ decisionId, token }) {
  const url = '/api/cal/pv/' + decisionId + '?token=' + encodeURIComponent(token)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', background: '#1e3a8a', color: 'white',
        borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13
      }}
    >📄 Editer PV CAL (HTML imprimable PDF)</a>
  )
}
