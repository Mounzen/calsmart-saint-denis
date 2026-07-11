import { useState, useRef } from 'react'
import { apiFetch } from './Auth.jsx'

const C = {
  accent: '#E05C2A', accentL: 'rgba(224,92,42,0.10)',
  bg: '#EEF1F6', card: '#FFFFFF', text: '#0B1E3D', muted: '#5B6B85',
  border: '#DDE3EE', green: '#16A34A', greenBg: '#DCFCE7',
  amber: '#D97706', amberBg: '#FEF3C7', red: '#DC2626', redBg: '#FEE2E2',
  navy: '#0B1E3D'
}
const Fh = "'Syne',sans-serif"
const Fb = "'DM Sans',sans-serif"

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if ((ch === ';' || ch === ',') && !inQuote) {
      cols.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cols.push(current.trim())
  return cols
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const cols = parseCSVLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h.toLowerCase().trim()] = (cols[i] || '').trim() })
    return row
  }).filter(row => Object.values(row).some(v => v))
}

// Map Pelehas CSV columns to CAL Smart fields
function mapDemandeur(row) {
  const nom = row['nom'] || row['name'] || row['nom_famille'] || ''
  const prenom = row['prenom'] || row['firstname'] || row['prenoms'] || ''
  const nud = row['nud'] || row['numero_unique'] || row['n_unique'] || ''

  return {
    nom: nom.toUpperCase(),
    prenom: prenom,
    nud: nud,
    anc: parseInt(row['anciennete'] || row['anc'] || '0') || 0,
    adultes: parseInt(row['adultes'] || row['nb_adultes'] || '1') || 1,
    enfants: parseInt(row['enfants'] || row['nb_enfants'] || '0') || 0,
    compo: row['composition'] || row['compo'] || '',
    typ_v: row['type_souhaite'] || row['typ'] || row['typologies'] || 'T3',
    rev: parseFloat((row['revenu'] || row['ressources'] || '0').replace(/[^0-9.]/g, '')) || 0,
    sit: row['situation'] || row['sit_logement'] || '',
    quartier_origine: row['quartier'] || row['quartier_actuel'] || '',
    quartiers: row['quartiers_souhaites'] ? row['quartiers_souhaites'].split('/') : [],
    dalo: (row['dalo'] || '').toLowerCase() === 'oui',
    violences: (row['violences'] || row['vif'] || '').toLowerCase() === 'oui',
    handicap: (row['handicap'] || '').toLowerCase() === 'oui',
    sans_log: (row['sans_logement'] || row['sdf'] || '').toLowerCase() === 'oui',
    expulsion: (row['expulsion'] || '').toLowerCase() === 'oui',
    pieces: (row['dossier_complet'] || row['pieces'] || '').toLowerCase() === 'oui',
    pmr: (row['pmr'] || '').toLowerCase() === 'oui',
    rdc: (row['rdc'] || '').toLowerCase() === 'oui',
    urgence: (row['urgence'] || '').toLowerCase() === 'oui',
    suroc: (row['suroccupation'] || row['suroc'] || '').toLowerCase() === 'oui',
    dalo_date: row['date_dalo'] || ''
  }
}

function mapLogement(row) {
  const lhc = parseFloat((row['loyer_hc'] || row['loyer'] || '0').replace(/[^0-9.]/g, '')) || 0
  const ch = parseFloat((row['charges'] || '0').replace(/[^0-9.]/g, '')) || 0
  return {
    ref: row['reference'] || row['ref'] || '',
    bailleur: row['bailleur'] || row['organisme'] || '',
    adresse: row['adresse'] || row['adresse_complete'] || '',
    quartier: row['quartier'] || '',
    secteur: row['secteur'] || '',
    typ: row['type'] || row['typ'] || row['typologie'] || 'T3',
    surface: parseFloat(row['surface'] || '0') || 0,
    loyer_hc: lhc,
    charges: ch,
    loyer: parseFloat((row['loyer_total'] || '0').replace(/[^0-9.]/g, '')) || (lhc + ch),
    plafond: row['plafond'] || 'PLUS',
    contingent: row['contingent'] || 'Ville',
    dispo: row['date_disponibilite'] || row['dispo'] || '',
    pmr: (row['pmr'] || '').toLowerCase() === 'oui',
    rdc: (row['rdc'] || 'oui').toLowerCase() === 'oui',
    asc: (row['ascenseur'] || row['asc'] || '').toLowerCase() === 'oui'
  }
}

function mapAudience(row) {
  return {
    date_audience: row['date'] || row['date_audience'] || '',
    dem_nom: row['nom_demandeur'] || row['dem_nom'] || row['nom'] || '',
    dem_prenom: row['prenom_demandeur'] || row['dem_prenom'] || row['prenom'] || '',
    nud: row['nud'] || '',
    dem_id: row['dem_id'] || 'IMPORT',
    elu_nom: row['elu'] || row['elu_nom'] || row['nom_elu'] || '',
    elu_secteur: row['elu_secteur'] || row['secteur'] || '',
    quartier_origine: row['quartier_origine'] || row['quartier'] || '',
    quartier_souhaite: row['quartier_souhaite'] || '',
    objet: row['objet'] || row['motif'] || '',
    favorable: (row['favorable'] || row['resultat'] || '').toLowerCase() === 'oui',
    suite: row['suite'] || ''
  }
}

