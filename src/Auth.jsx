import { useState, useEffect, createContext, useContext } from 'react'

const C = {
  navy: '#0B1E3D', navyB: '#1D3557',
  accent: '#E05C2A', accentL: 'rgba(224,92,42,0.10)',
  bg: '#EEF1F6', card: '#FFFFFF', text: '#0B1E3D', muted: '#5B6B85',
  border: '#DDE3EE', green: '#16A34A', greenBg: '#DCFCE7',
  amber: '#D97706', amberBg: '#FEF3C7', red: '#DC2626', redBg: '#FEE2E2',
  purple: '#7C3AED', purpleBg: '#EDE9FE'
}
const Fh = "'Syne',sans-serif"
const Fb = "'DM Sans',sans-serif"

export const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

function getToken() { return localStorage.getItem('cal_token') }
function setToken(t) { localStorage.setItem('cal_token', t) }
function clearToken() { localStorage.removeItem('cal_token') }

export async function apiFetch(path, options) {
  const token = getToken()
  const opts = {
    ...(options || {}),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
      ...((options && options.headers) ? options.headers : {})
    }
  }
  if (options && options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body)
  }
  let res
  try {
    res = await fetch('/api' + path, opts)
  } catch (networkErr) {
    throw new Error('Connexion au serveur impossible. Vérifiez votre réseau.')
  }
  if (res.status === 401) {
    clearToken()
    // Recharge doucement pour revenir à l'écran de login
    if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 100)
    throw new Error('Session expirée. Reconnexion nécessaire.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur ' + res.status }))
    throw new Error(err.error || ('Erreur ' + res.status))
  }
  // Réponses vides (204 No Content)
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    apiFetch('/auth/me')
      .then(d => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = async (loginId, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { login: loginId, password } })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }) } catch (e) {}
    clearToken()
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: Fb, color: C.muted }}>
        Chargement...
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function LoginScreen() {
  const { login } = useAuth()
  const [loginVal, setLoginVal] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try { await login(loginVal, password) }
    catch (e) { setError('Identifiants incorrects. Verifiez votre login et mot de passe.') }
    finally { setLoading(false) }
  }

  const inp = {
    width: '100%', padding: '12px 14px', borderRadius: 9,
    border: '1.5px solid ' + (error ? '#DC2626' : 'rgba(255,255,255,0.15)'),
    background: 'rgba(255,255,255,0.07)', color: '#fff',
    fontFamily: Fb, fontSize: 14, boxSizing: 'border-box', outline: 'none'
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.navy, fontFamily: Fb }}>
      <div style={{ flex: '0 0 460px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 44 }}>
          <div style={{ width: 46, height: 46, background: 'linear-gradient(135deg, #E05C2A 0%, #F68144 100%)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: Fh, boxShadow: '0 8px 20px rgba(224,92,42,0.3)' }}>L</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 22, fontFamily: Fh, letterSpacing: '-0.03em' }}>Logivia</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Ville de Saint-Denis</div>
          </div>
        </div>
        <div style={{ color: '#fff', fontFamily: Fh, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>Bienvenue</div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, marginBottom: 32 }}>Connectez-vous pour acceder a l&apos;outil de gestion des attributions.</div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>IDENTIFIANT</label>
            <input value={loginVal} onChange={e => setLoginVal(e.target.value)} autoFocus autoComplete="username" style={inp} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MOT DE PASSE</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" style={inp} />
          </div>
          {error && (
            <div style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#FCA5A5' }}>{error}</div>
          )}
          <button type="submit" disabled={loading || !loginVal || !password}
            style={{ width: '100%', padding: '13px', borderRadius: 9, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer', fontFamily: Fh, fontSize: 14, fontWeight: 700, opacity: (loading || !loginVal || !password) ? 0.6 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <div style={{ marginTop: 28, padding: '14px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comptes de demonstration</div>
          {[
            { role: 'Directeur', login: 'admin', pwd: 'calsmart2024', color: C.accent },
            { role: 'Agent', login: 'agent1', pwd: 'agent2024', color: '#1D6FA8' },
            { role: 'Elu Nord', login: 'dupont', pwd: 'elu2024', color: C.purple }
          ].map(c => (
            <div key={c.login} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, cursor: 'pointer' }}
              onClick={() => { setLoginVal(c.login); setPassword(c.pwd) }}>
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: c.color + '22', color: c.color, fontWeight: 700 }}>{c.role}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{c.login} / {c.pwd}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.12)', fontSize: 17, fontFamily: Fh, fontWeight: 700, marginBottom: 14 }}>
            Matching - CAL - Audiences Elus
          </div>
          {[
            'Score transparent 8 criteres',
            'Correction anti-biais automatique',
            'Suivi territorial des elus',
            'Notifications par secteur',
            'Import depuis Pelehas',
            'Export CSV - Rapport mensuel',
            'Portail candidat public'
          ].map((f, i) => (
            <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <span style={{ color: C.accent }}>+</span> {f}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, fontSize: 11, color: 'rgba(255,255,255,0.12)' }}>
          Logivia v3.0 · Saint-Denis · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}

export function ChangePasswordModal({ onClose }) {
  const [ancien, setAncien] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    if (nouveau !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    if (nouveau.length < 6) { setError('Minimum 6 caracteres'); return }
    setLoading(true)
    try { await apiFetch('/auth/change-password', { method: 'POST', body: { ancien, nouveau } }); setOk(true) }
    catch (e) { setError('Ancien mot de passe incorrect') }
    finally { setLoading(false) }
  }

  const inp = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 13, color: C.text, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,61,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.card, borderRadius: 14, padding: 28, width: 380, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', fontFamily: Fb }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontFamily: Fh, fontSize: 16, fontWeight: 800, color: C.text }}>Changer mon mot de passe</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: C.muted }}>x</button>
        </div>
        {ok ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontFamily: Fh, fontSize: 14, fontWeight: 700, color: C.text }}>Mot de passe modifie !</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: '8px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Fermer</button>
          </div>
        ) : (
          <>
            {[['Ancien mot de passe', ancien, setAncien], ['Nouveau mot de passe', nouveau, setNouveau], ['Confirmer le nouveau', confirm, setConfirm]].map(([label, val, setVal]) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</label>
                <input type="password" value={val} onChange={e => setVal(e.target.value)} style={inp} />
              </div>
            ))}
            {error && <div style={{ background: C.redBg, borderRadius: 8, padding: '9px 12px', fontSize: 12, color: C.red, marginBottom: 14 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
              <button onClick={submit} disabled={loading} style={{ padding: '8px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>{loading ? '...' : 'Valider'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function GestionUtilisateurs() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ login: '', password: '', nom: '', prenom: '', role: 'agent', secteur: '', actif: true })

  useEffect(() => {
    apiFetch('/users').then(setUsers).catch(console.error).finally(() => setLoading(false))
  }, [])

  const ROLES = [
    { id: 'agent', label: 'Agent instructeur', color: '#1D6FA8' },
    { id: 'elu', label: 'Elu', color: C.purple },
    { id: 'directeur', label: 'Directeur', color: C.accent }
  ]

  const submit = async () => {
    try {
      const newU = await apiFetch('/users', { method: 'POST', body: form })
      setUsers(p => [...p, newU])
      setShowForm(false)
      setForm({ login: '', password: '', nom: '', prenom: '', role: 'agent', secteur: '', actif: true })
    } catch (e) { alert('Erreur: ' + e.message) }
  }

  const toggle = async (u) => {
    try {
      await apiFetch('/users/' + u.id, { method: 'PUT', body: { actif: !u.actif } })
      setUsers(p => p.map(x => x.id === u.id ? { ...x, actif: !x.actif } : x))
    } catch (e) {}
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid ' + C.border, fontFamily: Fb, fontSize: 13, color: C.text, boxSizing: 'border-box', outline: 'none' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Chargement...</div>

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Gestion des utilisateurs</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{users.length} comptes configures</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: '10px 18px', background: C.accent, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontFamily: Fh, fontSize: 12.5, fontWeight: 700 }}>
          + Nouveau compte
        </button>
      </div>
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {['Login', 'Nom', 'Role', 'Statut', 'Action'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const role = ROLES.find(r => r.id === u.role)
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid ' + C.border, opacity: u.actif ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: C.text, fontFamily: Fh }}>{u.login}</td>
                  <td style={{ padding: '10px 16px', color: C.text }}>{u.prenom} {u.nom}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: (role ? role.color : C.muted) + '22', color: role ? role.color : C.muted, fontWeight: 700 }}>
                      {role ? role.label : u.role}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: u.actif ? C.greenBg : C.redBg, color: u.actif ? C.green : C.red, fontWeight: 600 }}>
                      {u.actif ? 'Actif' : 'Desactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {u.id !== (user && user.id) && (
                      <button onClick={() => toggle(u)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', cursor: 'pointer', color: C.muted, fontFamily: Fh, fontWeight: 600 }}>
                        {u.actif ? 'Desactiver' : 'Reactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,30,61,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 14, padding: 28, width: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', fontFamily: Fb }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontFamily: Fh, fontSize: 16, fontWeight: 800, color: C.text }}>Nouveau compte</div>
              <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: C.muted }}>x</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['Nom', form.nom, v => setForm(p => ({ ...p, nom: v }))], ['Prenom', form.prenom, v => setForm(p => ({ ...p, prenom: v }))], ['Login', form.login, v => setForm(p => ({ ...p, login: v }))], ['Mot de passe', form.password, v => setForm(p => ({ ...p, password: v }))]].map(([label, val, setter]) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</label>
                  <input value={val} onChange={e => setter(e.target.value)} style={inp} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Role</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={{ ...inp, background: C.card }}>
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              {form.role === 'elu' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Secteur</label>
                  <input value={form.secteur} onChange={e => setForm(p => ({ ...p, secteur: e.target.value }))} placeholder="ex: Nord" style={inp} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', border: '1px solid ' + C.border, borderRadius: 8, background: 'transparent', cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 600, color: C.muted }}>Annuler</button>
              <button onClick={submit} style={{ padding: '9px 16px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: Fh, fontSize: 12, fontWeight: 700 }}>Creer le compte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function LogsActions() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    apiFetch('/logs?limit=200').then(setLogs).catch(console.error).finally(() => setLoading(false))
  }, [])

  const META = {
    info: { color: '#1D6FA8', bg: '#DBEAFE', label: 'Action' },
    security: { color: C.amber, bg: C.amberBg, label: 'Securite' },
    warning: { color: C.amber, bg: C.amberBg, label: 'Avertissement' },
    error: { color: C.red, bg: C.redBg, label: 'Erreur' }
  }

  const filtered = filter === 'all' ? logs : logs.filter(l => l.type === filter)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Chargement...</div>

  return (
    <div style={{ padding: 28, fontFamily: Fb }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: Fh, fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>Journal d&apos;activite</h1>
          <p style={{ color: C.muted, fontSize: 12.5 }}>{logs.length} actions - conformite RGPD</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ id: 'all', label: 'Tous' }, { id: 'info', label: 'Actions' }, { id: 'security', label: 'Securite' }, { id: 'error', label: 'Erreurs' }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid ' + (filter === f.id ? C.navy : C.border), background: filter === f.id ? C.navy : 'transparent', color: filter === f.id ? '#fff' : C.muted, cursor: 'pointer', fontFamily: Fh, fontSize: 11.5, fontWeight: 600 }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: C.card, borderRadius: 12, border: '1px solid ' + C.border, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.muted, fontSize: 13 }}>Aucune action enregistree</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Date', 'Heure', 'Utilisateur', 'Role', 'Action', 'Detail', 'Type'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid ' + C.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((l, i) => {
                  const meta = META[l.type] || META.info
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid ' + C.border }}>
                      <td style={{ padding: '8px 14px', color: C.muted, fontSize: 11, whiteSpace: 'nowrap' }}>{l.date}</td>
                      <td style={{ padding: '8px 14px', color: C.muted, fontSize: 11 }}>{l.heure}</td>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: C.text }}>{l.user_nom}</td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: l.role === 'directeur' ? C.accentL : l.role === 'elu' ? C.purpleBg : '#DBEAFE', color: l.role === 'directeur' ? C.accent : l.role === 'elu' ? C.purple : '#1D6FA8', fontWeight: 700 }}>{l.role}</span>
                      </td>
                      <td style={{ padding: '8px 14px', color: C.text, fontWeight: 600, fontSize: 11.5 }}>{l.action}</td>
                      <td style={{ padding: '8px 14px', color: C.muted, fontSize: 11, maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.detail || '---'}</div>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: meta.bg, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}