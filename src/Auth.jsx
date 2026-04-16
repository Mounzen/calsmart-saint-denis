// ═══════════════════════════════════════════════════════════════
// CALSmart — Auth.jsx
// Login · Session · Contexte utilisateur · Logs · Gestion users
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, createContext, useContext } from "react";

const C = {
  navy:"#0B1E3D", navyB:"#1D3557",
  accent:"#E05C2A", accentL:"rgba(224,92,42,0.10)",
  bg:"#EEF1F6", card:"#FFFFFF", text:"#0B1E3D", muted:"#5B6B85",
  border:"#DDE3EE", green:"#16A34A", greenBg:"#DCFCE7",
  amber:"#D97706", amberBg:"#FEF3C7", red:"#DC2626", redBg:"#FEE2E2",
  purple:"#7C3AED", purpleBg:"#EDE9FE",
};
const F = { h:"'Syne',sans-serif", b:"'DM Sans',sans-serif" };

// ─── CONTEXTE AUTH ────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ─── API AUTH ─────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('cal_token'); }
function setToken(t) { localStorage.setItem('cal_token', t); }
function clearToken() { localStorage.removeItem('cal_token'); }

// En dev : Vite proxy redirige /api → localhost:4000
// En prod : Express sert tout sur le même port, /api fonctionne directement
const API_BASE = '/api'

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export { apiFetch };