export default function ImportPelehas({ onDone }) {
  const [step, setStep] = useState('upload')
  const [type, setType] = useState('demandeurs')
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const TYPES = [
    { id: 'demandeurs', label: 'Demandeurs', desc: 'Fichier Pelehas des demandeurs' },
    { id: 'logements', label: 'Logements', desc: 'Fichier bailleur des logements' },
    { id: 'audiences', label: 'Audiences', desc: 'Fichier des audiences elus' }
  ]

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setError('')
    setRows([])
    setPreview([])

    try {
      const text = await file.text()
      const raw = parseCSV(text)
      if (!raw.length) { setError('Fichier vide ou format non reconnu'); return }

      let mapped = []
      if (type === 'demandeurs') mapped = raw.map(mapDemandeur)
      else if (type === 'logements') mapped = raw.map(mapLogement)
      else if (type === 'audiences') mapped = raw.map(mapAudience)

      setRows(mapped)
      setPreview(mapped.slice(0, 5))
      setStep('preview')
    } catch (e) {
      setError('Erreur de lecture: ' + e.message)
    }
  }

  const doImport = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/import/' + type, { method: 'POST', body: { rows } })
      setResult(res)
      setStep('done')
    } catch (e) {
      setError('Erreur import: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('upload')
    setRows([])
    setPreview([])
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const PREVIEW_COLS = {
    demandeurs: ['nom', 'prenom', 'nud', 'anc', 'compo', 'typ_v', 'rev'],
    logements: ['ref', 'bailleur', 'adresse', 'typ', 'loyer'],
    audiences: ['date_audience', 'dem_nom', 'dem_prenom', 'elu_nom', 'elu_secteur', 'objet']
  }

  return (
    <div style={{ fontFamily: Fb, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
        Import Pelehas
      </h1>
      <p style={{ color: C.muted, fontSize: 12.5, marginBottom: 24 }}>
        Importez vos fichiers CSV Pelehas ou bailleur directement dans CAL Smart
      </p>

      {/* Choix du type */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {TYPES.map(t => (
          <button key={t.id} onClick={() => { setType(t.id); reset() }}
            style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (type === t.id ? C.accent : C.border), background: type === t.id ? C.accentL : C.card, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 13, color: type === t.id ? C.accent : C.text }}>{t.label}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Step: upload */}
      {step === 'upload' && (
        <div
          onClick={() => fileRef.current && fileRef.current.click()}
          style={{ background: C.card, borderRadius: 13, border: '2px dashed ' + C.border, padding: 48, textAlign: 'center', cursor: 'pointer' }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && fileRef.current) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current.files = dt.files; handleFile({ target: fileRef.current }) } }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>[CSV]</div>
          <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>Cliquez ou glissez votre fichier CSV</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>Formats acceptes: .csv (separateur ; ou ,)</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, background: C.redBg, borderRadius: 9, padding: '10px 16px', border: '1px solid ' + C.red + '44', fontSize: 13, color: C.red }}>{error}</div>
      )}

      {/* Step: preview */}
      {step === 'preview' && (
        <div>
          <div style={{ background: C.card, borderRadius: 12, padding: '14px 18px', border: '1px solid ' + C.border, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: Fh, fontWeight: 700, fontSize: 14, color: C.text }}>{rows.length} lignes detectees</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Verifiez les premieres lignes avant import</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={reset} style={{ padding: '8px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
              <button onClick={doImport} disabled={loading}
                style={{ padding: '8px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>
                {loading ? 'Import...' : 'Importer ' + rows.length + ' lignes'}
              </button>
            </div>
          </div>

          <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {(PREVIEW_COLS[type] || []).map(col => (
                      <th key={col} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid ' + C.border }}>
                      {(PREVIEW_COLS[type] || []).map(col => (
                        <td key={col} style={{ padding: '8px 12px', color: C.text }}>
                          {row[col] !== undefined && row[col] !== null ? String(row[col]) : '---'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid ' + C.border, fontSize: 12, color: C.muted, textAlign: 'center' }}>
                + {rows.length - 5} autres lignes
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step: done */}
      {step === 'done' && result && (
        <div style={{ background: C.card, borderRadius: 13, padding: 32, border: '1px solid ' + C.border, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>[OK]</div>
          <div style={{ fontFamily: Fh, fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 16 }}>Import termine !</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Importes', val: result.imported, color: C.green },
              { label: 'Mis a jour', val: result.updated, color: C.amber },
              ...(result.matched !== undefined ? [{ label: 'Matches', val: result.matched, color: C.accent }] : []),
              ...(result.unmatched !== undefined ? [{ label: 'Non matches', val: result.unmatched, color: C.red }] : []),
              { label: 'Erreurs', val: result.errors, color: C.red }
            ].map((s, i) => (
              <div key={i} style={{ background: C.bg, borderRadius: 9, padding: '12px 20px', minWidth: 90 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: Fh }}>{s.val}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={reset} style={{ padding: '9px 18px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>
              Nouvel import
            </button>
            <button onClick={() => onDone && onDone({ type })}
              style={{ padding: '9px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>
              Voir les {type}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}