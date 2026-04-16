import { useState, useEffect, useMemo, useCallback } from "react";
import Statistiques from "./Statistiques.jsx";
import ImportPelehas from "./ImportPelehas.jsx";
import { AuthProvider, useAuth, LoginScreen, ChangePasswordModal,
  GestionUtilisateurs, LogsActions, apiFetch } from "./Auth.jsx";
import TelegramPanel from "./Telegram.jsx";

function useFonts() {
  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap";
    l.rel = "stylesheet"; document.head.appendChild(l);
  }, []);
}

const C = {
  navy:"#0B1E3D", navyB:"#1D3557",
  accent:"#E05C2A", accentL:"rgba(224,92,42,0.10)",
  bg:"#EEF1F6", card:"#FFFFFF",
  text:"#0B1E3D", muted:"#5B6B85", light:"#8A9BB5",
  border:"#DDE3EE",
  green:"#16A34A", greenBg:"#DCFCE7",
  amber:"#D97706", amberBg:"#FEF3C7",
  red:"#DC2626", redBg:"#FEE2E2",
  purple:"#7C3AED", purpleBg:"#EDE9FE",
  teal:"#0D9488", tealBg:"#CCFBF1",
};
const F = { h:"'Syne',sans-serif", b:"'DM Sans',sans-serif" };

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
  get: async (path) => {
    const r = await fetch(`/api${path}`);
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return r.json();
  },
  post: async (path, body) => {
    const r = await fetch(`/api${path}`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  },
  put: async (path, body) => {
    const r = await fetch(`/api${path}`, {
      method:"PUT", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  },
};

function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setErr(null);
    try { setData(await api.get(path)); }
    catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, err, reload: load };
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const spin = `@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`;

function Spin() {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",
    padding:48,color:C.muted,fontFamily:F.b,fontSize:13}}>
    <style>{spin}</style>
    <span style={{animation:"spin 1s linear infinite",marginRight:8,fontSize:20,display:"inline-block"}}>⟳</span>
    Chargement…
  </div>;
}

function Pill({label,color,bg}) {
  return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:99,
    fontSize:11,fontWeight:600,color,background:bg,marginRight:4,marginBottom:3}}>{label}</span>;
}
function Tag({text,color=C.muted,bg=C.bg}) {
  return <span style={{fontSize:11,padding:"2px 7px",borderRadius:5,background:bg,
    color,fontWeight:600,marginRight:3}}>{text}</span>;
}
function SBar({label,val,max}) {
  const pct=val/max*100, col=pct>=70?C.green:pct>=40?C.amber:C.red;
  return <div style={{marginBottom:6}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
      <span style={{fontSize:11,color:C.muted}}>{label}</span>
      <span style={{fontSize:11,fontWeight:700,color:col}}>{val}/{max}</span>
    </div>
    <div style={{height:5,background:"#E8EDF6",borderRadius:99}}>
      <div style={{height:"100%",width:`${pct}%`,background:col,borderRadius:99}}/>
    </div>
  </div>;
}

function Modal({title,onClose,children,maxWidth=600}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(11,30,61,0.55)",
    zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:C.card,borderRadius:14,padding:28,width:"100%",
      maxWidth,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 80px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{fontFamily:F.h,fontSize:17,fontWeight:800,color:C.text,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{border:"none",background:"transparent",
          fontSize:20,cursor:"pointer",color:C.muted,lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

const inp = {width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.border}`,
  fontFamily:"'DM Sans',sans-serif",fontSize:13,color:"#0B1E3D",
  boxSizing:"border-box",outline:"none",background:"#fff"};

function F2({label,children}) {
  return <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:11,fontWeight:700,color:C.muted,
      textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:5}}>{label}</label>
    {children}
  </div>;
}

function adequation(score) {
  if(score>=80) return{label:"Très forte",color:C.green,bg:C.greenBg};
  if(score>=60) return{label:"Forte",color:"#1D6FA8",bg:"#DBEAFE"};
  if(score>=40) return{label:"Moyenne",color:C.amber,bg:C.amberBg};
  return{label:"Faible",color:C.red,bg:C.redBg};
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
function Sidebar({active,setActive,badge,onLogout,onChangePwd}) {
  const { user } = useAuth();
  const nav=[
    {id:"dashboard",ico:"◈",label:"Tableau de bord", roles:["agent","directeur","elu"]},
    {id:"logements",ico:"⌂",label:"Logements", roles:["agent","directeur"]},
    {id:"demandeurs",ico:"☰",label:"Demandeurs", roles:["agent","directeur"]},
    {id:"matching",ico:"⟷",label:"Matching", roles:["agent","directeur"]},
    {id:"cal",ico:"✦",label:"Prépa CAL", roles:["agent","directeur"]},
    {id:"audiences",ico:"⊛",label:"Audiences Élus", roles:["agent","directeur","elu"]},
    {id:"stats",ico:"📊",label:"Statistiques", roles:["agent","directeur","elu"]},
    {id:"import",ico:"⬇",label:"Import Pelehas", roles:["agent","directeur"]},
    {id:"notifications",ico:"🔔",label:"Notifications", badge, roles:["agent","directeur","elu"]},
    {id:"users",ico:"👤",label:"Utilisateurs", roles:["directeur"]},
    {id:"telegram",ico:"✈",label:"Telegram", roles:["directeur","agent"]},
    {id:"logs",ico:"📋",label:"Journal", roles:["directeur","agent"]},
  ].filter(n=>!user||n.roles.includes(user.role));

  const ROLE_LABEL = {agent:"Agent",directeur:"Directeur",elu:"Élu"};
  const ROLE_COLOR = {agent:"#1D6FA8",directeur:C.accent,elu:C.purple};

  return <div style={{width:210,minWidth:210,background:C.navy,display:"flex",
    flexDirection:"column",userSelect:"none"}}>
    <div style={{padding:"24px 18px 20px",borderBottom:`1px solid ${C.navyB}`}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:34,height:34,background:C.accent,borderRadius:8,display:"flex",
          alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,
          color:"#fff",fontFamily:F.h}}>C</div>
        <div>
          <div style={{color:"#fff",fontWeight:800,fontSize:14,fontFamily:F.h,
            letterSpacing:"-0.03em"}}>CAL Smart</div>
          <div style={{color:C.light,fontSize:10.5}}>Saint-Denis</div>
        </div>
      </div>
    </div>
    <nav style={{padding:"12px 8px",flex:1,overflowY:"auto"}}>
      {nav.map(n=>(
        <button key={n.id} onClick={()=>setActive(n.id)}
          style={{display:"flex",alignItems:"center",gap:10,width:"100%",
            padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",
            marginBottom:2,fontFamily:F.h,fontSize:12.5,
            fontWeight:active===n.id?700:400,
            background:active===n.id?C.accent:"transparent",
            color:active===n.id?"#fff":C.light,transition:"all .15s"}}>
          <span style={{fontSize:14}}>{n.ico}</span>
          {n.label}
          {n.badge>0&&<span style={{marginLeft:"auto",fontSize:10,background:C.red,
            color:"#fff",borderRadius:99,padding:"1px 6px",fontWeight:700}}>{n.badge}</span>}
        </button>
      ))}
    </nav>
    {/* User footer */}
    {user&&<div style={{padding:"12px 14px",borderTop:`1px solid ${C.navyB}`}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{width:28,height:28,borderRadius:"50%",
          background:ROLE_COLOR[user.role]||C.accent,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:12,fontWeight:800,color:"#fff",flexShrink:0}}>
          {user.prenom?.[0]}{user.nom?.[0]}
        </div>
        <div style={{minWidth:0}}>
          <div style={{color:"#fff",fontSize:11.5,fontWeight:600,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {user.prenom} {user.nom}</div>
          <div style={{fontSize:10,color:ROLE_COLOR[user.role],fontWeight:600}}>
            {ROLE_LABEL[user.role]||user.role}
            {user.secteur&&` · ${user.secteur}`}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={onChangePwd}
          style={{flex:1,padding:"5px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",
            background:"transparent",cursor:"pointer",fontSize:10,
            color:"rgba(255,255,255,0.4)",fontFamily:F.h,fontWeight:600}}>
          🔑 Mdp
        </button>
        <button onClick={onLogout}
          style={{flex:1,padding:"5px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",
            background:"transparent",cursor:"pointer",fontSize:10,
            color:"rgba(255,255,255,0.4)",fontFamily:F.h,fontWeight:600}}>
          ⎋ Quitter
        </button>
      </div>
    </div>}
  </div>;
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({setActive}) {
  const {data,loading} = useApi('/dashboard');
  if(loading) return <Spin/>;
  if(!data) return null;
  return <div style={{padding:28,fontFamily:F.b}}>
    <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
      margin:"0 0 4px",letterSpacing:"-0.03em"}}>Tableau de bord</h1>
    <p style={{color:C.muted,fontSize:12.5,marginBottom:22}}>Données en temps réel — Saint-Denis</p>
    <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      {[
        {label:"Demandeurs actifs",val:data.nb_demandeurs_actifs,color:C.accent},
        {label:"Logements dispon.",val:data.nb_logements_disponibles,color:"#1D6FA8"},
        {label:"Dossiers urgents",val:data.nb_urgents,color:C.red},
        {label:"Audiences enreg.",val:data.nb_audiences,color:C.purple},
        {label:"Attributions post-aud.",val:data.nb_attribues_post_audience,color:C.green},
        {label:"Notif. non lues",val:data.nb_notifications_non_lues,color:C.amber},
      ].map((k,i)=>(
        <div key={i} style={{background:C.card,borderRadius:12,padding:"14px 18px",
          border:`1px solid ${C.border}`,flex:"1 1 120px"}}>
          <div style={{fontSize:26,fontWeight:800,color:k.color,fontFamily:F.h,
            letterSpacing:"-0.04em"}}>{k.val}</div>
          <div style={{fontSize:11.5,color:C.muted,marginTop:2}}>{k.label}</div>
        </div>
      ))}
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`,flex:1}}>
        <div style={{fontFamily:F.h,fontSize:12,fontWeight:700,color:C.text,marginBottom:14}}>
          Tension par typologie</div>
        {Object.entries(data.tension_par_typ||{}).map(([typ,nb])=>{
          const max=Math.max(1,...Object.values(data.tension_par_typ));
          const col=nb/max>=0.8?C.red:nb/max>=0.5?C.amber:C.green;
          return <div key={typ} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontFamily:F.h,fontWeight:700,fontSize:11,width:28,color:C.text}}>{typ}</span>
            <div style={{flex:1,height:7,background:"#EEF1F6",borderRadius:99}}>
              <div style={{height:"100%",width:`${nb/max*100}%`,background:col,borderRadius:99}}/>
            </div>
            <span style={{fontSize:11,color:C.muted,width:20,textAlign:"right"}}>{nb}</span>
          </div>;
        })}
      </div>
      <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`,flex:1}}>
        <div style={{fontFamily:F.h,fontSize:12,fontWeight:700,color:C.text,marginBottom:14}}>
          Demandes par quartier</div>
        {(data.tension_par_quartier||[]).slice(0,6).map(({quartier,nb})=>(
          <div key={quartier} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:7}}>
            <span style={{fontSize:12,color:C.text}}>{quartier}</span>
            <span style={{fontSize:13,fontWeight:800,color:C.accent,fontFamily:F.h}}>{nb}</span>
          </div>
        ))}
      </div>
      <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`,flex:1}}>
        <div style={{fontFamily:F.h,fontSize:12,fontWeight:700,color:C.text,marginBottom:14}}>
          Actions rapides</div>
        {[
          {label:"→ Nouveau logement",color:C.accent,id:"logements"},
          {label:"→ Nouveau demandeur",color:"#1D6FA8",id:"demandeurs"},
          {label:"→ Lancer un matching",color:C.navy,id:"matching"},
          {label:"→ Nouvelle audience",color:C.purple,id:"audiences"},
        ].map(a=>(
          <button key={a.id} onClick={()=>setActive(a.id)}
            style={{display:"block",width:"100%",padding:"8px 14px",borderRadius:8,border:"none",
              background:a.color,color:"#fff",cursor:"pointer",fontFamily:F.h,
              fontSize:11.5,fontWeight:700,marginBottom:6,textAlign:"left"}}>
            {a.label}
          </button>
        ))}
        {data.delai_moyen_attribution&&(
          <div style={{marginTop:8,padding:"9px 12px",background:C.bg,borderRadius:8,
            fontSize:12,color:C.text}}>
            Délai moyen aud. → attribution : <b>{data.delai_moyen_attribution}j</b>
          </div>
        )}
      </div>
    </div>
  </div>;
}

