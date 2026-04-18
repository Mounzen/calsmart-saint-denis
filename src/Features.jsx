/**
 * Logivia - Modules fonctionnels
 *
 * Regroupe les composants ajoutes pour rendre l'appli vivante :
 *  - EditWithMotifModal : edition generique avec motif obligatoire
 *  - HistoriqueFicheModal : vue audit par entite (qui, quoi, quand, pourquoi)
 *  - TimelineDemandeur : historique complet d'un dossier
 *  - CalendrierPage : vue calendrier CAL + audiences + evenements
 *  - CartePage : visualisation territoriale
 *  - FicheEluPage : elu enrichi avec audiences et parcours candidats
 *  - ScoringReglesPage : regles de scoring transparentes et editables
 *  - AlertesBandeau : bandeau d'alertes intelligentes
 *  - RechercheGlobale : Cmd+K
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'

// ===========================================================
// API CLIENT (reprend le meme token que App.jsx)
// ===========================================================

function getToken() { return localStorage.getItem('cal_token') }

async function fapi(path, options) {
  const token = getToken()
  const opts = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
      ...(options ? options.headers : {})
    }
  }
  if (options && options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body)
  }
  const r = await fetch('/api' + path, opts)
  if (r.status === 401) { localStorage.removeItem('cal_token'); window.location.reload(); return }
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.status }))
    const e = new Error(err.error || String(r.status))
    e.data = err
    throw e
  }
  if (r.status === 204) return null
  return r.json()
}

// ===========================================================
// DESIGN TOKENS (repris de App.jsx pour coherence)
// ===========================================================

const C = {
  navy: '#0B1E3D', navyB: '#1D3557',
  accent: '#E05C2A', accentL: 'rgba(224,92,42,0.10)',
  bg: '#EEF1F6', card: '#FFFFFF',
  text: '#0B1E3D', muted: '#5B6B85', light: '#8A9BB5', border: '#DDE3EE',
  green: '#16A34A', greenBg: '#DCFCE7',
  amber: '#D97706', amberBg: '#FEF3C7',
  red: '#DC2626', redBg: '#FEE2E2',
  purple: '#7C3AED', purpleBg: '#EDE9FE',
  teal: '#0D9488', tealBg: '#CCFBF1',
  blue: '#1D6FA8', blueBg: '#DBEAFE'
}
const Fh = "'Syne',sans-serif"
const Fb = "'DM Sans',sans-serif"

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 7,
  border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 13,
  color: C.text, boxSizing: 'border-box', outline: 'none', background: '#fff'
}

// Motifs standardises pour la tracabilite
export const MOTIFS_MODIFICATION = [
  'Mise a jour situation familiale',
  'Mise a jour situation professionnelle',
  'Mise a jour revenus',
  'Changement d adresse',
  'Changement de typologie souhaitee',
  'Correction erreur de saisie',
  'Actualisation annuelle',
  'Ajout piece justificative',
  'Demande du candidat',
  'Retour commission',
  'Audience elu',
  'Instruction DALO',
  'Autre motif (precise ci-dessous)'
]

export const MOTIFS_ARCHIVAGE = [
  'Attribution effective',
  'Dossier annule par le candidat',
  'Relogement ailleurs',
  'Dossier caduc (anciennete)',
  'Doublon',
  'Deces du demandeur',
  'Demenagement hors commune',
  'Autre motif (precise ci-dessous)'
]

// ===========================================================
// MODAL generique (reprise mais autoportante)
// ===========================================================

export function LModal({ title, onClose, children, maxW }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,61,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.card, borderRadius: 14, padding: 28, width: '100%', maxWidth: maxW || 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: Fh, fontSize: 17, fontWeight: 800, color: C.text, margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.muted, padding: 6, borderRadius: 6, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ===========================================================
// EDIT WITH MOTIF : modale d'edition universelle avec motif obligatoire
// ===========================================================

export function EditWithMotifModal({
  title, item, fields, onClose, onSaved, endpoint, toast,
  motifs, archiveEndpoint
}) {
  const [form, setForm] = useState(() => {
    const o = {}
    for (const f of fields) o[f.key] = item[f.key] !== undefined ? item[f.key] : (f.defaultValue || '')
    return o
  })
  const [motifChoix, setMotifChoix] = useState('')
  const [motifLibre, setMotifLibre] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)

  // Detection des changements
  const changements = useMemo(() => {
    const ch = []
    for (const f of fields) {
      const avant = item[f.key]
      const apres = form[f.key]
      const eq = JSON.stringify(avant) === JSON.stringify(apres)
      if (!eq) ch.push({ ...f, avant, apres })
    }
    return ch
  }, [form, item, fields])

  const motifFinal = motifChoix === 'Autre motif (precise ci-dessous)' ? motifLibre.trim() : motifChoix

  const submit = async () => {
    if (changements.length === 0) {
      if (toast) toast('Aucune modification', 'info')
      onClose()
      return
    }
    if (!motifFinal) {
      if (toast) toast('Motif de modification obligatoire', 'error')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, __motif: motifFinal }
      const updated = await fapi(endpoint, { method: 'PUT', body })
      if (toast) toast('Modifications enregistrees - ' + changements.length + ' champ(s)', 'success')
      onSaved && onSaved(updated)
      onClose()
    } catch (e) {
      if (e.data && e.data.need_motif) {
        setPreview(e.data.preview)
        if (toast) toast('Motif requis', 'warning')
      } else {
        if (toast) toast('Erreur : ' + e.message, 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <LModal title={title} onClose={onClose} maxW={720}>
      <div style={{ background: C.amberBg, border: '1px solid ' + C.amber + '33', borderRadius: 9, padding: '10px 14px', fontSize: 12, color: C.amber, marginBottom: 18, fontWeight: 600 }}>
        Chaque modification est tracee (qui, quoi, quand, pourquoi). Le motif est obligatoire.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {fields.map(f => (
          <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{f.label}</label>
            {f.type === 'select' ? (
              <select style={inp} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}>
                <option value="">---</option>
                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: form[f.key] ? C.accent : C.text, fontWeight: form[f.key] ? 600 : 400 }}>
                <input type="checkbox" checked={!!form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} />
                {f.checkboxLabel || f.label}
              </label>
            ) : f.type === 'multi' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(f.options || []).map(o => {
                  const on = (form[f.key] || []).includes(o)
                  return (
                    <button type="button" key={o}
                      onClick={() => setForm(p => ({ ...p, [f.key]: on ? (p[f.key] || []).filter(x => x !== o) : [...(p[f.key] || []), o] }))}
                      style={{ padding: '4px 10px', borderRadius: 6, background: on ? C.accentL : C.bg, border: '1px solid ' + (on ? C.accent : C.border), fontSize: 12, color: on ? C.accent : C.text, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
                      {o}
                    </button>
                  )
                })}
              </div>
            ) : f.type === 'textarea' ? (
              <textarea rows={3} style={{ ...inp, minHeight: 60, fontFamily: Fb }}
                value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            ) : (
              <input style={inp} type={f.type === 'number' ? 'number' : 'text'}
                value={form[f.key] !== undefined && form[f.key] !== null ? form[f.key] : ''}
                onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? e.target.value : (f.upper ? e.target.value.toUpperCase() : e.target.value) }))} />
            )}
          </div>
        ))}
      </div>

      {changements.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: C.bg, borderRadius: 9, border: '1px solid ' + C.border }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Previsualisation ({changements.length} champ{changements.length > 1 ? 's modifies' : ' modifie'})
          </div>
          {changements.slice(0, 8).map(ch => (
            <div key={ch.key} style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 120 }}>{ch.label}</span>
              <span style={{ color: C.red, textDecoration: 'line-through', opacity: 0.7 }}>{fmtShort(ch.avant)}</span>
              <span style={{ color: C.muted }}>→</span>
              <span style={{ color: C.green, fontWeight: 600 }}>{fmtShort(ch.apres)}</span>
            </div>
          ))}
          {changements.length > 8 && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>... et {changements.length - 8} autre(s)</div>}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.red, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
          Motif de modification * (obligatoire)
        </label>
        <select style={{ ...inp, borderColor: motifChoix ? C.border : C.red }}
          value={motifChoix} onChange={e => setMotifChoix(e.target.value)}>
          <option value="">--- Choisir un motif ---</option>
          {(motifs || MOTIFS_MODIFICATION).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {motifChoix === 'Autre motif (precise ci-dessous)' && (
          <input style={{ ...inp, marginTop: 8 }}
            placeholder="Precisez le motif"
            value={motifLibre} onChange={e => setMotifLibre(e.target.value)} />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
        <button onClick={onClose} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>
          Annuler
        </button>
        <button onClick={submit} disabled={saving || changements.length === 0 || !motifFinal}
          style={{ padding: '9px 20px', background: changements.length === 0 || !motifFinal ? C.border : C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement...' : 'Enregistrer la modification'}
        </button>
      </div>
    </LModal>
  )
}

function fmtShort(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (v === true) return 'Oui'
  if (v === false) return 'Non'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '-'
  const s = String(v)
  return s.length > 40 ? s.slice(0, 37) + '...' : s
}

// ===========================================================
// HISTORIQUE FICHE : tracabilite complete d'une entite
// ===========================================================

export function HistoriqueFicheModal({ entity_type, entity_id, onClose }) {
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fapi('/audit?entity_type=' + entity_type + '&entity_id=' + entity_id)
      .then(setAudit).catch(() => {}).finally(() => setLoading(false))
  }, [entity_type, entity_id])

  return (
    <LModal title="Tracabilite - qui a modifie quoi, quand, pourquoi" onClose={onClose} maxW={780}>
      {loading ? (
        <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>Chargement de l historique...</div>
      ) : audit.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Aucune modification enregistree pour cette fiche.
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{audit.length} evenement(s) sur cette fiche</div>
          {audit.map(a => (
            <div key={a.id} style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 10, borderLeft: '3px solid ' + (a.action === 'archivage' ? C.red : C.accent) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text, fontFamily: Fh }}>{a.user_nom}</span>
                  <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: C.card, color: C.muted, fontWeight: 600 }}>{a.role}</span>
                  <span style={{ fontSize: 11, marginLeft: 8, color: C.muted }}>{a.action}</span>
                </div>
                <span style={{ fontSize: 11, color: C.muted }}>{a.date} a {a.heure}</span>
              </div>
              {a.motif && (
                <div style={{ fontSize: 12, color: C.text, fontStyle: 'italic', marginBottom: 6 }}>
                  <b style={{ fontStyle: 'normal', color: C.red }}>Motif :</b> {a.motif}
                </div>
              )}
              {(a.changes || []).map((c, i) => (
                <div key={i} style={{ fontSize: 11.5, color: C.text, paddingLeft: 10, marginTop: 3 }}>
                  <b>{c.label}</b> :{' '}
                  <span style={{ color: C.red, textDecoration: 'line-through', opacity: 0.7 }}>{c.avant}</span>
                  {' → '}
                  <span style={{ color: C.green, fontWeight: 600 }}>{c.apres}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </LModal>
  )
}

// ===========================================================
// TIMELINE DEMANDEUR
// ===========================================================

export function TimelineDemandeur({ dem_id, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fapi('/demandeurs/' + dem_id + '/timeline')
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [dem_id])

  if (loading) return <LModal title="Chargement..." onClose={onClose}><div style={{ padding: 30, color: C.muted }}>Chargement...</div></LModal>
  if (!data) return null

  const d = data.demandeur
  return (
    <LModal title={'Parcours complet - ' + d.nom + ' ' + d.prenom} onClose={onClose} maxW={780}>
      <div style={{ background: C.navy, borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#fff' }}>
        <div style={{ fontFamily: Fh, fontSize: 15, fontWeight: 800 }}>{d.nom} {d.prenom}</div>
        <div style={{ fontSize: 12, color: C.light, marginTop: 2 }}>
          NUD : {d.nud || '---'} · {d.anc} mois · {d.typ_v} · {(d.rev || 0).toLocaleString()} EUR/mois
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Timeline ({data.timeline.length} evenements)
      </div>
      <div style={{ position: 'relative', paddingLeft: 22 }}>
        <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: C.border }} />
        {data.timeline.map((ev, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ position: 'absolute', left: -19, top: 3, width: 12, height: 12, borderRadius: '50%', background: ev.couleur, boxShadow: '0 0 0 3px white, 0 0 0 4px ' + ev.couleur }} />
            <div style={{ fontSize: 10.5, color: C.muted }}>{ev.date}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: Fh }}>{ev.titre}</div>
            {ev.detail && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{ev.detail}</div>}
          </div>
        ))}
        {data.timeline.length === 0 && <div style={{ color: C.muted, fontSize: 12 }}>Aucun evenement.</div>}
      </div>
    </LModal>
  )
}

// ===========================================================
// ALERTES INTELLIGENTES (bandeau + page)
// ===========================================================

export function AlertesBandeau({ onClick }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fapi('/alertes').then(setData).catch(() => {})
  }, [])
  if (!data || data.total === 0) return null
  const crit = data.par_niveau.critique
  const att = data.par_niveau.attention
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 18px', background: crit > 0 ? C.redBg : C.amberBg, borderRadius: 11, border: '1px solid ' + (crit > 0 ? C.red : C.amber) + '44', cursor: 'pointer', marginBottom: 18, fontFamily: Fb, textAlign: 'left' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: crit > 0 ? C.red : C.amber, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontFamily: Fh }}>!</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 13, color: crit > 0 ? C.red : C.amber }}>
          {data.total} alerte{data.total > 1 ? 's' : ''} active{data.total > 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>
          {crit > 0 && <span><b style={{ color: C.red }}>{crit} critique{crit > 1 ? 's' : ''}</b></span>}
          {crit > 0 && att > 0 && <span> · </span>}
          {att > 0 && <span><b style={{ color: C.amber }}>{att} a surveiller</b></span>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Voir →</div>
    </button>
  )
}

export function AlertesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    fapi('/alertes').then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Chargement...</div>
  if (!data) return null

  const byType = {}
  for (const a of data.alertes) {
    if (!byType[a.type]) byType[a.type] = []
    byType[a.type].push(a)
  }

  const TYPE_LABELS = {
    dalo_retard: 'DALO en retard',
    logement_vacant: 'Logements vacants',
    dossier_inactif: 'Dossiers sans activite',
    dossier_incomplet: 'Dossiers urgents incomplets'
  }

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Alertes intelligentes</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{data.total} alerte{data.total > 1 ? 's' : ''} · {data.par_niveau.critique} critique{data.par_niveau.critique > 1 ? 's' : ''}</p>
        </div>
        <button onClick={load} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Actualiser</button>
      </div>

      {data.alertes.length === 0 && (
        <div style={{ background: C.greenBg, borderRadius: 12, padding: 40, textAlign: 'center', border: '1px solid ' + C.green + '44', color: C.green, fontFamily: Fh, fontSize: 15, fontWeight: 700 }}>
          Aucune alerte active. Tout va bien.
        </div>
      )}

      {Object.entries(byType).map(([type, alertes]) => (
        <div key={type} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {TYPE_LABELS[type] || type} ({alertes.length})
          </div>
          {alertes.map((a, i) => (
            <div key={i} style={{ background: C.card, borderRadius: 11, padding: '12px 16px', border: '1px solid ' + C.border, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, borderLeft: '4px solid ' + (a.niveau === 'critique' ? C.red : C.amber) }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.text, fontFamily: Fh }}>{a.titre} - {a.sujet}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{a.message}</div>
              </div>
              <span style={{ fontSize: 10.5, padding: '3px 10px', borderRadius: 99, fontWeight: 700, textTransform: 'uppercase', background: a.niveau === 'critique' ? C.redBg : C.amberBg, color: a.niveau === 'critique' ? C.red : C.amber }}>
                {a.niveau}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ===========================================================
// CALENDRIER CAL
// ===========================================================

const MOIS_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
const JOURS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export function CalendrierPage({ toast }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => new Date())
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', titre: '', type: 'cal', lieu: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fapi('/agenda').then(setEvents).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = (firstDay.getDay() + 6) % 7 // lundi = 0
  const daysInMonth = lastDay.getDate()

  // Map date -> events
  const byDate = useMemo(() => {
    const m = {}
    for (const e of events) {
      if (!m[e.date]) m[e.date] = []
      m[e.date].push(e)
    }
    return m
  }, [events])

  // Evenements du mois affiche
  const monthEvents = useMemo(() => {
    return events.filter(e => {
      const d = new Date(e.iso)
      return d.getMonth() === month && d.getFullYear() === year
    }).sort((a, b) => a.iso.localeCompare(b.iso))
  }, [events, month, year])

  const submitEvent = async () => {
    if (!form.date || !form.titre) return toast && toast('Date et titre obligatoires', 'error')
    setSaving(true)
    try {
      await fapi('/agenda', { method: 'POST', body: form })
      toast && toast('Evenement ajoute au calendrier', 'success')
      setShowForm(false)
      setForm({ date: '', titre: '', type: 'cal', lieu: '', description: '' })
      load()
    } catch (e) { toast && toast('Erreur : ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const str = String(d).padStart(2, '0') + '/' + String(month + 1).padStart(2, '0') + '/' + year
    cells.push({ day: d, str, events: byDate[str] || [] })
  }

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Calendrier CAL</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>Commissions, audiences et evenements</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid ' + C.border, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 13, fontWeight: 700 }}>‹</button>
          <div style={{ fontFamily: Fh, fontSize: 14, fontWeight: 700, color: C.text, minWidth: 180, textAlign: 'center' }}>{MOIS_FR[month]} {year}</div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid ' + C.border, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 13, fontWeight: 700 }}>›</button>
          <button onClick={() => setCursor(new Date())} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid ' + C.border, background: C.bg, cursor: 'pointer', fontFamily: Fh, fontSize: 11, fontWeight: 600, color: C.muted, marginLeft: 8 }}>Aujourd hui</button>
          <button onClick={() => setShowForm(true)} style={{ marginLeft: 8, padding: '8px 14px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>+ Evenement</button>
        </div>
      </div>

      {loading ? <div style={{ padding: 30, color: C.muted, textAlign: 'center' }}>Chargement...</div> : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 560px', background: C.card, borderRadius: 12, padding: 14, border: '1px solid ' + C.border }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
              {JOURS_FR.map(j => (
                <div key={j} style={{ fontFamily: Fh, fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', padding: '6px 4px', textAlign: 'center' }}>{j}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((c, i) => {
                const today = new Date()
                const isToday = c && c.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                return (
                  <div key={i} style={{ minHeight: 76, background: c ? (isToday ? C.accentL : C.bg) : 'transparent', borderRadius: 7, padding: 6, border: isToday ? '1.5px solid ' + C.accent : '1px solid ' + (c ? C.border : 'transparent') }}>
                    {c && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? C.accent : C.text, fontFamily: Fh, marginBottom: 3 }}>{c.day}</div>
                        {c.events.slice(0, 3).map(ev => (
                          <div key={ev.id} title={ev.titre + ' - ' + (ev.sous_titre || '')}
                            style={{ fontSize: 9.5, padding: '2px 4px', borderRadius: 3, background: ev.couleur, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.titre}
                          </div>
                        ))}
                        {c.events.length > 3 && (
                          <div style={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>+ {c.events.length - 3}</div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ flex: '1 1 260px', minWidth: 250 }}>
            <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Evenements du mois ({monthEvents.length})
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {monthEvents.length === 0 ? (
                <div style={{ padding: 16, color: C.muted, fontSize: 12.5, textAlign: 'center', background: C.card, borderRadius: 8 }}>Aucun evenement ce mois.</div>
              ) : monthEvents.map(ev => (
                <div key={ev.id} style={{ background: C.card, borderRadius: 9, padding: '10px 12px', border: '1px solid ' + C.border, marginBottom: 7, borderLeft: '3px solid ' + ev.couleur }}>
                  <div style={{ fontSize: 10, color: C.muted }}>{ev.date}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, fontFamily: Fh }}>{ev.titre}</div>
                  {ev.sous_titre && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{ev.sous_titre}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <LModal title="Ajouter un evenement au calendrier" onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Date (JJ/MM/AAAA) *</label>
              <input style={inp} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} placeholder="JJ/MM/AAAA" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Type</label>
              <select style={inp} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="cal">Commission CAL</option>
                <option value="reunion">Reunion</option>
                <option value="rdv">Rendez-vous</option>
                <option value="visite">Visite logement</option>
                <option value="evenement">Autre evenement</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Titre *</label>
              <input style={inp} value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="ex: CAL mensuelle n-12" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Lieu</label>
              <input style={inp} value={form.lieu} onChange={e => setForm(p => ({ ...p, lieu: e.target.value }))} placeholder="ex: Hotel de Ville - salle du conseil" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 5 }}>Description</label>
              <textarea rows={3} style={{ ...inp, minHeight: 64, fontFamily: Fb }} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
            <button onClick={submitEvent} disabled={saving} style={{ padding: '9px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </LModal>
      )}
    </div>
  )
}

// ===========================================================
// CARTE TERRITOIRE
// Carte SVG schematique de Saint-Denis + densite par quartier
// ===========================================================

export function CartePage() {
  const [dem, setDem] = useState([])
  const [log, setLog] = useState([])
  const [ref, setRef] = useState({})
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('demandes') // demandes | logements | pressions

  useEffect(() => {
    Promise.all([fapi('/demandeurs'), fapi('/logements'), fapi('/referentiels')])
      .then(([d, l, r]) => { setDem(d || []); setLog(l || []); setRef(r || {}) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Stats par quartier
  const statsQuartiers = useMemo(() => {
    const quartiers = (ref.quartiers || [])
    return quartiers.map(q => {
      const nbDemandes = dem.filter(d => d.statut === 'active' && (d.quartiers || []).includes(q)).length
      const nbLogements = log.filter(l => (!l.statut || l.statut === 'vacant') && l.quartier === q).length
      const pression = nbLogements > 0 ? Math.round(nbDemandes / nbLogements * 10) / 10 : nbDemandes > 0 ? 99 : 0
      return { quartier: q, nbDemandes, nbLogements, pression }
    }).sort((a, b) => (mode === 'demandes' ? b.nbDemandes - a.nbDemandes : mode === 'logements' ? b.nbLogements - a.nbLogements : b.pression - a.pression))
  }, [dem, log, ref, mode])

  const maxVal = useMemo(() => {
    if (mode === 'demandes') return Math.max(1, ...statsQuartiers.map(s => s.nbDemandes))
    if (mode === 'logements') return Math.max(1, ...statsQuartiers.map(s => s.nbLogements))
    return Math.max(1, ...statsQuartiers.map(s => s.pression === 99 ? 0 : s.pression))
  }, [statsQuartiers, mode])

  const colorFor = (val) => {
    const ratio = val / maxVal
    if (mode === 'logements') {
      // plus c est grand, plus c est vert (offre)
      return ratio >= 0.8 ? C.green : ratio >= 0.5 ? C.teal : ratio >= 0.2 ? C.blue : C.border
    }
    // demandes / pression : plus c est grand plus c est rouge
    return ratio >= 0.8 ? C.red : ratio >= 0.5 ? C.amber : ratio >= 0.2 ? C.accent : ratio > 0 ? C.blue : C.border
  }

  if (loading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Chargement...</div>

  // Layout des quartiers en grille geographique approximative (Saint-Denis)
  // (disposition visuelle simplifiee)
  const totalQ = statsQuartiers.length

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Carte du territoire</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{totalQ} quartiers · pression demandes / offre</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 9, padding: 3 }}>
          {[
            { id: 'demandes', label: 'Demandes' },
            { id: 'logements', label: 'Offre' },
            { id: 'pressions', label: 'Pression' }
          ].map(t => (
            <button key={t.id} onClick={() => setMode(t.id)}
              style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: mode === t.id ? 700 : 500, background: mode === t.id ? C.card : 'transparent', color: mode === t.id ? C.text : C.muted }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 520px', background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, minHeight: 480 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>
            {mode === 'demandes' ? 'Nombre de demandeurs par quartier' : mode === 'logements' ? "Nombre de logements vacants" : 'Indice de pression (demandes / logement)'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {statsQuartiers.map(s => {
              const val = mode === 'demandes' ? s.nbDemandes : mode === 'logements' ? s.nbLogements : s.pression
              const col = colorFor(val)
              return (
                <div key={s.quartier} style={{ background: col, borderRadius: 9, padding: '12px 14px', color: '#fff', minHeight: 78, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{s.quartier}</div>
                  <div>
                    <div style={{ fontSize: 22, fontFamily: Fh, fontWeight: 800 }}>
                      {mode === 'pressions' ? (s.pression === 99 ? '∞' : s.pression) : val}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>
                      {mode === 'demandes' ? 'dossiers' : mode === 'logements' ? 'logements' : 'dem/log'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: C.muted }}>
            <span style={{ fontWeight: 600 }}>Legende :</span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: C.red, color: '#fff', fontWeight: 700 }}>Tres fort</span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: C.amber, color: '#fff', fontWeight: 700 }}>Fort</span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: C.accent, color: '#fff', fontWeight: 700 }}>Moyen</span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: C.blue, color: '#fff', fontWeight: 700 }}>Faible</span>
            <span style={{ padding: '2px 8px', borderRadius: 99, background: C.border, color: C.muted, fontWeight: 700 }}>Aucun</span>
          </div>
        </div>

        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div style={{ fontFamily: Fh, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Top quartiers
          </div>
          <div style={{ maxHeight: 510, overflowY: 'auto' }}>
            {statsQuartiers.slice(0, 20).map(s => {
              const val = mode === 'demandes' ? s.nbDemandes : mode === 'logements' ? s.nbLogements : s.pression
              return (
                <div key={s.quartier} style={{ background: C.card, borderRadius: 9, padding: '9px 12px', border: '1px solid ' + C.border, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 28, borderRadius: 3, background: colorFor(val) }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: Fh }}>{s.quartier}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{s.nbDemandes} dem. · {s.nbLogements} log.</div>
                  </div>
                  <div style={{ fontFamily: Fh, fontSize: 16, fontWeight: 800, color: colorFor(val) }}>
                    {mode === 'pressions' ? (s.pression === 99 ? '∞' : s.pression) : val}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// FICHE ELU ENRICHIE (audiences + migration + parcours candidats)
// ===========================================================

// ============================================================
// TELEGRAM CONNECT - QR + lien + statut pour elu
// ============================================================

function TelegramConnect({ elu_id, elu_nom }) {
  const [statut, setStatut] = useState(null)
  const [lienData, setLienData] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const pollRef = useRef(null)

  const loadStatut = useCallback(() => {
    fapi('/telegram/statut/elu/' + elu_id).then(setStatut).catch(() => {})
  }, [elu_id])

  useEffect(() => { loadStatut() }, [loadStatut])

  useEffect(() => {
    if (!showModal) { if (pollRef.current) clearInterval(pollRef.current); return }
    pollRef.current = setInterval(loadStatut, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [showModal, loadStatut])

  const openModal = async () => {
    setShowModal(true)
    if (!lienData) {
      try {
        const d = await fapi('/telegram/lien-elu/' + elu_id)
        setLienData(d)
      } catch (e) {
        setLienData({ error: e.message })
      }
    }
  }

  const copyLien = () => {
    if (!lienData || !lienData.lien) return
    navigator.clipboard.writeText(lienData.lien).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const sendTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await fapi('/telegram/test/' + elu_id, { method: 'POST' })
      setTestResult(r && r.ok ? 'ok' : 'fail')
    } catch (e) {
      setTestResult('fail')
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 3500)
    }
  }

  const connecte = statut && statut.connecte

  return (
    <>
      <button
        onClick={openModal}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
          fontFamily: Fh, fontSize: 12, fontWeight: 700,
          background: connecte ? C.greenBg : C.blueBg,
          color: connecte ? C.green : C.blue,
          border: '1px solid ' + (connecte ? C.green : C.blue)
        }}
        title={connecte ? 'Telegram active - cliquer pour voir le QR ou retester' : 'Activer les notifications Telegram'}
      >
        <span style={{ fontSize: 14 }}>{connecte ? 'OK' : 'TG'}</span>
        Telegram {connecte ? 'actif' : 'a activer'}
      </button>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: 24,
              maxWidth: 440, width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
              fontFamily: Fb
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 18, color: C.text, letterSpacing: '-0.02em' }}>
                  Notifications Telegram
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{elu_nom}</div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.muted, lineHeight: 1 }}
              >X</button>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 9, marginBottom: 16,
              background: connecte ? C.greenBg : C.amberBg,
              color: connecte ? C.green : C.amber,
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ fontSize: 16 }}>{connecte ? 'OK' : '...'}</span>
              {connecte
                ? 'Connecte - chat_id ' + statut.chat_id
                : 'En attente de connexion - scannez le QR ou envoyez le lien'}
            </div>

            {!lienData && (
              <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>
                Chargement du lien...
              </div>
            )}

            {lienData && lienData.error && (
              <div style={{ padding: 14, background: C.redBg, color: C.red, borderRadius: 8, fontSize: 13 }}>
                Erreur : {lienData.error}
              </div>
            )}

            {lienData && lienData.qr && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <img
                    src={lienData.qr}
                    alt="QR code Telegram"
                    style={{ width: 180, height: 180, borderRadius: 10, border: '1px solid ' + C.border, background: '#fff' }}
                  />
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                    Scanner avec l'appareil photo du telephone
                  </div>
                </div>

                <div style={{ background: C.bg, borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.text, flex: 1, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {lienData.lien}
                  </span>
                  <button
                    onClick={copyLien}
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid ' + C.border,
                      background: copied ? C.green : '#fff', color: copied ? '#fff' : C.text,
                      fontFamily: Fh, fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0
                    }}
                  >
                    {copied ? 'copie' : 'Copier'}
                  </button>
                </div>

                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginBottom: 14 }}>
                  <b style={{ color: C.text }}>Comment ca marche :</b><br/>
                  1. L'elu scanne le QR (ou clique le lien envoye par SMS).<br/>
                  2. Telegram s'ouvre. Il appuie sur <b>Start</b>.<br/>
                  3. Le statut passe automatiquement en <b>Connecte</b> sur cette page.
                </div>

                {connecte && (
                  <button
                    onClick={sendTest}
                    disabled={testing}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: 'none', background: C.navy, color: '#fff',
                      fontFamily: Fh, fontWeight: 700, fontSize: 13,
                      cursor: testing ? 'wait' : 'pointer', opacity: testing ? 0.7 : 1
                    }}
                  >
                    {testing ? 'Envoi en cours...' : 'Envoyer un message de test'}
                  </button>
                )}

                {testResult === 'ok' && (
                  <div style={{ marginTop: 10, padding: 8, background: C.greenBg, color: C.green, borderRadius: 6, fontSize: 12, textAlign: 'center', fontWeight: 700 }}>
                    Message envoye - verifiez le telephone
                  </div>
                )}
                {testResult === 'fail' && (
                  <div style={{ marginTop: 10, padding: 8, background: C.redBg, color: C.red, borderRadius: 6, fontSize: 12, textAlign: 'center', fontWeight: 700 }}>
                    Echec de l'envoi
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function FicheEluPage({ elu_id, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fapi('/elus/' + elu_id + '/full').then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [elu_id])

  if (loading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Chargement...</div>
  if (!data) return null
  const e = data.elu

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <button onClick={onBack} style={{ marginBottom: 16, padding: '6px 12px', background: 'transparent', border: '1px solid ' + C.border, borderRadius: 7, cursor: 'pointer', fontFamily: Fh, fontSize: 12, color: C.muted }}>
        ← Retour a la liste
      </button>

      <div style={{ background: C.purple, borderRadius: 13, padding: '20px 24px', color: '#fff', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 60, height: 60, background: 'rgba(255,255,255,0.2)', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, fontFamily: Fh, flexShrink: 0 }}>
          {e.prenom ? e.prenom[0] : ''}{e.nom ? e.nom[0] : ''}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>{e.prenom || ''} {e.nom}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>Secteur {e.secteur}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', fontSize: 12 }}>
            {e.telephone && (
              <a href={'tel:' + e.telephone.replace(/\s/g, '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                📞 {e.telephone}
              </a>
            )}
            {e.email && (
              <a href={'mailto:' + e.email} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                ✉ {e.email}
              </a>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: Fh }}>{data.stats.nb_audiences}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>audiences</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <TelegramConnect elu_id={e.id} elu_nom={(e.prenom || '') + ' ' + e.nom} />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { l: 'Audiences', v: data.stats.nb_audiences, c: C.purple },
          { l: 'Favorables', v: data.stats.nb_favorables, c: C.blue },
          { l: 'Attributions', v: data.stats.nb_attribues, c: C.green },
          { l: 'En cours', v: data.stats.nb_en_cours, c: C.amber }
        ].map((k, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 11, padding: '12px 18px', border: '1px solid ' + C.border, flex: '1 1 110px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c, fontFamily: Fh }}>{k.v}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      {data.migrations.length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, marginBottom: 18 }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>
            Migrations territoriales ({data.migrations.length})
          </div>
          {data.migrations.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < data.migrations.length - 1 ? '1px solid ' + C.border : 'none' }}>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{m.demandeur}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.bg, color: C.muted, fontWeight: 600 }}>{m.de}</span>
              <span style={{ color: C.muted }}>→</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.greenBg, color: C.green, fontWeight: 600 }}>{m.vers}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>{m.date}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', background: C.navy, color: '#fff', fontFamily: Fh, fontWeight: 700, fontSize: 13 }}>
          Personnes recues en audience · parcours actuel
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                {['Date', 'Candidat', 'Situation', 'Statut actuel', 'Derniere CAL', 'Favorable'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.details.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: C.muted }}>Aucune audience enregistree.</td></tr>
              ) : data.details.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid ' + C.border }}>
                  <td style={{ padding: '10px 12px', color: C.muted, whiteSpace: 'nowrap' }}>{d.audience.date_audience}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, color: C.text, fontFamily: Fh }}>{d.demandeur ? d.demandeur.nom + ' ' + d.demandeur.prenom : '?'}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{d.demandeur ? d.demandeur.nud || '---' : ''}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {d.demandeur && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {d.demandeur.dalo && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>DALO</span>}
                        {d.demandeur.violences && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>VIF</span>}
                        {d.demandeur.sans_log && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>SDF</span>}
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: C.bg, color: C.muted, fontWeight: 600 }}>{d.demandeur.typ_v}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, fontWeight: 700, background: d.attribue ? C.greenBg : C.amberBg, color: d.attribue ? C.green : C.amber }}>
                      {d.attribue ? 'Attribue' : d.demandeur && d.demandeur.statut === 'active' ? 'En cours' : d.demandeur ? d.demandeur.statut : '?'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 11, color: C.muted }}>
                    {d.derniere_decision ? (
                      <>
                        <div>{d.derniere_decision.date}</div>
                        <div style={{ color: C.text, fontWeight: 600 }}>{d.derniere_decision.decision}</div>
                      </>
                    ) : '---'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: d.audience.favorable ? C.green : C.muted, fontWeight: 600, fontSize: 12 }}>
                      {d.audience.favorable ? 'Oui' : 'Non'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// REGLES DE SCORING (visible et editable)
// ===========================================================

export function ScoringReglesPage({ isDirecteur, toast }) {
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fapi('/scoring-rules').then(r => { setRules(r); setDraft(JSON.parse(JSON.stringify(r))) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const save = async () => {
    if (!motif.trim()) return toast && toast('Motif de modification obligatoire', 'error')
    setSaving(true)
    try {
      await fapi('/scoring-rules', { method: 'PUT', body: { ...draft, __motif: motif.trim() } })
      toast && toast('Regles de scoring mises a jour', 'success')
      setEditing(false); setMotif('')
      load()
    } catch (e) { toast && toast('Erreur : ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Chargement...</div>
  if (!rules) return null

  const totalMax = (editing ? draft : rules).criteres.reduce((s, c) => s + (parseInt(c.poids_max) || 0), 0)

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Regles de scoring</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>Transparence des criteres d attribution - total max {totalMax} pts</p>
        </div>
        {isDirecteur && (
          editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setEditing(false); setDraft(JSON.parse(JSON.stringify(rules))); setMotif('') }} style={{ padding: '8px 14px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
              <button onClick={save} disabled={saving} style={{ padding: '8px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{saving ? '...' : 'Enregistrer'}</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} style={{ padding: '9px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Modifier les regles</button>
          )
        )}
      </div>

      <div style={{ background: C.bg, borderRadius: 11, padding: '14px 18px', marginBottom: 20, border: '1px solid ' + C.border, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
        <b>Comment ca marche :</b> pour chaque candidat, le moteur calcule un score sur {totalMax} points
        a partir de 8 criteres objectifs. Un systeme anti-biais ajoute des bonus/malus pour eviter qu un meme
        dossier soit toujours mis en avant ou toujours ignore. Toute modification des regles est tracee et
        exige un motif documente.
      </div>

      {editing && (
        <div style={{ background: C.amberBg, borderRadius: 9, padding: '10px 14px', marginBottom: 18, border: '1px solid ' + C.amber + '33' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            Motif de modification * (obligatoire)
          </label>
          <input style={inp} value={motif} onChange={e => setMotif(e.target.value)} placeholder="ex: Ajustement post-CAL Q1 2026 - priorite DALO renforcee" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>
        {(editing ? draft : rules).criteres.map((c, idx) => (
          <div key={c.id} style={{ background: C.card, borderRadius: 11, padding: '14px 16px', border: '1px solid ' + C.border }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontFamily: Fh, fontSize: 13, fontWeight: 700, color: C.text }}>{c.label}</div>
              {editing ? (
                <input type="number" value={c.poids_max} style={{ ...inp, width: 60, textAlign: 'center', padding: '4px 6px' }}
                  onChange={e => {
                    const v = e.target.value
                    setDraft(p => ({ ...p, criteres: p.criteres.map((x, i) => i === idx ? { ...x, poids_max: v } : x) }))
                  }} />
              ) : (
                <span style={{ fontFamily: Fh, fontSize: 16, fontWeight: 800, color: C.accent }}>{c.poids_max}</span>
              )}
            </div>
            {editing ? (
              <textarea rows={3} value={c.desc} style={{ ...inp, minHeight: 50, fontFamily: Fb, fontSize: 12 }}
                onChange={e => {
                  const v = e.target.value
                  setDraft(p => ({ ...p, criteres: p.criteres.map((x, i) => i === idx ? { ...x, desc: v } : x) }))
                }} />
            ) : (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{c.desc}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, flex: '1 1 320px' }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 12 }}>Critere d exclusion immediate</div>
          {(editing ? draft : rules).exclusions.map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < rules.exclusions.length - 1 ? '1px solid ' + C.border : 'none' }}>
              <span style={{ color: C.red, fontWeight: 800 }}>✕</span>
              {editing ? (
                <input style={{ ...inp, flex: 1 }} value={x} onChange={e => {
                  const v = e.target.value
                  setDraft(p => ({ ...p, exclusions: p.exclusions.map((y, j) => j === i ? v : y) }))
                }} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.text }}>{x}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, flex: '1 1 320px' }}>
          <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.purple, marginBottom: 12 }}>Correction anti-biais (bonus/malus)</div>
          {(editing ? draft : rules).anti_biais.map((b, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < rules.anti_biais.length - 1 ? '1px solid ' + C.border : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {editing ? (
                  <input style={{ ...inp, flex: 1, marginRight: 8 }} value={b.label} onChange={e => {
                    const v = e.target.value
                    setDraft(p => ({ ...p, anti_biais: p.anti_biais.map((y, j) => j === i ? { ...y, label: v } : y) }))
                  }} />
                ) : (
                  <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{b.label}</span>
                )}
                {editing ? (
                  <input style={{ ...inp, width: 80 }} value={b.effet} onChange={e => {
                    const v = e.target.value
                    setDraft(p => ({ ...p, anti_biais: p.anti_biais.map((y, j) => j === i ? { ...y, effet: v } : y) }))
                  }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 800, color: b.effet.startsWith('-') ? C.red : C.green, fontFamily: Fh }}>{b.effet}</span>
                )}
              </div>
              {!editing && b.desc && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{b.desc}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