// ─── AUTH PROVIDER ────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    apiFetch('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => { clearToken(); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (loginId, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST', body: { login: loginId, password }
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch(e) {}
    clearToken();
    setUser(null);
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.bg, fontFamily:F.b, color:C.muted }}>
      <span style={{ marginRight:8, fontSize:20 }}>⟳</span> Chargement…
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── ÉCRAN LOGIN ──────────────────────────────────────────────────────────────
export function LoginScreen() {
  const { login } = useAuth();
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(loginVal, password);
    } catch(err) {
      setError("Identifiants incorrects. Vérifiez votre login et mot de passe.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display:"flex", height:"100vh", background:C.navy, fontFamily:F.b }}>
      {/* Panel gauche */}
      <div style={{ flex:1, display:"flex", flexDirection:"column",
        justifyContent:"center", padding:"0 60px", maxWidth:520 }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:48 }}>
          <div style={{ width:48, height:48, background:C.accent, borderRadius:12,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:24, fontWeight:900, color:"#fff", fontFamily:F.h }}>C</div>
          <div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:22, fontFamily:F.h,
              letterSpacing:"-0.03em" }}>CAL Smart</div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:12 }}>
              Ville de Saint-Denis</div>
          </div>
        </div>

        <div style={{ color:"#fff", fontFamily:F.h, fontSize:26, fontWeight:800,
          letterSpacing:"-0.03em", marginBottom:8 }}>
          Bienvenue
        </div>
        <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14, marginBottom:36 }}>
          Connectez-vous pour accéder à l'outil de gestion des attributions.
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600,
              color:"rgba(255,255,255,0.6)", marginBottom:6,
              textTransform:"uppercase", letterSpacing:"0.05em" }}>
              Identifiant
            </label>
            <input value={loginVal} onChange={e=>setLoginVal(e.target.value)}
              autoFocus autoComplete="username"
              style={{ width:"100%", padding:"12px 14px", borderRadius:9,
                border:`1.5px solid ${error?"#DC2626":"rgba(255,255,255,0.15)"}`,
                background:"rgba(255,255,255,0.07)", color:"#fff",
                fontFamily:F.b, fontSize:14, boxSizing:"border-box", outline:"none" }}/>
          </div>

          <div style={{ marginBottom:24 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600,
              color:"rgba(255,255,255,0.6)", marginBottom:6,
              textTransform:"uppercase", letterSpacing:"0.05em" }}>
              Mot de passe
            </label>
            <div style={{ position:"relative" }}>
              <input value={password} onChange={e=>setPassword(e.target.value)}
                type={showPwd?"text":"password"} autoComplete="current-password"
                style={{ width:"100%", padding:"12px 44px 12px 14px", borderRadius:9,
                  border:`1.5px solid ${error?"#DC2626":"rgba(255,255,255,0.15)"}`,
                  background:"rgba(255,255,255,0.07)", color:"#fff",
                  fontFamily:F.b, fontSize:14, boxSizing:"border-box", outline:"none" }}/>
              <button type="button" onClick={()=>setShowPwd(!showPwd)}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                  background:"transparent", border:"none", cursor:"pointer",
                  color:"rgba(255,255,255,0.4)", fontSize:16 }}>
                {showPwd?"🙈":"👁"}
              </button>
            </div>
          </div>

          {error&&(
            <div style={{ background:"rgba(220,38,38,0.15)", border:"1px solid rgba(220,38,38,0.3)",
              borderRadius:8, padding:"10px 14px", marginBottom:16,
              fontSize:13, color:"#FCA5A5" }}>{error}</div>
          )}

          <button type="submit" disabled={loading||!loginVal||!password}
            style={{ width:"100%", padding:"13px", borderRadius:9, border:"none",
              background:C.accent, color:"#fff", cursor:"pointer",
              fontFamily:F.h, fontSize:14, fontWeight:700,
              opacity:loading||!loginVal||!password?0.6:1,
              transition:"opacity .15s" }}>
            {loading?"Connexion…":"Se connecter →"}
          </button>
        </form>

        <div style={{ marginTop:32, padding:"14px 16px", background:"rgba(255,255,255,0.05)",
          borderRadius:9, border:"1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:8,
            textTransform:"uppercase", letterSpacing:"0.05em" }}>Comptes de démonstration</div>
          {[
            { role:"Directeur", login:"admin", pwd:"calsmart2024", color:C.accent },
            { role:"Agent", login:"agent1", pwd:"agent2024", color:"#1D6FA8" },
            { role:"Élu (Dupont)", login:"dupont", pwd:"elu2024", color:C.purple },
          ].map(c=>(
            <div key={c.login} style={{ display:"flex", alignItems:"center", gap:8,
              marginBottom:4 }} onClick={()=>{setLoginVal(c.login);setPassword(c.pwd);}}>
              <span style={{ fontSize:10, padding:"1px 7px", borderRadius:99,
                background:`${c.color}22`, color:c.color, fontWeight:700,
                cursor:"pointer" }}>{c.role}</span>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)",
                cursor:"pointer" }}>{c.login} / {c.pwd}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Panel droit — illustration */}
      <div style={{ flex:1, background:"rgba(255,255,255,0.03)",
        borderLeft:"1px solid rgba(255,255,255,0.08)",
        display:"flex", flexDirection:"column", justifyContent:"center",
        alignItems:"center", padding:60 }}>
        <div style={{ color:"rgba(255,255,255,0.08)", fontSize:120,
          marginBottom:32, lineHeight:1 }}>🏠</div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"rgba(255,255,255,0.15)", fontSize:18,
            fontFamily:F.h, fontWeight:700, marginBottom:12 }}>
            Matching · CAL · Audiences Élus
          </div>
          {[
            "Score transparent 8 critères",
            "Correction anti-biais automatique",
            "Suivi territorial des élus",
            "Notifications par secteur",
            "Import depuis Pelehas",
            "Export PDF fiche CAL",
          ].map((f,i)=>(
            <div key={i} style={{ fontSize:13, color:"rgba(255,255,255,0.2)",
              marginBottom:6, display:"flex", alignItems:"center", gap:8,
              justifyContent:"center" }}>
              <span style={{ color:C.accent }}>✓</span> {f}
            </div>
          ))}
        </div>
        <div style={{ marginTop:48, fontSize:11,
          color:"rgba(255,255,255,0.15)" }}>
          CAL Smart v2.0 · Saint-Denis · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}