// ─── LOGEMENTS ────────────────────────────────────────────────────────────────
function Logements({goMatch}) {
  const {data:logements,loading,reload} = useApi('/logements');
  const {data:ref} = useApi('/referentiels');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving] = useState(false);
  const blank={ref:"",bailleur:"",adresse:"",quartier:"",secteur:"",typ:"T3",
    surface:"",etage:"0",asc:false,rdc:false,pmr:false,
    loyer_hc:"",charges:"",plafond:"PLUS",dispo:"",contingent:"Ville"};
  const [form,setForm] = useState(blank);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  const submit=async()=>{
    if(!form.ref||!form.adresse) return alert("Référence et adresse obligatoires");
    setSaving(true);
    try {
      await api.post('/logements',{...form,surface:+form.surface,etage:+form.etage,
        loyer_hc:+form.loyer_hc,charges:+form.charges,loyer:+form.loyer_hc+(+form.charges)});
      setShowForm(false); setForm(blank); reload();
    } catch(e){alert('Erreur: '+e.message);}
    finally{setSaving(false);}
  };

  if(loading) return <Spin/>;
  return <div style={{padding:28,fontFamily:F.b}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
      <div>
        <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
          margin:"0 0 4px",letterSpacing:"-0.03em"}}>Logements disponibles</h1>
        <p style={{color:C.muted,fontSize:12.5}}>{logements?.length||0} logements vacants</p>
      </div>
      <button onClick={()=>setShowForm(true)}
        style={{padding:"10px 18px",background:C.accent,color:"#fff",border:"none",
          borderRadius:9,cursor:"pointer",fontFamily:F.h,fontSize:12.5,fontWeight:700}}>
        + Nouveau logement
      </button>
    </div>
    {(logements||[]).map(l=>(
      <div key={l.id} style={{background:C.card,borderRadius:12,padding:"16px 20px",
        border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:16,marginBottom:10}}>
        <div style={{width:48,height:48,background:C.accentL,borderRadius:9,display:"flex",
          alignItems:"center",justifyContent:"center",fontSize:18,fontFamily:F.h,
          fontWeight:800,color:C.accent}}>{l.typ}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:13.5,color:C.text,fontFamily:F.h}}>{l.adresse}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:1}}>
            {l.quartier} · {l.bailleur} · {l.surface} m²</div>
          <div style={{marginTop:5}}>
            <Tag text={l.contingent} color={C.accent} bg={C.accentL}/>
            <Tag text={l.plafond}/>
            {l.pmr&&<Tag text="PMR" color={C.green} bg={C.greenBg}/>}
            {l.rdc&&<Tag text="RDC" color="#1D6FA8" bg="#DBEAFE"/>}
            {l.asc&&<Tag text="Ascenseur"/>}
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:18,fontWeight:800,color:C.text,fontFamily:F.h}}>{l.loyer} €</div>
          <div style={{fontSize:11,color:C.muted}}>{l.loyer_hc}€ HC + {l.charges}€ ch.</div>
          <div style={{fontSize:11,color:C.muted}}>Dispo le {l.dispo}</div>
        </div>
        <button onClick={()=>goMatch(l)}
          style={{padding:"9px 16px",background:C.accent,color:"#fff",border:"none",
            borderRadius:8,cursor:"pointer",fontFamily:F.h,fontSize:12,fontWeight:700}}>
          Matcher →
        </button>
      </div>
    ))}
    {showForm&&<Modal title="Nouveau logement" onClose={()=>setShowForm(false)}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F2 label="Référence"><input style={inp} value={form.ref} onChange={set('ref')}/></F2>
        <F2 label="Bailleur">
          <select style={inp} value={form.bailleur} onChange={set('bailleur')}>
            <option value="">— Choisir —</option>
            {(ref?.bailleurs||[]).map(b=><option key={b}>{b}</option>)}
          </select>
        </F2>
        <F2 label="Adresse"><input style={{...inp,gridColumn:"1/-1"}} value={form.adresse} onChange={set('adresse')}/></F2>
        <F2 label="Quartier">
          <select style={inp} value={form.quartier} onChange={set('quartier')}>
            <option value="">—</option>
            {(ref?.quartiers||[]).map(q=><option key={q}>{q}</option>)}
          </select>
        </F2>
        <F2 label="Secteur">
          <select style={inp} value={form.secteur} onChange={set('secteur')}>
            <option value="">—</option>
            {(ref?.secteurs||[]).map(s=><option key={s}>{s}</option>)}
          </select>
        </F2>
        <F2 label="Typologie">
          <select style={inp} value={form.typ} onChange={set('typ')}>
            {["T1","T2","T3","T4","T5","T6"].map(t=><option key={t}>{t}</option>)}
          </select>
        </F2>
        <F2 label="Surface (m²)"><input style={inp} type="number" value={form.surface} onChange={set('surface')}/></F2>
        <F2 label="Étage"><input style={inp} type="number" value={form.etage} onChange={set('etage')}/></F2>
        <F2 label="Loyer HC (€)"><input style={inp} type="number" value={form.loyer_hc} onChange={set('loyer_hc')}/></F2>
        <F2 label="Charges (€)"><input style={inp} type="number" value={form.charges} onChange={set('charges')}/></F2>
        <F2 label="Plafond">
          <select style={inp} value={form.plafond} onChange={set('plafond')}>
            {["PLAI","PLUS","PLS"].map(t=><option key={t}>{t}</option>)}
          </select>
        </F2>
        <F2 label="Contingent">
          <select style={inp} value={form.contingent} onChange={set('contingent')}>
            {(ref?.contingents||[]).map(c=><option key={c}>{c}</option>)}
          </select>
        </F2>
        <F2 label="Date disponibilité">
          <input style={inp} value={form.dispo} placeholder="JJ/MM/AAAA" onChange={set('dispo')}/>
        </F2>
      </div>
      <div style={{display:"flex",gap:16,marginTop:10}}>
        {[["asc","Ascenseur"],["rdc","RDC"],["pmr","PMR adapté"]].map(([k,l])=>(
          <label key={k} style={{display:"flex",alignItems:"center",gap:6,
            fontSize:13,cursor:"pointer",color:form[k]?C.accent:C.text,fontWeight:form[k]?600:400}}>
            <input type="checkbox" checked={form[k]} onChange={set(k)}/>{l}
          </label>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={()=>setShowForm(false)} style={{padding:"9px 16px",border:`1px solid ${C.border}`,
          borderRadius:8,background:"transparent",cursor:"pointer",fontFamily:F.h,
          fontSize:12,fontWeight:600,color:C.muted}}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{padding:"9px 16px",background:C.accent,
          color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:F.h,
          fontSize:12,fontWeight:700}}>{saving?"Enregistrement…":"Enregistrer"}</button>
      </div>
    </Modal>}
  </div>;
}

// ─── DEMANDEURS ───────────────────────────────────────────────────────────────
function Demandeurs() {
  const {data:demandeurs,loading,reload} = useApi('/demandeurs');
  const {data:ref} = useApi('/referentiels');
  const {data:audiences} = useApi('/audiences');
  const [search,setSearch] = useState("");
  const [sel,setSel] = useState(null);
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving] = useState(false);

  const blank={nom:"",prenom:"",nud:"",anc:"0",adultes:"1",enfants:"0",
    compo:"",typ_v:"T3",typ_min:"T2",typ_max:"T4",secteurs:[],quartiers:[],
    rev:"0",sit:"",quartier_origine:"",pmr:false,rdc:false,violences:false,
    handicap:false,sans_log:false,expulsion:false,urgence:false,suroc:false,
    grossesse:false,dalo:false,mutation:false,prio_handicap:false,
    prio_expulsion:false,pieces:false,statut:"active"};
  const [form,setForm] = useState(blank);

  const filtered=useMemo(()=>(demandeurs||[]).filter(d=>
    `${d.nom} ${d.prenom} ${d.nud}`.toLowerCase().includes(search.toLowerCase())
  ),[demandeurs,search]);

  const selAud=useMemo(()=>(audiences||[]).filter(a=>a.dem_id===sel?.id),[audiences,sel]);

  const EV_C={"Demande créée":C.green,"Renouvellement":"#1D6FA8","Audience élu":C.purple,
    "DALO reconnu":C.red,"Dossier complété":C.green,"Matching":"#F0B429","Urgence expulsion":C.red};

  const toggleArr=(k,v)=>setForm(p=>({
    ...p,[k]:p[k].includes(v)?p[k].filter(x=>x!==v):[...p[k],v]
  }));

  const submit=async()=>{
    if(!form.nom||!form.prenom) return alert("Nom et prénom obligatoires");
    setSaving(true);
    try {
      await api.post('/demandeurs',{...form,anc:+form.anc,adultes:+form.adultes,
        enfants:+form.enfants,rev:+form.rev});
      setShowForm(false); setForm(blank); reload();
    } catch(e){alert('Erreur: '+e.message);}
    finally{setSaving(false);}
  };

  if(loading) return <Spin/>;

  const BOOLS=[
    ["pmr","PMR requis"],["rdc","RDC requis"],["violences","VIF"],["handicap","Handicap"],
    ["sans_log","Sans logement"],["expulsion","Expulsion"],["urgence","Urgence sociale"],
    ["suroc","Suroccupation"],["grossesse","Grossesse"],["dalo","DALO reconnu"],
    ["mutation","Mutation"],["prio_handicap","Prio. handicap"],
    ["prio_expulsion","Prio. expulsion"],["pieces","Dossier complet"],
  ];

  return <div style={{display:"flex",height:"100%",overflow:"hidden",fontFamily:F.b}}>
    <div style={{width:268,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
      <div style={{padding:12,borderBottom:`1px solid ${C.border}`,display:"flex",gap:8}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Rechercher…" style={{...inp,flex:1}}/>
        <button onClick={()=>setShowForm(true)}
          style={{padding:"7px 11px",background:C.accent,color:"#fff",border:"none",
            borderRadius:7,cursor:"pointer",fontFamily:F.h,fontSize:13,fontWeight:700}}>+</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:10}}>
        {filtered.map(d=>{
          const hasAud=(audiences||[]).some(a=>a.dem_id===d.id);
          return <button key={d.id} onClick={()=>setSel(d)}
            style={{display:"block",width:"100%",padding:"9px 12px",borderRadius:8,
              border:`2px solid ${sel?.id===d.id?C.accent:C.border}`,
              background:sel?.id===d.id?C.accentL:C.card,cursor:"pointer",
              textAlign:"left",marginBottom:6}}>
            <div style={{fontWeight:700,fontSize:12.5,fontFamily:F.h,
              color:sel?.id===d.id?C.accent:C.text}}>{d.nom} {d.prenom}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:1}}>{d.compo} · {d.anc} mois</div>
            <div style={{marginTop:4}}>
              <Tag text={d.typ_v}/>
              {d.dalo&&<Tag text="DALO" color={C.red} bg={C.redBg}/>}
              {hasAud&&<Tag text="⊛ Audience" color={C.purple} bg={C.purpleBg}/>}
              {!d.pieces&&<Tag text="Incomplet" color={C.amber} bg={C.amberBg}/>}
            </div>
          </button>;
        })}
        {filtered.length===0&&<div style={{textAlign:"center",color:C.muted,
          fontSize:12,padding:20}}>Aucun résultat</div>}
      </div>
    </div>

    <div style={{flex:1,overflowY:"auto",padding:24}}>
      {!sel?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",
          height:"80%",flexDirection:"column",color:C.muted}}>
          <div style={{fontSize:36,marginBottom:10}}>☰</div>
          <div style={{fontFamily:F.h,fontSize:15,fontWeight:700,color:C.text}}>
            Sélectionnez un demandeur</div>
          <div style={{fontSize:12,marginTop:6}}>ou cliquez sur + pour en créer un</div>
        </div>
      ):(
        <>
          <div style={{background:C.navy,borderRadius:12,padding:"16px 20px",
            marginBottom:18,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:46,height:46,background:C.accent,borderRadius:9,display:"flex",
              alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,
              color:"#fff",fontFamily:F.h}}>{sel.nom[0]}{sel.prenom[0]}</div>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:15,fontFamily:F.h}}>
                {sel.nom} {sel.prenom}</div>
              <div style={{color:C.light,fontSize:11.5,marginTop:1}}>
                {sel.nud||"—"} · {sel.sit||"—"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:"#fff",fontSize:15,fontWeight:700,fontFamily:F.h}}>
                {(sel.rev||0).toLocaleString()} €/mois</div>
              <div style={{color:C.light,fontSize:11}}>{sel.anc} mois d'ancienneté</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
            {[{l:"Composition",v:sel.compo},{l:"Typ.",v:`${sel.typ_min}→${sel.typ_v}→${sel.typ_max}`},
              {l:"Quartiers",v:(sel.quartiers||[]).join(", ")||"—"},{l:"Sit.",v:sel.sit||"—"}].map((f,i)=>(
              <div key={i} style={{background:C.card,borderRadius:9,padding:"10px 14px",
                border:`1px solid ${C.border}`,flex:"1 1 120px"}}>
                <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",
                  letterSpacing:"0.05em",fontWeight:700}}>{f.l}</div>
                <div style={{fontSize:12.5,fontWeight:600,color:C.text,marginTop:3}}>{f.v}</div>
              </div>
            ))}
          </div>
          <div style={{marginBottom:16,display:"flex",flexWrap:"wrap",gap:3}}>
            {sel.dalo&&<Pill label="DALO" color={C.red} bg={C.redBg}/>}
            {sel.violences&&<Pill label="VIF" color={C.red} bg={C.redBg}/>}
            {sel.sans_log&&<Pill label="Sans logement" color={C.red} bg={C.redBg}/>}
            {sel.prio_expulsion&&<Pill label="Expulsion" color={C.amber} bg={C.amberBg}/>}
            {sel.urgence&&<Pill label="Urgence" color={C.amber} bg={C.amberBg}/>}
            {sel.suroc&&<Pill label="Suroccupation" color={C.amber} bg={C.amberBg}/>}
            {sel.handicap&&<Pill label="Handicap" color={C.purple} bg={C.purpleBg}/>}
            {sel.grossesse&&<Pill label="Grossesse" color={C.teal} bg={C.tealBg}/>}
            {!sel.pieces&&<Pill label="⚠ Dossier incomplet" color={C.amber} bg={C.amberBg}/>}
          </div>
          {selAud.length>0&&(
            <div style={{background:C.card,borderRadius:12,padding:18,
              border:`2px solid ${C.purple}33`,marginBottom:16}}>
              <div style={{fontFamily:F.h,fontSize:11,fontWeight:700,color:C.purple,
                textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>
                ⊛ Audiences avec élus ({selAud.length})</div>
              {selAud.map(a=>(
                <div key={a.id} style={{padding:"9px 12px",borderRadius:8,
                  border:`1px solid ${C.border}`,marginBottom:7,
                  borderLeft:`3px solid ${a.favorable?C.green:C.amber}`}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.text}}>
                    {a.date_audience}
                    <span style={{color:C.muted,fontWeight:400,marginLeft:8}}>{a.objet}</span>
                  </div>
                  <div style={{fontSize:11.5,color:a.favorable?C.green:C.amber,marginTop:2}}>
                    {a.suite}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {a.statut}
                    {a.quartier_attribue&&<> · Attribué à <b>{a.quartier_attribue}</b></>}
                    {a.jours_audience_proposition&&<> · {a.jours_audience_proposition+(a.jours_proposition_attribution||0)}j</>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{background:C.card,borderRadius:12,padding:18,border:`1px solid ${C.border}`}}>
            <div style={{fontFamily:F.h,fontSize:11,fontWeight:700,color:C.muted,
              textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>
              Frise de parcours</div>
            <div style={{position:"relative",paddingLeft:22}}>
              <div style={{position:"absolute",left:7,top:6,bottom:6,width:2,background:C.border}}/>
              {(sel.parcours||[]).map((ev,i)=>{
                const col=EV_C[ev.type]||C.muted;
                return <div key={i} style={{position:"relative",
                  marginBottom:i===sel.parcours.length-1?0:16}}>
                  <div style={{position:"absolute",left:-19,top:3,width:10,height:10,
                    borderRadius:"50%",background:col,boxShadow:`0 0 0 3px white,0 0 0 4px ${col}`}}/>
                  <div style={{fontSize:10,color:C.muted}}>{ev.date}</div>
                  <div style={{fontSize:12.5,fontWeight:600,color:C.text}}>{ev.type}</div>
                  {ev.detail&&<div style={{fontSize:11.5,color:C.muted}}>{ev.detail}</div>}
                </div>;
              })}
              {(sel.parcours||[]).length===0&&
                <div style={{color:C.muted,fontSize:12}}>Aucun événement enregistré.</div>}
            </div>
          </div>
        </>
      )}
    </div>

    {showForm&&<Modal title="Nouveau demandeur" onClose={()=>setShowForm(false)} maxWidth={700}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F2 label="Nom *"><input style={inp} value={form.nom}
          onChange={e=>setForm(p=>({...p,nom:e.target.value.toUpperCase()}))}/></F2>
        <F2 label="Prénom *"><input style={inp} value={form.prenom}
          onChange={e=>setForm(p=>({...p,prenom:e.target.value}))}/></F2>
        <F2 label="NUD"><input style={inp} value={form.nud} placeholder="93284-AAAA-NNNNN"
          onChange={e=>setForm(p=>({...p,nud:e.target.value}))}/></F2>
        <F2 label="Ancienneté (mois)"><input style={inp} type="number" value={form.anc}
          onChange={e=>setForm(p=>({...p,anc:e.target.value}))}/></F2>
        <F2 label="Nb adultes"><input style={inp} type="number" value={form.adultes}
          onChange={e=>setForm(p=>({...p,adultes:e.target.value}))}/></F2>
        <F2 label="Nb enfants"><input style={inp} type="number" value={form.enfants}
          onChange={e=>setForm(p=>({...p,enfants:e.target.value}))}/></F2>
        <F2 label="Composition (détail)"><input style={inp} value={form.compo}
          placeholder="ex: Couple + 2 enfants"
          onChange={e=>setForm(p=>({...p,compo:e.target.value}))}/></F2>
        <F2 label="Revenu mensuel (€)"><input style={inp} type="number" value={form.rev}
          onChange={e=>setForm(p=>({...p,rev:e.target.value}))}/></F2>
        <F2 label="Typ. souhaitée">
          <select style={inp} value={form.typ_v} onChange={e=>setForm(p=>({...p,typ_v:e.target.value}))}>
            {["T1","T2","T3","T4","T5"].map(t=><option key={t}>{t}</option>)}
          </select>
        </F2>
        <F2 label="Typ. min / max">
          <div style={{display:"flex",gap:6}}>
            <select style={{...inp,flex:1}} value={form.typ_min} onChange={e=>setForm(p=>({...p,typ_min:e.target.value}))}>
              {["T1","T2","T3","T4","T5"].map(t=><option key={t}>{t}</option>)}
            </select>
            <select style={{...inp,flex:1}} value={form.typ_max} onChange={e=>setForm(p=>({...p,typ_max:e.target.value}))}>
              {["T1","T2","T3","T4","T5"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
        </F2>
        <F2 label="Situation actuelle">
          <select style={inp} value={form.sit} onChange={e=>setForm(p=>({...p,sit:e.target.value}))}>
            <option value="">— Choisir —</option>
            {(ref?.situations_logement||[]).map(s=><option key={s}>{s}</option>)}
          </select>
        </F2>
        <F2 label="Quartier d'origine">
          <select style={inp} value={form.quartier_origine}
            onChange={e=>setForm(p=>({...p,quartier_origine:e.target.value}))}>
            <option value="">— Choisir —</option>
            {(ref?.quartiers||[]).map(q=><option key={q}>{q}</option>)}
          </select>
        </F2>
      </div>
      <div style={{marginTop:12}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",
          letterSpacing:"0.05em",marginBottom:8}}>Quartiers souhaités</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {(ref?.quartiers||[]).map(q=>(
            <label key={q} style={{display:"flex",alignItems:"center",gap:0,
              cursor:"pointer",padding:"4px 10px",borderRadius:6,
              background:form.quartiers.includes(q)?C.accentL:C.bg,
              border:`1px solid ${form.quartiers.includes(q)?C.accent:C.border}`,
              fontSize:12,color:form.quartiers.includes(q)?C.accent:C.text,
              fontWeight:form.quartiers.includes(q)?600:400}}>
              <input type="checkbox" checked={form.quartiers.includes(q)}
                onChange={()=>toggleArr('quartiers',q)} style={{display:"none"}}/>
              {q}
            </label>
          ))}
        </div>
      </div>
      <div style={{marginTop:12}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",
          letterSpacing:"0.05em",marginBottom:8}}>Secteurs souhaités</div>
        <div style={{display:"flex",gap:6}}>
          {(ref?.secteurs||[]).map(s=>(
            <label key={s} style={{cursor:"pointer",padding:"4px 12px",borderRadius:6,
              background:form.secteurs.includes(s)?C.purpleBg:C.bg,
              border:`1px solid ${form.secteurs.includes(s)?C.purple:C.border}`,
              fontSize:12,color:form.secteurs.includes(s)?C.purple:C.text,
              fontWeight:form.secteurs.includes(s)?600:400}}>
              <input type="checkbox" checked={form.secteurs.includes(s)}
                onChange={()=>toggleArr('secteurs',s)} style={{display:"none"}}/>
              {s}
            </label>
          ))}
        </div>
      </div>
      <div style={{marginTop:14,display:"flex",flexWrap:"wrap",gap:10}}>
        {BOOLS.map(([k,l])=>(
          <label key={k} style={{display:"flex",alignItems:"center",gap:6,
            fontSize:12,cursor:"pointer",
            color:form[k]?C.accent:C.text,fontWeight:form[k]?600:400}}>
            <input type="checkbox" checked={!!form[k]}
              onChange={e=>setForm(p=>({...p,[k]:e.target.checked}))}/>
            {l}
          </label>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={()=>setShowForm(false)} style={{padding:"9px 16px",
          border:`1px solid ${C.border}`,borderRadius:8,background:"transparent",
          cursor:"pointer",fontFamily:F.h,fontSize:12,fontWeight:600,color:C.muted}}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{padding:"9px 16px",
          background:C.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",
          fontFamily:F.h,fontSize:12,fontWeight:700}}>
          {saving?"Enregistrement…":"Enregistrer le demandeur"}
        </button>
      </div>
    </Modal>}
  </div>;
}

// ─── MATCHING ─────────────────────────────────────────────────────────────────
function Matching({initLog,addToCAL}) {
  const {data:logements,loading:loadLog} = useApi('/logements');
  const [selLog,setSelLog] = useState(initLog||null);
  const [results,setResults] = useState(null);
  const [matching,setMatching] = useState(false);

  const doMatch=useCallback(async(log)=>{
    setSelLog(log); setResults(null); setMatching(true);
    try { setResults(await api.get(`/matching/${log.id}`)); }
    catch(e){ alert('Erreur matching: '+e.message); }
    finally{ setMatching(false); }
  },[]);

  useEffect(()=>{ if(initLog) doMatch(initLog); },[initLog?.id]);

  if(loadLog) return <Spin/>;

  return <div style={{display:"flex",height:"100%",overflow:"hidden",fontFamily:F.b}}>
    <div style={{width:248,minWidth:248,background:C.card,borderRight:`1px solid ${C.border}`,
      overflowY:"auto",padding:14}}>
      <div style={{fontFamily:F.h,fontSize:11,fontWeight:700,color:C.muted,
        textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Logement</div>
      {(logements||[]).map(l=>(
        <button key={l.id} onClick={()=>doMatch(l)}
          style={{display:"block",width:"100%",padding:"11px 13px",borderRadius:9,
            border:`2px solid ${selLog?.id===l.id?C.accent:C.border}`,
            background:selLog?.id===l.id?C.accentL:"transparent",
            cursor:"pointer",textAlign:"left",marginBottom:8}}>
          <div style={{fontFamily:F.h,fontWeight:700,fontSize:13,
            color:selLog?.id===l.id?C.accent:C.text}}>{l.typ} — {l.quartier}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{l.adresse}</div>
          <div style={{fontSize:11,color:C.muted}}>{l.loyer} €/mois · {l.surface} m²</div>
        </button>
      ))}
    </div>
    <div style={{flex:1,overflowY:"auto",padding:22}}>
      {!selLog&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",height:"80%",color:C.muted}}>
        <div style={{fontSize:44,marginBottom:14}}>⟷</div>
        <div style={{fontFamily:F.h,fontSize:18,fontWeight:700,color:C.text}}>
          Sélectionnez un logement</div>
        <div style={{fontSize:12.5,marginTop:6}}>Le moteur de score s'exécute côté serveur</div>
      </div>}
      {matching&&<Spin/>}
      {results&&!matching&&<>
        <div style={{background:C.navy,borderRadius:12,padding:"14px 18px",marginBottom:18,
          display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:46,height:46,background:C.accent,borderRadius:8,display:"flex",
            alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,
            color:"#fff",fontFamily:F.h}}>{results.logement.typ}</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:14,fontFamily:F.h}}>
              {results.logement.adresse}</div>
            <div style={{color:C.light,fontSize:11.5,marginTop:2}}>
              {results.logement.quartier} · {results.logement.bailleur} · {results.logement.surface} m²</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"#fff",fontSize:19,fontWeight:800,fontFamily:F.h}}>
              {results.logement.loyer} €</div>
            <div style={{color:C.light,fontSize:11}}>{results.logement.contingent}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:18,alignItems:"center"}}>
          {[
            {label:"Éligibles",val:results.stats.nb_eligible,color:C.green},
            {label:"Top 4",val:Math.min(4,results.stats.nb_eligible),color:C.accent},
            {label:"Avec audience",val:results.stats.nb_avec_audience,color:C.purple},
            {label:"Non éligibles",val:results.stats.nb_ineligible,color:C.red},
          ].map((s,i)=>(
            <div key={i} style={{background:C.card,borderRadius:8,padding:"9px 14px",
              border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:800,color:s.color,fontFamily:F.h}}>{s.val}</div>
              <div style={{fontSize:10.5,color:C.muted}}>{s.label}</div>
            </div>
          ))}
          <div style={{flex:1}}/>
          <button onClick={()=>addToCAL(results.logement,results.top4)}
            style={{padding:"9px 18px",background:C.accent,color:"#fff",border:"none",
              borderRadius:8,cursor:"pointer",fontFamily:F.h,fontWeight:700,fontSize:12.5}}>
            Envoyer top 4 → CAL
          </button>
        </div>
        {(results.eligible||[]).map((x,i)=>{
          const adq=adequation(x.res.total); const isTop4=i<4;
          return <div key={x.dem.id} style={{background:C.card,borderRadius:11,
            border:`1px solid ${isTop4?C.accent:C.border}`,marginBottom:8,
            padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:32,height:32,borderRadius:7,flexShrink:0,
              background:isTop4?C.accent:"#EEF1F6",display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:14,fontWeight:800,fontFamily:F.h,
              color:isTop4?"#fff":C.muted}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:C.text,fontFamily:F.h}}>
                {x.dem.nom} {x.dem.prenom}</div>
              <div style={{fontSize:11.5,color:C.muted,marginTop:1}}>
                {x.dem.compo} · {x.dem.anc} mois · {x.dem.sit}</div>
              <div style={{marginTop:4}}>
                <Pill label={adq.label} color={adq.color} bg={adq.bg}/>
                {x.dem.dalo&&<Pill label="DALO" color={C.red} bg={C.redBg}/>}
                {x.dem.violences&&<Pill label="VIF" color={C.red} bg={C.redBg}/>}
                {x.dem.sans_log&&<Pill label="SDF" color={C.red} bg={C.redBg}/>}
                {x.res.biais?.bonus>0&&<Pill label={`▲ +${x.res.biais.bonus}`} color={C.teal} bg={C.tealBg}/>}
                {x.res.biais?.malus>0&&<Pill label={`▼ −${x.res.biais.malus}`} color={C.amber} bg={C.amberBg}/>}
              </div>
            </div>
            <div style={{textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:10,color:C.muted}}>Score</div>
              <div style={{fontSize:26,fontWeight:800,color:adq.color,fontFamily:F.h}}>
                {x.res.total}</div>
              {x.res.base!==x.res.total&&<div style={{fontSize:9,color:C.muted}}>base {x.res.base}</div>}
            </div>
            <div style={{textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:700,fontFamily:F.h,
                color:parseFloat(x.res.te)<=30?C.green:parseFloat(x.res.te)<=35?C.amber:C.red}}>
                {x.res.te}%</div>
              <div style={{fontSize:10,color:C.muted}}>effort</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text,fontFamily:F.h}}>
                {(x.dem.rev||0).toLocaleString()} €</div>
              <div style={{fontSize:10,color:C.muted}}>rev./mois</div>
            </div>
          </div>;
        })}
        {results.ineligible?.length>0&&<>
          <div style={{fontFamily:F.h,fontSize:10.5,fontWeight:700,color:C.red,
            textTransform:"uppercase",letterSpacing:"0.07em",margin:"14px 0 8px"}}>
            Non éligibles ({results.ineligible.length})</div>
          {results.ineligible.map(x=>(
            <div key={x.dem.id} style={{background:C.card,borderRadius:8,padding:"9px 14px",
              border:`1px solid ${C.border}`,display:"flex",alignItems:"center",
              gap:12,marginBottom:5,opacity:0.6}}>
              <div style={{flex:1,fontSize:12,fontWeight:600,color:C.text}}>
                {x.dem.nom} {x.dem.prenom}</div>
              {(x.res.excl||[]).map((e,i)=><Pill key={i} label={e} color={C.red} bg={C.redBg}/>)}
            </div>
          ))}
        </>}
      </>}
    </div>
  </div>;
}

