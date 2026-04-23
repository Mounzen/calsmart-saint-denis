
import { useState, useEffect } from 'react'
import { apiFetch } from './Auth.jsx'

const C = {
  accent: '#E05C2A', accentL: 'rgba(224,92,42,0.10)',
  bg: '#EEF1F6', card: '#FFFFFF', text: '#0B1E3D', muted: '#5B6B85',
  border: '#DDE3EE', green: '#16A34A', greenBg: '#DCFCE7',
  amber: '#D97706', amberBg: '#FEF3C7', red: '#DC2626', redBg: '#FEE2E2',
  purple: '#7C3AED', purpleBg: '#EDE9FE', navy: '#0B1E3D',
  blue: '#1D6FA8', blueBg: '#DBEAFE', teal: '#0D9488'
}
const Fh = "'Syne',sans-serif"
const Fb = "'DM Sans',sans-serif"

function Bar({ val, max, color }) {
  return (
    <div style={{ flex: 1, height: 8, background: '#EEF1F6', borderRadius: 99 }}>
      <div style={{ height: '100%', width: Math.min(100, val / max * 100) + '%', background: color || C.accent, borderRadius: 99, transition: 'width 0.4s' }} />
    </div>
  )
}

function KPI({ label, val, color, sub }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, flex: '1 1 130px' }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || C.accent, fontFamily: Fh, letterSpacing: '-0.04em' }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function Statistiques() {
  const [dem, setDem] = useState([])
  const [log, setLog] = useState([])
  const [aud, setAud] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('general')

  useEffect(() => {
    Promise.all([
      apiFetch('/demandeurs').catch(() => []),
      apiFetch('/logements').catch(() => []),
      apiFetch('/audiences').catch(() => [])
    ]).then(([d, l, a]) => {
      setDem(Array.isArray(d) ? d : [])
      setLog(Array.isArray(l) ? l : [])
      setAud(Array.isArray(a) ? a : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, color: C.muted, fontFamily: Fb, fontSize: 13 }}>
        Chargement...
      </div>
    )
  }

  const actifs = dem.filter(d => d.statut === 'active')
  const attribues = aud.filter(a => a.statut === 'Attribue')
  const favorables = aud.filter(a => a.favorable)
  const urgents = actifs.filter(d => d.dalo || d.sans_log || d.violences || d.prio_expulsion)
  const incomplets = actifs.filter(d => !d.pieces)

  const parTyp = ['T1', 'T2', 'T3', 'T4', 'T5'].map(t => ({ t, n: actifs.filter(d => d.typ_v === t).length }))
  const maxTyp = Math.max(1, ...parTyp.map(x => x.n))

  const parQuartier = {}
  actifs.forEach(d => { (d.quartiers || []).forEach(q => { parQuartier[q] = (parQuartier[q] || 0) + 1 }) })
  const qSorted = Object.entries(parQuartier).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxQ = Math.max(1, ...qSorted.map(x => x[1]))

  const tauxAttrib = aud.length ? Math.round(attribues.length / aud.length * 100) : 0
  const tauxFav = aud.length ? Math.round(favorables.length / aud.length * 100) : 0
  const daloActifs = actifs.filter(d => d.dalo).length
  const tauxDalo = attribues.length ? Math.round(attribues.filter(a => { const d = dem.find(x => x.id === a.dem_id); return d && d.dalo }).length / attribues.length * 100) : 0

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'typologies', label: 'Typologies' },
    { id: 'urgences', label: 'Urgences' },
    { id: 'compliance', label: 'Compliance' }
  ]

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Statistiques</h1>
      <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 20 }}>Analyse en temps reel</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: C.bg, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: tab === t.id ? 700 : 500, background: tab === t.id ? C.card : 'transparent', color: tab === t.id ? C.text : C.muted, boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* General */}
      {tab === 'general' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <KPI label="Demandeurs actifs" val={actifs.length} color={C.accent} />
            <KPI label="Logements vacants" val={log.length} color={C.blue} />
            <KPI label="Audiences enregistrees" val={aud.length} color={C.purple} />
            <KPI label="Attributions" val={attribues.length} color={C.green} sub={tauxAttrib + '% de taux'} />
            <KPI label="Audiences favorables" val={favorables.length} color={C.teal} sub={tauxFav + '% du total'} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Pression par quartier</div>
              {qSorted.map(([q, n]) => (
                <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, color: C.text, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{q}</span>
                  <Bar val={n} max={maxQ} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: Fh, width: 20, textAlign: 'right', flexShrink: 0 }}>{n}</span>
                </div>
              ))}
              {qSorted.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Aucune donnee</div>}
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Entonnoir attribution</div>
              {[
                { l: 'Demandeurs actifs', v: actifs.length, c: C.accent },
                { l: 'Audiences enregistrees', v: aud.length, c: C.purple },
                { l: 'Favorables', v: favorables.length, c: C.blue },
                { l: 'Attribues', v: attribues.length, c: C.green }
              ].map((s, i) => {
                const max = actifs.length || 1
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: C.text }}>{s.l}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.c, fontFamily: Fh }}>{s.v}</span>
                    </div>
                    <div style={{ height: 7, background: '#EEF1F6', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: (s.v / max * 100) + '%', background: s.c, borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Typologies */}
      {tab === 'typologies' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
            <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Demandes par typologie</div>
            {parTyp.map(({ t, n }) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: Fh, fontWeight: 800, fontSize: 14, color: C.text, width: 30, flexShrink: 0 }}>{t}</span>
                <Bar val={n} max={maxTyp} color={n / maxTyp >= 0.8 ? C.red : n / maxTyp >= 0.5 ? C.amber : C.green} />
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: Fh, width: 30, textAlign: 'right', flexShrink: 0 }}>{n}</span>
                <span style={{ fontSize: 11, color: C.muted, width: 35, flexShrink: 0 }}>{actifs.length ? Math.round(n / actifs.length * 100) : 0}%</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: 1 }}>
            <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Logements disponibles par typ.</div>
            {['T1', 'T2', 'T3', 'T4', 'T5'].map(t => {
              const nb = log.filter(l => l.typ === t).length
              const demand = actifs.filter(d => d.typ_v === t).length
              const ratio = nb > 0 ? (demand / nb).toFixed(1) : '---'
              return (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: Fh, fontWeight: 800, fontSize: 14, color: C.text, width: 30, flexShrink: 0 }}>{t}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>Dispo: {nb} | Demandes: {demand}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: parseFloat(ratio) >= 5 ? C.red : parseFloat(ratio) >= 3 ? C.amber : C.green }}>{ratio === '---' ? '---' : ratio + ':1'}</span>
                    </div>
                    <div style={{ height: 5, background: '#EEF1F6', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: Math.min(100, demand / Math.max(1, demand + nb) * 100) + '%', background: parseFloat(ratio) >= 5 ? C.red : parseFloat(ratio) >= 3 ? C.amber : C.green, borderRadius: 99 }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Urgences */}
      {tab === 'urgences' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flex: '1 1 300px' }}>
            <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Situations prioritaires</div>
            {[
              { l: 'DALO reconnu', v: actifs.filter(d => d.dalo).length, c: C.red },
              { l: 'Sans logement', v: actifs.filter(d => d.sans_log).length, c: C.red },
              { l: 'Violences conjugales', v: actifs.filter(d => d.violences).length, c: C.red },
              { l: 'Expulsion imminente', v: actifs.filter(d => d.prio_expulsion).length, c: C.amber },
              { l: 'Suroccupation', v: actifs.filter(d => d.suroc).length, c: C.amber },
              { l: 'Handicap - PMR', v: actifs.filter(d => d.handicap).length, c: C.purple },
              { l: 'Grossesse', v: actifs.filter(d => d.grossesse).length, c: C.blue },
              { l: 'Dossier incomplet', v: incomplets.length, c: C.muted }
            ].map((s, i) => {
              const max = actifs.length || 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontSize: 12, color: C.text, width: 160, flexShrink: 0 }}>{s.l}</span>
                  <Bar val={s.v} max={max} color={s.c} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: s.c, fontFamily: Fh, width: 24, textAlign: 'right', flexShrink: 0 }}>{s.v}</span>
                </div>
              )
            })}
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ background: C.redBg, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.red + '44', marginBottom: 14 }}>
              <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 22, color: C.red }}>{urgents.length}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>dossiers urgents au total</div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: 18, border: '1px solid ' + C.border }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Urgents sans audience</div>
              {actifs.filter(d => (d.dalo || d.sans_log || d.violences) && !aud.some(a => a.dem_id === d.id)).slice(0, 6).map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, padding: '7px 10px', borderRadius: 8, background: C.bg }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{d.nom} {d.prenom}</div>
                    <div style={{ fontSize: 10.5, color: C.muted }}>{d.anc} mois - {d.compo}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {d.dalo && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>DALO</span>}
                    {d.violences && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>VIF</span>}
                    {d.sans_log && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: C.redBg, color: C.red, fontWeight: 700 }}>SDF</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Compliance */}
      {tab === 'compliance' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ background: tauxDalo >= 25 ? C.greenBg : C.redBg, borderRadius: 12, padding: '20px 24px', border: '1px solid ' + (tauxDalo >= 25 ? C.green : C.red) + '44', marginBottom: 16 }}>
              <div style={{ fontFamily: Fh, fontWeight: 900, fontSize: 36, color: tauxDalo >= 25 ? C.green : C.red }}>{tauxDalo}%</div>
              <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 14, color: tauxDalo >= 25 ? C.green : C.red, marginBottom: 4 }}>
                Compliance DALO - {tauxDalo >= 25 ? 'CONFORME' : 'EN DESSOUS DU SEUIL'}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted }}>Objectif legal: minimum 25% des attributions en DALO</div>
              <div style={{ marginTop: 14, height: 8, background: 'rgba(255,255,255,0.4)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: Math.min(100, tauxDalo) + '%', background: tauxDalo >= 25 ? C.green : C.red, borderRadius: 99 }} />
              </div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Indicateurs legaux</div>
              {[
                { l: 'Dossiers DALO actifs', v: daloActifs, c: C.red, note: 'Demandeurs DALO reconnus en attente' },
                { l: 'Attributions DALO', v: attribues.filter(a => { const d = dem.find(x => x.id === a.dem_id); return d && d.dalo }).length, c: C.green, note: 'Sur total ' + attribues.length + ' attributions' },
                { l: 'Taux attribution global', v: tauxAttrib + '%', c: tauxAttrib >= 30 ? C.green : C.amber, note: 'Audiences avec attribution' }
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: i < 2 ? '1px solid ' + C.border : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.l}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{s.note}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.c, fontFamily: Fh, flexShrink: 0 }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: '1px solid ' + C.border, marginBottom: 14 }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 14 }}>Repartition par contingent</div>
              {['Ville', 'Prefecture', 'Action Logement', 'Bailleur'].map(cont => {
                const nb = log.filter(l => l.contingent === cont).length
                return (
                  <div key={cont} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: C.text, width: 140, flexShrink: 0 }}>{cont}</span>
                    <Bar val={nb} max={Math.max(1, log.length)} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: Fh, width: 20, textAlign: 'right', flexShrink: 0 }}>{nb}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ background: C.navy, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontFamily: Fh, fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Points de vigilance</div>
              {[
                tauxDalo < 25 && { txt: 'Taux DALO insuffisant (' + tauxDalo + '% < 25%)', c: C.red },
                urgents.length > 10 && { txt: urgents.length + ' dossiers urgents sans attribution', c: C.amber },
                incomplets.length > 0 && { txt: incomplets.length + ' dossiers incomplets', c: C.amber },
                tauxAttrib < 20 && { txt: 'Taux attribution faible (' + tauxAttrib + '%)', c: C.amber }
              ].filter(Boolean).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: p.c, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>!</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{p.txt}</span>
                </div>
              ))}
              {tauxDalo >= 25 && urgents.length <= 10 && incomplets.length === 0 && (
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Aucun point critique - Situation correcte</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}