// ─── CHANGEMENT MOT DE PASSE ─────────────────────────────────────────────────
export function ChangePasswordModal({ onClose }) {
  const { user } = useAuth();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (nouveau !== confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    if (nouveau.length < 6) { setError("Minimum 6 caractères"); return; }
    setLoading(true);
    try {
      await apiFetch('/auth/change-password', { method:'POST', body:{ ancien, nouveau } });
      setOk(true);
    } catch(e) { setError("Ancien mot de passe incorrect"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(11,30,61,0.55)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:C.card, borderRadius:14, padding:28, width:380,
        boxShadow:"0 24px 80px rgba(0,0,0,0.25)", fontFamily:F.b }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontFamily:F.h, fontSize:16, fontWeight:800, color:C.text }}>
            Changer mon mot de passe</div>
          <button onClick={onClose} style={{ border:"none", background:"transparent",
            fontSize:18, cursor:"pointer", color:C.muted }}>✕</button>
        </div>
        {ok?(
          <div style={{ textAlign:"center", padding:20 }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
            <div style={{ fontFamily:F.h, fontSize:14, fontWeight:700, color:C.text }}>
              Mot de passe modifié</div>
            <button onClick={onClose} style={{ marginTop:16, padding:"8px 18px",
              background:C.accent, color:"#fff", border:"none", borderRadius:8,
              cursor:"pointer", fontFamily:F.h, fontSize:12, fontWeight:700 }}>
              Fermer</button>
          </div>
        ):(
          <>
            {[["Ancien mot de passe",ancien,setAncien],
              ["Nouveau mot de passe",nouveau,setNouveau],
              ["Confirmer le nouveau",confirm,setConfirm]].map(([label,val,setVal])=>(
              <div key={label} style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
                  {label}</label>
                <input type="password" value={val} onChange={e=>setVal(e.target.value)}
                  style={{ width:"100%", padding:"9px 12px", borderRadius:8,
                    border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
                    color:C.text, boxSizing:"border-box", outline:"none" }}/>
              </div>
            ))}
            {error&&<div style={{ background:C.redBg, borderRadius:8, padding:"9px 12px",
              fontSize:12, color:C.red, marginBottom:14 }}>{error}</div>}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={onClose} style={{ padding:"8px 16px", border:`1px solid ${C.border}`,
                borderRadius:8, background:"transparent", cursor:"pointer",
                fontFamily:F.h, fontSize:12, fontWeight:600, color:C.muted }}>Annuler</button>
              <button onClick={submit} disabled={loading}
                style={{ padding:"8px 16px", background:C.accent, color:"#fff",
                  border:"none", borderRadius:8, cursor:"pointer",
                  fontFamily:F.h, fontSize:12, fontWeight:700 }}>
                {loading?"…":"Valider"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── GESTION UTILISATEURS ─────────────────────────────────────────────────────
export function GestionUtilisateurs() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login:"", password:"", nom:"", prenom:"",
    role:"agent", elu_id:"", secteur:"", actif:true });

  useEffect(() => {
    apiFetch('/users').then(setUsers).finally(()=>setLoading(false));
  }, []);

  const ROLES = [
    { id:"agent", label:"Agent instructeur", color:"#1D6FA8" },
    { id:"elu", label:"Élu", color:C.purple },
    { id:"directeur", label:"Directeur", color:C.accent },
  ];

  const submit = async () => {
    try {
      const newU = await apiFetch('/users', { method:'POST', body:form });
      setUsers(p=>[...p,newU]); setShowForm(false);
      setForm({ login:"", password:"", nom:"", prenom:"", role:"agent",
        elu_id:"", secteur:"", actif:true });
    } catch(e) { alert('Erreur: '+e.message); }
  };

  const toggle = async (u) => {
    try {
      await apiFetch(`/users/${u.id}`, { method:'PUT', body:{ actif:!u.actif } });
      setUsers(p=>p.map(x=>x.id===u.id?{...x,actif:!x.actif}:x));
    } catch(e) {}
  };

  if (loading) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Chargement…</div>;

  return (
    <div style={{ padding:28, fontFamily:F.b }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:20 }}>
        <div>
          <h1 style={{ fontFamily:F.h, fontSize:22, fontWeight:800, color:C.text,
            margin:"0 0 4px", letterSpacing:"-0.03em" }}>Gestion des utilisateurs</h1>
          <p style={{ color:C.muted, fontSize:12.5 }}>{users.length} comptes configurés</p>
        </div>
        <button onClick={()=>setShowForm(true)}
          style={{ padding:"10px 18px", background:C.accent, color:"#fff", border:"none",
            borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
          + Nouveau compte
        </button>
      </div>

      <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`,
        overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:C.bg }}>
              {["Login","Nom","Rôle","Secteur / Élu","Statut","Action"].map(h=>(
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10.5,
                  fontWeight:700, color:C.muted, textTransform:"uppercase",
                  letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u=>{
              const role = ROLES.find(r=>r.id===u.role);
              return (
                <tr key={u.id} style={{ borderBottom:`1px solid ${C.border}`,
                  opacity:u.actif?1:0.5 }}>
                  <td style={{ padding:"10px 16px", fontWeight:700, color:C.text,
                    fontFamily:F.h }}>{u.login}</td>
                  <td style={{ padding:"10px 16px", color:C.text }}>
                    {u.prenom} {u.nom}</td>
                  <td style={{ padding:"10px 16px" }}>
                    <span style={{ fontSize:11, padding:"2px 9px", borderRadius:99,
                      background:`${role?.color}18`, color:role?.color, fontWeight:700 }}>
                      {role?.label||u.role}</span>
                  </td>
                  <td style={{ padding:"10px 16px", color:C.muted, fontSize:12 }}>
                    {u.secteur||u.elu_id||"—"}</td>
                  <td style={{ padding:"10px 16px" }}>
                    <span style={{ fontSize:11, padding:"2px 9px", borderRadius:99,
                      background:u.actif?C.greenBg:C.redBg,
                      color:u.actif?C.green:C.red, fontWeight:600 }}>
                      {u.actif?"Actif":"Désactivé"}</span>
                  </td>
                  <td style={{ padding:"10px 16px" }}>
                    {u.id !== user?.id && (
                      <button onClick={()=>toggle(u)}
                        style={{ fontSize:11, padding:"4px 10px", borderRadius:6,
                          border:`1px solid ${C.border}`, background:"transparent",
                          cursor:"pointer", color:C.muted, fontFamily:F.h, fontWeight:600 }}>
                        {u.actif?"Désactiver":"Réactiver"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Formulaire nouveau compte */}
      {showForm&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(11,30,61,0.55)",
          zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:C.card, borderRadius:14, padding:28, width:480,
            boxShadow:"0 24px 80px rgba(0,0,0,0.25)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontFamily:F.h, fontSize:16, fontWeight:800, color:C.text }}>
                Nouveau compte</div>
              <button onClick={()=>setShowForm(false)} style={{ border:"none",
                background:"transparent", fontSize:18, cursor:"pointer", color:C.muted }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[["Nom",form.nom,v=>setForm(p=>({...p,nom:v}))],
                ["Prénom",form.prenom,v=>setForm(p=>({...p,prenom:v}))],
                ["Login",form.login,v=>setForm(p=>({...p,login:v}))],
                ["Mot de passe",form.password,v=>setForm(p=>({...p,password:v}))]
              ].map(([label,val,setter])=>(
                <div key={label}>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                    textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
                    {label}</label>
                  <input value={val} onChange={e=>setter(e.target.value)}
                    style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                      border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
                      color:C.text, boxSizing:"border-box", outline:"none" }}/>
                </div>
              ))}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Rôle</label>
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}
                  style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                    border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
                    color:C.text, background:C.card }}>
                  {ROLES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              {form.role==="elu"&&(
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                    textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
                    Secteur</label>
                  <input value={form.secteur} onChange={e=>setForm(p=>({...p,secteur:e.target.value}))}
                    placeholder="ex: Nord"
                    style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                      border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
                      color:C.text, boxSizing:"border-box", outline:"none" }}/>
                </div>
              )}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
              <button onClick={()=>setShowForm(false)}
                style={{ padding:"9px 16px", border:`1px solid ${C.border}`, borderRadius:8,
                  background:"transparent", cursor:"pointer", fontFamily:F.h,
                  fontSize:12, fontWeight:600, color:C.muted }}>Annuler</button>
              <button onClick={submit}
                style={{ padding:"9px 16px", background:C.accent, color:"#fff",
                  border:"none", borderRadius:8, cursor:"pointer",
                  fontFamily:F.h, fontSize:12, fontWeight:700 }}>Créer le compte</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGS D'ACTIONS ───────────────────────────────────────────────────────────
export function LogsActions() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    apiFetch('/logs?limit=200').then(setLogs).finally(()=>setLoading(false));
  }, []);

  const TYPE_META = {
    info: { color:"#1D6FA8", bg:"#DBEAFE", label:"Action" },
    security: { color:C.amber, bg:C.amberBg, label:"Sécurité" },
    warning: { color:C.amber, bg:C.amberBg, label:"Avertissement" },
    error: { color:C.red, bg:C.redBg, label:"Erreur" },
  };

  const filtered = filter==="all" ? logs : logs.filter(l=>l.type===filter);

  if (loading) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Chargement…</div>;

  return (
    <div style={{ padding:28, fontFamily:F.b }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:20 }}>
        <div>
          <h1 style={{ fontFamily:F.h, fontSize:22, fontWeight:800, color:C.text,
            margin:"0 0 4px", letterSpacing:"-0.03em" }}>Journal d'activité</h1>
          <p style={{ color:C.muted, fontSize:12.5 }}>
            {logs.length} actions enregistrées — conformité RGPD</p>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[{id:"all",label:"Tous"},
            {id:"info",label:"Actions"},
            {id:"security",label:"Sécurité"},
            {id:"error",label:"Erreurs"}].map(f=>(
            <button key={f.id} onClick={()=>setFilter(f.id)}
              style={{ padding:"7px 14px", borderRadius:7,
                border:`1px solid ${filter===f.id?"#0B1E3D":"#DDE3EE"}`,
                background:filter===f.id?"#0B1E3D":"transparent",
                color:filter===f.id?"#fff":"#5B6B85",
                cursor:"pointer", fontFamily:"'Syne',sans-serif",
                fontSize:11.5, fontWeight:600 }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`,
        overflow:"hidden" }}>
        {filtered.length===0?(
          <div style={{ padding:32, textAlign:"center", color:C.muted, fontSize:13 }}>
            Aucune action enregistrée</div>
        ):<div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:C.bg }}>
                {["Date","Heure","Utilisateur","Rôle","Action","Détail","Type"].map(h=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10,
                    fontWeight:700, color:C.muted, textTransform:"uppercase",
                    letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0,100).map((l,i)=>{
                const meta = TYPE_META[l.type]||TYPE_META.info;
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                    <td style={{ padding:"8px 14px", color:C.muted, whiteSpace:"nowrap",
                      fontSize:11 }}>{l.date}</td>
                    <td style={{ padding:"8px 14px", color:C.muted, fontSize:11 }}>{l.heure}</td>
                    <td style={{ padding:"8px 14px", fontWeight:600, color:C.text }}>
                      {l.user_nom}</td>
                    <td style={{ padding:"8px 14px" }}>
                      <span style={{ fontSize:10, padding:"1px 7px", borderRadius:99,
                        background:l.role==="directeur"?C.accentL:l.role==="elu"?"#EDE9FE":"#DBEAFE",
                        color:l.role==="directeur"?"#E05C2A":l.role==="elu"?"#7C3AED":"#1D6FA8",
                        fontWeight:700 }}>{l.role}</span>
                    </td>
                    <td style={{ padding:"8px 14px", color:C.text, fontWeight:600,
                      fontSize:11.5 }}>{l.action}</td>
                    <td style={{ padding:"8px 14px", color:C.muted, fontSize:11,
                      maxWidth:200 }}>
                      <div style={{ overflow:"hidden", textOverflow:"ellipsis",
                        whiteSpace:"nowrap" }}>{l.detail||"—"}</div>
                    </td>
                    <td style={{ padding:"8px 14px" }}>
                      <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99,
                        background:meta.bg, color:meta.color, fontWeight:600 }}>
                        {meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}