// ─── CAL ─────────────────────────────────────────────────────────────────────
const MOTIFS_REFUS=["Inadéquation ressources / loyer","Composition familiale incompatible",
  "Logement non adapté au handicap","Secteur non souhaité par le candidat",
  "Candidat a refusé la proposition","Dossier incomplet au moment de la commission",
  "Candidat déjà attributaire","Logement retiré par le bailleur",
  "Priorité accordée à un public DALO","Décision reportée — dossier à compléter"];
const STATUTS_POST=["En attente réponse candidat","Accepté","Refusé par candidat",
  "Refusé par bailleur","Bail signé","Entrée dans les lieux","Sans suite"];

function CALPrepa({dossiers}) {
  const [decisions,setDecisions]=useState({});
  const [postCAL,setPostCAL]=useState({});
  const [tab,setTab]=useState("commission");
  const dk=(d,c)=>`${d.logement.id}-${c.dem.id}`;

  if(!dossiers.length) return <div style={{padding:28,fontFamily:F.b}}>
    <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
      margin:"0 0 24px",letterSpacing:"-0.03em"}}>Préparation CAL</h1>
    <div style={{background:C.card,borderRadius:12,padding:32,border:`1px solid ${C.border}`,
      textAlign:"center",color:C.muted}}>
      <div style={{fontSize:32,marginBottom:10}}>✦</div>
      <div style={{fontFamily:F.h,fontSize:15,fontWeight:700,color:C.text}}>Aucun dossier</div>
      <div style={{fontSize:12.5,marginTop:5}}>Lancez un matching et envoyez le top 4 en CAL.</div>
    </div>
  </div>;

  return <div style={{padding:28,fontFamily:F.b}}>
    <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
      margin:"0 0 4px",letterSpacing:"-0.03em"}}>Préparation CAL</h1>
    <p style={{color:C.muted,fontSize:12.5,marginBottom:18}}>
      {dossiers.length} logement(s) en commission</p>
    <div style={{display:"flex",gap:2,marginBottom:20,background:C.bg,
      borderRadius:10,padding:4,width:"fit-content"}}>
      {[{id:"commission",label:"Commission"},{id:"post",label:"Suivi post-CAL"}].map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)}
          style={{padding:"8px 18px",borderRadius:8,border:"none",cursor:"pointer",
            fontFamily:F.h,fontSize:12,fontWeight:tab===t.id?700:500,
            background:tab===t.id?C.card:"transparent",color:tab===t.id?C.text:C.muted,
            boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{t.label}</button>
      ))}
    </div>

    {tab==="commission"&&dossiers.map(d=>(
      <div key={d.logement.id} style={{background:C.card,borderRadius:13,
        border:`1px solid ${C.border}`,marginBottom:24,overflow:"hidden"}}>
        <div style={{background:C.navy,padding:"13px 18px",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:40,height:40,background:C.accent,borderRadius:7,display:"flex",
            alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,
            color:"#fff",fontFamily:F.h}}>{d.logement.typ}</div>
          <div style={{flex:1}}>
            <div style={{color:"#fff",fontWeight:700,fontFamily:F.h,fontSize:13.5}}>
              {d.logement.adresse}</div>
            <div style={{color:C.light,fontSize:11,marginTop:1}}>
              {d.logement.quartier} · {d.logement.bailleur}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"#fff",fontWeight:800,fontFamily:F.h,fontSize:17}}>
              {d.logement.loyer} €/mois</div>
            <div style={{color:C.light,fontSize:11}}>{d.logement.ref} · {d.logement.contingent}</div>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:C.bg}}>
                {["#","Candidat","Composition","Revenu","Effort","Score","Priorités","Décision","Motif CALEOL"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:10,
                    fontWeight:700,color:C.muted,textTransform:"uppercase",
                    letterSpacing:"0.05em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.candidats||[]).map((c,i)=>{
                const adq=adequation(c.res.total);
                const k=dk(d,c);
                return <tr key={c.dem.id} style={{borderBottom:`1px solid ${C.border}`,
                  background:i===0?"#FFFAF7":"transparent"}}>
                  <td style={{padding:"9px 12px"}}>
                    <div style={{width:24,height:24,borderRadius:5,
                      background:i===0?C.accent:C.bg,display:"flex",alignItems:"center",
                      justifyContent:"center",fontSize:12,fontWeight:800,fontFamily:F.h,
                      color:i===0?"#fff":C.muted}}>{i+1}</div>
                  </td>
                  <td style={{padding:"9px 12px"}}>
                    <div style={{fontWeight:700,color:C.text,fontFamily:F.h}}>
                      {c.dem.nom} {c.dem.prenom}</div>
                    <div style={{fontSize:10,color:C.muted}}>{c.dem.nud}</div>
                  </td>
                  <td style={{padding:"9px 12px",color:C.text}}>{c.dem.compo}</td>
                  <td style={{padding:"9px 12px",fontWeight:600}}>
                    {(c.dem.rev||0).toLocaleString()} €</td>
                  <td style={{padding:"9px 12px"}}>
                    <span style={{fontWeight:700,
                      color:parseFloat(c.res.te)<=30?C.green:parseFloat(c.res.te)<=35?C.amber:C.red}}>
                      {c.res.te}%</span>
                  </td>
                  <td style={{padding:"9px 12px"}}>
                    <span style={{fontWeight:800,fontSize:15,color:adq.color,fontFamily:F.h}}>
                      {c.res.total}</span>
                    {c.res.base!==c.res.total&&
                      <span style={{fontSize:9,color:C.muted}}> (base {c.res.base})</span>}
                  </td>
                  <td style={{padding:"9px 12px"}}>
                    {c.dem.dalo&&<Pill label="DALO" color={C.red} bg={C.redBg}/>}
                    {c.dem.violences&&<Pill label="VIF" color={C.red} bg={C.redBg}/>}
                    {c.dem.sans_log&&<Pill label="SDF" color={C.red} bg={C.redBg}/>}
                    {c.dem.prio_expulsion&&<Pill label="Expulsion" color={C.amber} bg={C.amberBg}/>}
                    {!c.dem.dalo&&!c.dem.violences&&!c.dem.sans_log&&!c.dem.prio_expulsion&&
                      <span style={{color:C.muted,fontSize:11}}>—</span>}
                  </td>
                  <td style={{padding:"9px 12px"}}>
                    <select value={decisions[k]||""} onChange={e=>setDecisions(p=>({...p,[k]:e.target.value}))}
                      style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${C.border}`,
                        fontFamily:F.b,fontSize:11,color:C.text,background:C.card}}>
                      <option value="">— Décision —</option>
                      {["Retenu rang 1","Retenu rang 2","Retenu rang 3","Retenu rang 4",
                        "Suppléant","Ajourné","Refusé"].map(v=><option key={v}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"9px 12px"}}>
                    {(decisions[k]||"").match(/Refusé|Ajourné/)?(
                      <select value={decisions[k+"m"]||""} onChange={e=>setDecisions(p=>({...p,[k+"m"]:e.target.value}))}
                        style={{padding:"4px 7px",borderRadius:6,border:`1px solid ${C.amber}`,
                          fontFamily:F.b,fontSize:11,color:C.text,background:C.card,maxWidth:190}}>
                        <option value="">— Motif CALEOL —</option>
                        {MOTIFS_REFUS.map(m=><option key={m}>{m}</option>)}
                      </select>
                    ):<span style={{color:C.muted,fontSize:11}}>—</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div style={{padding:"11px 18px",borderTop:`1px solid ${C.border}`,
          display:"flex",justifyContent:"flex-end",gap:8}}>
          <button onClick={()=>{
            const a=document.createElement('a');
            a.href=`/api/cal/pdf/${d.logement.id}`;
            a.download=`Fiche_CAL_${d.logement.ref}.pdf`;
            a.click();
          }} style={{padding:"7px 14px",border:`1px solid ${C.border}`,borderRadius:7,
            background:"transparent",cursor:"pointer",fontFamily:F.h,
            fontSize:11.5,fontWeight:600,color:C.muted}}>⬇ Exporter PDF</button>
          <button style={{padding:"7px 14px",border:"none",borderRadius:7,
            background:C.accent,cursor:"pointer",fontFamily:F.h,
            fontSize:11.5,fontWeight:700,color:"#fff"}}>Valider →</button>
        </div>
      </div>
    ))}

    {tab==="post"&&dossiers.map(d=>(d.candidats||[]).slice(0,2).map((c,i)=>{
      const pk=`post-${d.logement.id}-${c.dem.id}`;
      const statut=postCAL[pk]||"";
      const col=statut==="Bail signé"||statut==="Entrée dans les lieux"?C.green:
        statut==="Accepté"?"#1D6FA8":statut.includes("Refusé")?C.red:C.amber;
      return <div key={pk} style={{background:C.card,borderRadius:11,padding:"14px 18px",
        border:`1px solid ${C.border}`,marginBottom:10,
        display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:28,height:28,borderRadius:6,
          background:i===0?C.accent:C.bg,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:13,fontWeight:800,fontFamily:F.h,
          color:i===0?"#fff":C.muted,flexShrink:0}}>{i+1}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:13,color:C.text,fontFamily:F.h}}>
            {c.dem.nom} {c.dem.prenom}
            <span style={{fontSize:11,color:C.muted,fontWeight:400,marginLeft:8}}>
              {d.logement.typ} · {d.logement.quartier}</span>
          </div>
          <div style={{fontSize:11.5,color:C.muted}}>{c.dem.compo}</div>
        </div>
        <select value={postCAL[pk]||""} onChange={e=>setPostCAL(p=>({...p,[pk]:e.target.value}))}
          style={{padding:"5px 9px",borderRadius:7,border:`1px solid ${C.border}`,
            fontFamily:F.b,fontSize:11,color:C.text,background:C.card}}>
          <option value="">— Statut post-CAL —</option>
          {STATUTS_POST.map(s=><option key={s}>{s}</option>)}
        </select>
        {statut&&<span style={{fontSize:11,fontWeight:600,color:col,minWidth:80}}>{statut}</span>}
      </div>;
    }))}
  </div>;
}

// ─── AUDIENCES ────────────────────────────────────────────────────────────────
function AudiencesElus() {
  const {data:audiences,loading,reload} = useApi('/audiences');
  const {data:elus} = useApi('/elus');
  const {data:demandeurs} = useApi('/demandeurs');
  const {data:ref} = useApi('/referentiels');
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const blank={dem_id:"",elu_id:"",date_audience:"",quartier_origine:"",
    quartier_elu:"",quartier_souhaite:"",objet:"",favorable:false,suite:"",
    statut:"En attente proposition"};
  const [form,setForm]=useState(blank);
  const set=k=>e=>setForm(p=>({...p,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  const QCOLS={"Floréal":"#E05C2A","Centre-ville":"#1D6FA8","Franc-Moisin":"#16A34A",
    "La Plaine":"#7C3AED","Cosmonautes":"#D97706"};
  const qCol=q=>QCOLS[q]||C.muted;
  const qBg=q=>`${qCol(q)}15`;

  const submit=async()=>{
    if(!form.dem_id||!form.elu_id||!form.date_audience) return alert("Demandeur, élu et date obligatoires");
    setSaving(true);
    try { await api.post('/audiences',form); setShowForm(false); setForm(blank); reload(); }
    catch(e){alert('Erreur: '+e.message);}
    finally{setSaving(false);}
  };

  if(loading) return <Spin/>;
  const attribues=(audiences||[]).filter(a=>a.statut==="Attribué");
  const favorables=(audiences||[]).filter(a=>a.favorable);

  return <div style={{padding:28,fontFamily:F.b}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div>
        <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
          margin:"0 0 4px",letterSpacing:"-0.03em"}}>⊛ Audiences Élus</h1>
        <p style={{color:C.muted,fontSize:12.5}}>
          {audiences?.length||0} audiences · {favorables.length} favorables · {attribues.length} attributions</p>
      </div>
      <button onClick={()=>setShowForm(true)}
        style={{padding:"10px 18px",background:C.purple,color:"#fff",border:"none",
          borderRadius:9,cursor:"pointer",fontFamily:F.h,fontSize:12.5,fontWeight:700}}>
        + Nouvelle audience
      </button>
    </div>
    <div style={{display:"flex",gap:12,marginBottom:20}}>
      {[{l:"Audiences",v:audiences?.length||0,c:C.purple},
        {l:"Favorables",v:favorables.length,c:C.green},
        {l:"Attribuées",v:attribues.length,c:C.accent}].map((k,i)=>(
        <div key={i} style={{background:C.card,borderRadius:11,padding:"13px 18px",
          border:`1px solid ${C.border}`,flex:"1 1 100px"}}>
          <div style={{fontSize:24,fontWeight:800,color:k.c,fontFamily:F.h}}>{k.v}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{k.l}</div>
        </div>
      ))}
    </div>
    <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{background:C.bg}}>
              {["Date","Demandeur","Élu","Q. origine","Q. souhaité","Q. attribué","Objet","Favorable","Statut"].map(h=>(
                <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:10,
                  fontWeight:700,color:C.muted,textTransform:"uppercase",
                  letterSpacing:"0.05em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(audiences||[]).map(a=>{
              const dem=(demandeurs||[]).find(d=>d.id===a.dem_id);
              const elu=(elus||[]).find(e=>e.id===a.elu_id);
              return <tr key={a.id} style={{borderBottom:`1px solid ${C.border}`}}>
                <td style={{padding:"9px 12px",color:C.muted,whiteSpace:"nowrap"}}>{a.date_audience}</td>
                <td style={{padding:"9px 12px"}}>
                  <div style={{fontWeight:700,color:C.text,fontFamily:F.h,fontSize:12}}>
                    {dem?`${dem.nom} ${dem.prenom}`:a.dem_id}</div>
                </td>
                <td style={{padding:"9px 12px"}}>
                  <span style={{fontSize:11,color:C.purple,fontWeight:600}}>{elu?.nom||a.elu_id}</span>
                </td>
                <td style={{padding:"9px 12px"}}>
                  <Tag text={a.quartier_origine||"—"} color={qCol(a.quartier_origine)} bg={qBg(a.quartier_origine)}/>
                </td>
                <td style={{padding:"9px 12px"}}>
                  <Tag text={a.quartier_souhaite||"—"} color={qCol(a.quartier_souhaite)} bg={qBg(a.quartier_souhaite)}/>
                </td>
                <td style={{padding:"9px 12px"}}>
                  {a.quartier_attribue
                    ?<Tag text={a.quartier_attribue} color={qCol(a.quartier_attribue)} bg={qBg(a.quartier_attribue)}/>
                    :<span style={{color:C.muted}}>—</span>}
                </td>
                <td style={{padding:"9px 12px",color:C.text,maxWidth:160}}>
                  <div style={{fontSize:11,lineHeight:1.4}}>{a.objet}</div>
                </td>
                <td style={{padding:"9px 12px"}}>
                  <span style={{fontSize:11,color:a.favorable?C.green:C.amber,fontWeight:600}}>
                    {a.favorable?"✓ Oui":"△ Non"}</span>
                </td>
                <td style={{padding:"9px 12px"}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:600,
                    background:a.statut==="Attribué"?C.greenBg:C.amberBg,
                    color:a.statut==="Attribué"?C.green:C.amber}}>{a.statut}</span>
                </td>
              </tr>;
            })}
            {(audiences||[]).length===0&&<tr><td colSpan={9} style={{padding:24,
              textAlign:"center",color:C.muted,fontSize:12}}>
              Aucune audience enregistrée. Cliquez sur + pour commencer.
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    {showForm&&<Modal title="Nouvelle audience élu" onClose={()=>setShowForm(false)}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F2 label="Demandeur *">
          <select style={inp} value={form.dem_id} onChange={set('dem_id')}>
            <option value="">— Choisir —</option>
            {(demandeurs||[]).map(d=>(
              <option key={d.id} value={d.id}>{d.nom} {d.prenom}</option>
            ))}
          </select>
        </F2>
        <F2 label="Élu *">
          <select style={inp} value={form.elu_id} onChange={set('elu_id')}>
            <option value="">— Choisir —</option>
            {(elus||[]).map(e=>(
              <option key={e.id} value={e.id}>{e.nom} — {e.secteur}</option>
            ))}
          </select>
        </F2>
        <F2 label="Date *">
          <input style={inp} value={form.date_audience} placeholder="JJ/MM/AAAA" onChange={set('date_audience')}/>
        </F2>
        <F2 label="Quartier de l'élu">
          <select style={inp} value={form.quartier_elu} onChange={set('quartier_elu')}>
            <option value="">—</option>
            {(ref?.quartiers||[]).map(q=><option key={q}>{q}</option>)}
          </select>
        </F2>
        <F2 label="Quartier d'origine">
          <select style={inp} value={form.quartier_origine} onChange={set('quartier_origine')}>
            <option value="">—</option>
            {(ref?.quartiers||[]).map(q=><option key={q}>{q}</option>)}
          </select>
        </F2>
        <F2 label="Quartier souhaité">
          <select style={inp} value={form.quartier_souhaite} onChange={set('quartier_souhaite')}>
            <option value="">—</option>
            {(ref?.quartiers||[]).map(q=><option key={q}>{q}</option>)}
          </select>
        </F2>
        <F2 label="Objet de l'audience">
          <input style={inp} value={form.objet}
            placeholder="ex: Suroccupation — T3 urgent" onChange={set('objet')}/>
        </F2>
        <F2 label="Suite donnée">
          <input style={inp} value={form.suite}
            placeholder="ex: Instruction renforcée" onChange={set('suite')}/>
        </F2>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,
        cursor:"pointer",marginTop:12,color:form.favorable?C.green:C.text,
        fontWeight:form.favorable?600:400}}>
        <input type="checkbox" checked={form.favorable} onChange={set('favorable')}/>
        Audience favorable — instruction renforcée
      </label>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
        <button onClick={()=>setShowForm(false)} style={{padding:"9px 16px",
          border:`1px solid ${C.border}`,borderRadius:8,background:"transparent",
          cursor:"pointer",fontFamily:F.h,fontSize:12,fontWeight:600,color:C.muted}}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{padding:"9px 16px",
          background:C.purple,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",
          fontFamily:F.h,fontSize:12,fontWeight:700}}>
          {saving?"Enregistrement…":"Enregistrer l'audience"}
        </button>
      </div>
    </Modal>}
  </div>;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function Notifications() {
  const {data:notifications,loading,reload} = useApi('/notifications');
  const {data:elus} = useApi('/elus');
  const {data:demandeurs} = useApi('/demandeurs');
  const [selElu,setSelElu]=useState("all");
  const [typeFilter,setTypeFilter]=useState("all");

  const markLu=async(id)=>{ await api.put(`/notifications/${id}/lu`,{}); reload(); };
  const markAll=async()=>{ await api.put('/notifications/tout-marquer-lu',selElu!=="all"?{elu_id:selElu}:{}); reload(); };

  const TYPE={
    attribution_audience:{label:"Attribution",color:C.green,bg:C.greenBg,ico:"🏠"},
    urgence_territoire:{label:"Urgence",color:C.red,bg:C.redBg,ico:"⚠"},
    cal_a_venir:{label:"CAL",color:C.accent,bg:C.accentL,ico:"✦"},
    nouvelle_demande:{label:"Nouvelle dem.",color:"#1D6FA8",bg:"#DBEAFE",ico:"📋"},
    digest:{label:"Digest",color:C.muted,bg:C.bg,ico:"📊"},
  };

  const filtered=(notifications||[])
    .filter(n=>selElu==="all"||n.elu_id===selElu)
    .filter(n=>typeFilter==="all"||n.type===typeFilter);

  const nonLus=filtered.filter(n=>!n.lu).length;
  const eluStats=(elus||[]).map(e=>{
    const nn=(notifications||[]).filter(n=>n.elu_id===e.id);
    return{...e,nb:nn.length,nonLu:nn.filter(n=>!n.lu).length};
  });

  if(loading) return <Spin/>;

  return <div style={{padding:28,fontFamily:F.b}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
      <div>
        <h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
          margin:"0 0 4px",letterSpacing:"-0.03em"}}>🔔 Notifications Élus</h1>
        <p style={{color:C.muted,fontSize:12.5}}>Alertes territoire · attributions · digest</p>
      </div>
      {nonLus>0&&<button onClick={markAll} style={{padding:"8px 16px",
        border:`1px solid ${C.border}`,borderRadius:8,background:"transparent",
        cursor:"pointer",fontFamily:F.h,fontSize:12,fontWeight:600,color:C.muted}}>
        Tout marquer comme lu ({nonLus})
      </button>}
    </div>
    <div style={{display:"flex",gap:16}}>
      <div style={{width:200,minWidth:200,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontFamily:F.h,fontSize:10,fontWeight:700,color:C.muted,
          textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Par élu</div>
        <button onClick={()=>setSelElu("all")}
          style={{padding:"8px 12px",borderRadius:8,border:`2px solid ${selElu==="all"?C.navy:C.border}`,
            background:selElu==="all"?C.navy:"transparent",cursor:"pointer",textAlign:"left",
            fontFamily:F.h,fontSize:12,fontWeight:600,color:selElu==="all"?"#fff":C.text}}>
          Tous <span style={{float:"right",fontSize:10,opacity:0.7}}>{notifications?.length||0}</span>
        </button>
        {eluStats.map(e=>(
          <button key={e.id} onClick={()=>setSelElu(e.id)}
            style={{padding:"8px 12px",borderRadius:8,textAlign:"left",cursor:"pointer",
              border:`2px solid ${selElu===e.id?C.purple:C.border}`,
              background:selElu===e.id?C.purpleBg:"transparent",fontFamily:F.h,fontSize:12}}>
            <div style={{fontWeight:700,color:selElu===e.id?C.purple:C.text}}>
              {e.nom}
              {e.nonLu>0&&<span style={{float:"right",fontSize:10,background:C.red,
                color:"#fff",padding:"1px 6px",borderRadius:99}}>{e.nonLu}</span>}
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:1}}>{e.secteur} · {e.nb} notif.</div>
          </button>
        ))}
        <div style={{fontFamily:F.h,fontSize:10,fontWeight:700,color:C.muted,
          textTransform:"uppercase",letterSpacing:"0.07em",marginTop:8,marginBottom:4}}>Type</div>
        {[{id:"all",label:"Tous"},...Object.entries(TYPE).map(([id,{label}])=>({id,label}))].map(t=>(
          <button key={t.id} onClick={()=>setTypeFilter(t.id)}
            style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${typeFilter===t.id?C.accent:C.border}`,
              background:typeFilter===t.id?C.accentL:"transparent",cursor:"pointer",
              textAlign:"left",fontFamily:F.b,fontSize:11.5,
              fontWeight:typeFilter===t.id?600:400,color:typeFilter===t.id?C.accent:C.text}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{flex:1}}>
        {filtered.length===0&&<div style={{background:C.card,borderRadius:12,padding:32,
          border:`1px solid ${C.border}`,textAlign:"center",color:C.muted}}>
          <div style={{fontSize:30,marginBottom:10}}>🔔</div>
          <div style={{fontFamily:F.h,fontSize:14,fontWeight:700,color:C.text}}>Aucune notification</div>
        </div>}
        {filtered.map(n=>{
          const meta=TYPE[n.type]||TYPE.digest;
          const dem=n.dem_id?(demandeurs||[]).find(d=>d.id===n.dem_id):null;
          const elu=(elus||[]).find(e=>e.id===n.elu_id);
          return <div key={n.id} onClick={()=>!n.lu&&markLu(n.id)}
            style={{background:C.card,borderRadius:11,padding:"14px 18px",
              border:`1px solid ${n.lu?C.border:meta.color}`,marginBottom:10,
              cursor:n.lu?"default":"pointer",borderLeft:`4px solid ${n.lu?C.border:meta.color}`,
              opacity:n.lu?0.75:1}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{width:36,height:36,borderRadius:9,background:meta.bg,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:17,flexShrink:0}}>{meta.ico}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:C.text,fontFamily:F.h}}>
                    {n.titre}</span>
                  {!n.lu&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:99,
                    background:C.purple,color:"#fff",fontWeight:700}}>NOUVEAU</span>}
                  <span style={{fontSize:10.5,padding:"2px 8px",borderRadius:99,
                    background:meta.bg,color:meta.color,fontWeight:600,marginLeft:"auto"}}>
                    {meta.label}</span>
                </div>
                <div style={{fontSize:12.5,color:C.text,lineHeight:1.6,marginBottom:8}}>
                  {n.message}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  {elu&&<Tag text={`⊛ ${elu.nom}`} color={C.purple} bg={C.purpleBg}/>}
                  {n.quartier&&<Tag text={n.quartier}/>}
                  {dem&&<Tag text={`${dem.nom} ${dem.prenom}`}/>}
                  {n.logement_ref&&<Tag text={n.logement_ref} color={C.accent} bg={C.accentL}/>}
                  <span style={{fontSize:11,color:C.light,marginLeft:"auto"}}>
                    {n.date} à {n.heure}</span>
                </div>
                {n.type==="attribution_audience"&&(
                  <div style={{marginTop:10,padding:"9px 12px",borderRadius:8,
                    background:C.greenBg,display:"flex",gap:8,alignItems:"center"}}>
                    <span>🏠</span>
                    <div style={{fontSize:12,color:C.green,fontWeight:600}}>
                      Votre intervention a contribué à cette attribution.</div>
                  </div>
                )}
                {n.type==="urgence_territoire"&&(
                  <div style={{marginTop:10,padding:"9px 12px",borderRadius:8,
                    background:C.redBg,display:"flex",gap:8,alignItems:"center"}}>
                    <span>⚠</span>
                    <div style={{fontSize:12,color:C.red,fontWeight:600}}>
                      Action recommandée — relance service habitat.</div>
                  </div>
                )}
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
// ─── APP INTERNE (après login) ────────────────────────────────────────────────
function AppInner() {
  const { user, logout } = useAuth();
  const [active,setActive]=useState("dashboard");
  const [matchLog,setMatchLog]=useState(null);
  const [calDossiers,setCalDossiers]=useState([]);
  const {data:notifs,reload:reloadNotifs} = useApi('/notifications');
  const [showChangePwd,setShowChangePwd]=useState(false);
  const badge=(notifs||[]).filter(n=>!n.lu).length;

  const goMatch=log=>{ setMatchLog(log); setActive("matching"); };
  const addToCAL=(logement,candidats)=>{
    setCalDossiers(prev=>[...prev.filter(d=>d.logement.id!==logement.id),{logement,candidats}]);
    setActive("cal");
  };

  useEffect(()=>{
    if(user?.role==="elu") setActive("audiences");
  },[user]);

  return <div style={{display:"flex",height:"100vh",background:C.bg,
    overflow:"hidden",fontFamily:F.b}}>
    <Sidebar active={active} setActive={setActive} badge={badge}
      onLogout={logout} onChangePwd={()=>setShowChangePwd(true)}/>
    <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {active==="dashboard"&&<div style={{flex:1,overflowY:"auto"}}><Dashboard setActive={setActive}/></div>}
      {active==="logements"&&<div style={{flex:1,overflowY:"auto"}}><Logements goMatch={goMatch}/></div>}
      {active==="demandeurs"&&<Demandeurs/>}
      {active==="matching"&&<Matching initLog={matchLog} addToCAL={addToCAL}/>}
      {active==="cal"&&<div style={{flex:1,overflowY:"auto"}}><CALPrepa dossiers={calDossiers}/></div>}
      {active==="audiences"&&<div style={{flex:1,overflowY:"auto"}}><AudiencesElus/></div>}
      {active==="stats"&&<div style={{flex:1,overflowY:"auto"}}><Statistiques/></div>}
      {active==="import"&&<div style={{flex:1,overflowY:"auto",padding:28}}>
        <ImportPelehas onDone={(res)=>{
          if(res.type==="demandeurs") setActive("demandeurs");
          else if(res.type==="logements") setActive("logements");
          else if(res.type==="audiences") setActive("audiences");
        }}/>
      </div>}
      {active==="notifications"&&<div style={{flex:1,overflowY:"auto"}}><Notifications/></div>}
      {active==="users"&&<div style={{flex:1,overflowY:"auto"}}><GestionUtilisateurs/></div>}
      {active==="telegram"&&<div style={{flex:1,overflowY:"auto"}}><TelegramPanel/></div>}
      {active==="logs"&&<div style={{flex:1,overflowY:"auto"}}><LogsActions/></div>}
    </div>
    {showChangePwd&&<ChangePasswordModal onClose={()=>setShowChangePwd(false)}/>}
  </div>;
}

function AppRoot() {
  const { user } = useAuth();
  if(!user) return <LoginScreen/>;
  return <AppInner/>;
}

export default function App() {
  useFonts();
  return <AuthProvider><AppRoot/></AuthProvider>;
}
