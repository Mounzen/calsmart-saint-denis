// ═══════════════════════════════════════════════════════════════
// Logivia - Statistiques.jsx
// Module stats complet + import Excel audiences élus
// À importer dans App.jsx
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";

const C = {
navy:"#0B1E3D", accent:"#E05C2A", accentL:"rgba(224,92,42,0.10)",
bg:"#EEF1F6", card:"#FFFFFF", text:"#0B1E3D", muted:"#5B6B85",
border:"#DDE3EE", green:"#16A34A", greenBg:"#DCFCE7",
amber:"#D97706", amberBg:"#FEF3C7", red:"#DC2626", redBg:"#FEE2E2",
purple:"#7C3AED", purpleBg:"#EDE9FE", teal:"#0D9488", tealBg:"#CCFBF1",
blue:"#1D6FA8", blueBg:"#DBEAFE",
};
const F = { h:"'Syne',sans-serif", b:"'DM Sans',sans-serif" };

const PALETTE = [C.accent, C.blue, C.green, C.purple, C.amber, C.teal, C.red, "#F59E0B", "#6366F1", "#EC4899"];

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
get: async (path) => {
const r = await fetch(`/api${path}`);
if (!r.ok) throw new Error(`${r.status}`);
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
};

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function Spin() {
return <div style={{display:"flex",alignItems:"center",justifyContent:"center",
padding:40,color:C.muted,fontFamily:F.b,fontSize:13}}>
<span style={{marginRight:8,fontSize:18,display:"inline-block",
animation:"spin 1s linear infinite"}}>[rld]</span>Chargement...
<style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>

  </div>;
}

function Card({title, subtitle, children, style={}}) {
return <div style={{background:C.card, borderRadius:12, padding:20,
border:`1px solid ${C.border}`, ...style}}>
{title&&<div style={{fontFamily:F.h,fontSize:13,fontWeight:700,color:C.text,
marginBottom:subtitle?3:14}}>{title}</div>}
{subtitle&&<div style={{fontSize:11,color:C.muted,marginBottom:14}}>{subtitle}</div>}
{children}

  </div>;
}

function StatBig({label, val, color=C.accent, sub}) {
return <div style={{background:C.card,borderRadius:12,padding:"16px 20px",
border:`1px solid ${C.border}`,flex:"1 1 120px"}}>
<div style={{fontSize:28,fontWeight:800,color,fontFamily:F.h,
letterSpacing:"-0.04em"}}>{val}</div>
<div style={{fontSize:12,fontWeight:600,color:C.text,marginTop:2}}>{label}</div>
{sub&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{sub}</div>}

  </div>;
}

// ─── GRAPHIQUES SVG ──────────────────────────────────────────────────────────

// Barres horizontales
function BarChart({data, height=220, label="", unit=""}) {
if(!data||data.length===0) return <div style={{color:C.muted,fontSize:12,padding:20,textAlign:"center"}}>Aucune donnée</div>;
const max = Math.max(...data.map(d=>d.val), 1);
return <div>
{label&&<div style={{fontSize:11,color:C.muted,marginBottom:10,textAlign:"center"}}>{label}</div>}
<div style={{display:"flex",flexDirection:"column",gap:7}}>
{data.map((d,i)=>(
<div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{fontSize:11.5,color:C.text,width:110,textAlign:"right",
flexShrink:0,fontFamily:F.b}}>{d.label}</div>
<div style={{flex:1,height:22,background:"#EEF1F6",borderRadius:99,overflow:"hidden"}}>
<div style={{height:"100%",width:`${(d.val/max)*100}%`,
background:d.color||PALETTE[i%PALETTE.length],
borderRadius:99,transition:"width .6s ease",
display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6}}>
{(d.val/max)>0.25&&<span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{d.val}{unit}</span>}
</div>
</div>
{(d.val/max)<=0.25&&<span style={{fontSize:10.5,fontWeight:700,color:C.muted}}>{d.val}{unit}</span>}
</div>
))}
</div>

  </div>;
}

// Barres verticales
function ColumnChart({data, height=180, unit=""}) {
if(!data||data.length===0) return null;
const max = Math.max(...data.map(d=>d.val), 1);
return <div style={{display:"flex",alignItems:"flex-end",gap:8,height,paddingTop:20,position:"relative"}}>
{data.map((d,i)=>{
const pct = d.val/max;
const barH = Math.max(pct*height*0.85, d.val>0?4:0);
return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",
alignItems:"center",gap:4}}>
<div style={{fontSize:10,fontWeight:700,color:d.color||PALETTE[i%PALETTE.length]}}>
{d.val>0?d.val+unit:""}</div>
<div style={{width:"100%",height:barH,background:d.color||PALETTE[i%PALETTE.length],
borderRadius:"4px 4px 0 0",transition:"height .6s ease",minHeight:d.val>0?4:0}}/>
<div style={{fontSize:10,color:C.muted,textAlign:"center",lineHeight:1.3}}>{d.label}</div>
</div>;
})}

  </div>;
}

// Camembert SVG
function PieChart({data, size=160}) {
if(!data||data.length===0) return null;
const total = data.reduce((s,d)=>s+d.val,0);
if(total===0) return null;
let angle = -Math.PI/2;
const cx=size/2, cy=size/2, r=size/2-10;
const slices = data.map((d,i)=>{
const sweep = (d.val/total)*2*Math.PI;
const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
angle+=sweep;
const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
const large=sweep>Math.PI?1:0;
return{...d,path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`,
color:d.color||PALETTE[i%PALETTE.length],pct:Math.round(d.val/total*100)};
});
return <div style={{display:"flex",alignItems:"center",gap:20}}>
<svg width={size} height={size} style={{flexShrink:0}}>
{slices.map((s,i)=>(
<path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2}/>
))}
<circle cx={cx} cy={cy} r={r*0.45} fill="#fff"/>
<text x={cx} y={cy+5} textAnchor="middle" fontSize={14} fontWeight={800} fill={C.text}>
{total}
</text>
</svg>
<div style={{flex:1}}>
{slices.map((s,i)=>(
<div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
<div style={{width:10,height:10,borderRadius:2,background:s.color,flexShrink:0}}/>
<span style={{fontSize:11.5,color:C.text,flex:1}}>{s.label}</span>
<span style={{fontSize:11.5,fontWeight:700,color:s.color}}>{s.pct}%</span>
</div>
))}
</div>

  </div>;
}

// Jauge
function Gauge({val, max, color=C.accent, label}) {
const pct = Math.min(val/max, 1);
const angle = pct*180-90;
const r=60, cx=80, cy=80;
const toXY=(deg)=>{
const rad=deg*Math.PI/180;
return{x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)};
};
const start=toXY(-180), end=toXY(angle-90);
const large=pct>0.5?1:0;
return <div style={{textAlign:"center"}}>
<svg width={160} height={90} style={{overflow:"visible"}}>
<path d={`M${start.x},${start.y} A${r},${r} 0 1,1 ${cx+r},${cy}`}
fill="none" stroke="#EEF1F6" strokeWidth={12} strokeLinecap="round"/>
<path d={`M${start.x},${start.y} A${r},${r} 0 ${large},1 ${end.x},${end.y}`}
fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"/>
<text x={cx} y={cy+10} textAnchor="middle" fontSize={20} fontWeight={800} fill={color}>
{val}
</text>
<text x={cx} y={cy+25} textAnchor="middle" fontSize={10} fill={C.muted}>/{max}</text>
</svg>
{label&&<div style={{fontSize:11.5,color:C.muted,marginTop:-10}}>{label}</div>}

  </div>;
}

// Ligne temporelle simple
function LineChart({points, height=100, color=C.accent, unit=""}) {
if(!points||points.length<2) return null;
const vals=points.map(p=>p.val);
const max=Math.max(...vals,1), min=Math.min(...vals,0);
const W=400, H=height, pad=10;
const toX=(i)=>pad+(i/(points.length-1))*(W-pad*2);
const toY=(v)=>H-pad-(((v-min)/(max-min||1))*(H-pad*2));
const path=points.map((p,i)=>`${i===0?"M":"L"}${toX(i)},${toY(p.val)}`).join(" ");
return <div style={{overflowX:"auto"}}>
<svg width={W} height={H+30} style={{display:"block"}}>
<path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round"/>
<path d={`${path} L${toX(points.length-1)},${H} L${toX(0)},${H} Z`}
fill={color} opacity={0.1}/>
{points.map((p,i)=>(
<g key={i}>
<circle cx={toX(i)} cy={toY(p.val)} r={4} fill={color} stroke="#fff" strokeWidth={2}/>
<text x={toX(i)} y={H+20} textAnchor="middle" fontSize={9} fill={C.muted}>{p.label}</text>
{i===points.length-1&&(
<text x={toX(i)} y={toY(p.val)-10} textAnchor="middle" fontSize={11}
fontWeight={700} fill={color}>{p.val}{unit}</text>
)}
</g>
))}
</svg>

  </div>;
}

// ─── IMPORT EXCEL ─────────────────────────────────────────────────────────────
function ImportExcelAudiences({elus, demandeurs, ref: refData, onImported}) {
const [step, setStep] = useState("upload"); // upload | preview | done
const [rows, setRows] = useState([]);
const [mapped, setMapped] = useState([]);
const [cols, setCols] = useState([]);
const [mapping, setMapping] = useState({});
const [saving, setSaving] = useState(false);
const [errors, setErrors] = useState([]);
const fileRef = useRef();

// Champs attendus
const FIELDS = [
{key:"date_audience", label:"Date audience *", ex:"15/03/2024"},
{key:"nom_demandeur", label:"Nom demandeur", ex:"MBAYE"},
{key:"prenom_demandeur", label:"Prénom demandeur", ex:"Ousmane"},
{key:"nud", label:"NUD (N unique)", ex:"93284-2021-00142"},
{key:"nom_elu", label:"Nom élu", ex:"M. Dupont"},
{key:"quartier_origine", label:"Quartier d'origine", ex:"Floréal"},
{key:"quartier_souhaite", label:"Quartier souhaité", ex:"Franc-Moisin"},
{key:"objet", label:"Objet de l'audience", ex:"Suroccupation T4"},
{key:"favorable", label:"Favorable (oui/non)", ex:"oui"},
{key:"suite", label:"Suite donnée", ex:"Instruction renforcée"},
{key:"statut", label:"Statut", ex:"En attente proposition"},
];

const parseExcel = async (file) => {
// Lecture CSV ou XLSX basique via FileReader
const ext = file.name.split('.').pop().toLowerCase();
const reader = new FileReader();

reader.onload = (e) => {
  const text = e.target.result;
  let parsed = [];

  if (ext === "csv") {
    // Détecter séparateur ; ou ,
    const sep = text.includes(";") ? ";" : ",";
    const lines = text.split("\n").filter(l=>l.trim());
    const headers = lines[0].split(sep).map(h=>h.trim().replace(/"/g,""));
    parsed = lines.slice(1).map(line=>{
      const vals = line.split(sep).map(v=>v.trim().replace(/"/g,""));
      const obj = {};
      headers.forEach((h,i)=>obj[h]=vals[i]||"");
      return obj;
    }).filter(r=>Object.values(r).some(v=>v));
    setCols(headers);
  } else {
    // Pour XLSX : on lit en base64 et parse manuellement (format simple)
    // Fallback : demander CSV
    alert("Pour les fichiers .xlsx, merci d'exporter en CSV depuis Excel d'abord (Fichier -> Enregistrer sous -> CSV).\nOu utilisez un fichier .csv directement.");
    return;
  }

  setRows(parsed);
  // Auto-mapping intelligent
  const autoMap = {};
  const headerLower = (parsed[0]?Object.keys(parsed[0]):[]).map(h=>h.toLowerCase());
  FIELDS.forEach(f=>{
    const match = headerLower.find(h=>
      h.includes(f.key.replace(/_/g," ")) ||
      h.includes(f.label.toLowerCase().replace(" *","").split(" ")[0]) ||
      (f.key==="date_audience"&&(h.includes("date")||h.includes("audience"))) ||
      (f.key==="nom_demandeur"&&h.includes("nom")) ||
      (f.key==="prenom_demandeur"&&h.includes("prenom")||h.includes("prénom")) ||
      (f.key==="favorable"&&(h.includes("favor")||h.includes("avis"))) ||
      (f.key==="objet"&&(h.includes("objet")||h.includes("motif")||h.includes("sujet"))) ||
      (f.key==="suite"&&(h.includes("suite")||h.includes("action")||h.includes("résultat"))) ||
      (f.key==="quartier_origine"&&(h.includes("origine")||h.includes("actuel"))) ||
      (f.key==="quartier_souhaite"&&(h.includes("souhai")||h.includes("demandé")))
    );
    if(match) autoMap[f.key]=Object.keys(parsed[0])[headerLower.indexOf(match)];
  });
  setMapping(autoMap);
  setStep("preview");
};

if (ext==="csv") reader.readAsText(file, "UTF-8");
else reader.readAsText(file);

};

const buildMapped = () => {
const errs = [];
const result = rows.map((row, i) => {
const date = mapping.date_audience ? row[mapping.date_audience] : "";
if(!date) errs.push(`Ligne ${i+2} : date manquante`);

  // Trouver l'élu
  const nomElu = mapping.nom_elu ? row[mapping.nom_elu]?.toLowerCase() : "";
  const elu = (elus||[]).find(e=>e.nom.toLowerCase().includes(nomElu)||nomElu.includes(e.nom.toLowerCase().split(" ")[1]||""));

  // Trouver le demandeur
  const nomDem = mapping.nom_demandeur ? row[mapping.nom_demandeur]?.toLowerCase() : "";
  const prenomDem = mapping.prenom_demandeur ? row[mapping.prenom_demandeur]?.toLowerCase() : "";
  const nud = mapping.nud ? row[mapping.nud] : "";
  const dem = (demandeurs||[]).find(d=>
    (nud&&d.nud===nud) ||
    (nomDem&&d.nom.toLowerCase()===nomDem&&prenomDem&&d.prenom.toLowerCase()===prenomDem) ||
    (nomDem&&d.nom.toLowerCase()===nomDem)
  );

  const favorableRaw = mapping.favorable ? row[mapping.favorable]?.toLowerCase() : "";
  const favorable = ["oui","yes","o","1","true","favorable"].includes(favorableRaw);

  return {
    date_audience: date,
    dem_id: dem?.id || null,
    dem_nom: dem ? `${dem.nom} ${dem.prenom}` : (mapping.nom_demandeur?row[mapping.nom_demandeur]:"") + " " + (mapping.prenom_demandeur?row[mapping.prenom_demandeur]:""),
    elu_id: elu?.id || null,
    elu_nom: elu?.nom || (mapping.nom_elu?row[mapping.nom_elu]:""),
    quartier_origine: mapping.quartier_origine ? row[mapping.quartier_origine] : "",
    quartier_souhaite: mapping.quartier_souhaite ? row[mapping.quartier_souhaite] : "",
    quartier_elu: elu?.quartiers?.[0] || (mapping.quartier_origine?row[mapping.quartier_origine]:""),
    objet: mapping.objet ? row[mapping.objet] : "",
    favorable,
    suite: mapping.suite ? row[mapping.suite] : "",
    statut: mapping.statut ? row[mapping.statut] : "En attente proposition",
    quartier_attribue: null,
    _warn: !dem ? "Demandeur non trouvé dans la base" : !elu ? "Élu non trouvé" : null,
    _raw: row,
  };
});
setErrors(errs);
setMapped(result);

};

useEffect(()=>{ if(rows.length&&Object.keys(mapping).length>0) buildMapped(); },[rows,mapping]);

const importAll = async () => {
setSaving(true);
let ok=0, fail=0;
for(const m of mapped) {
if(!m.date_audience) { fail++; continue; }
try {
await api.post('/audiences', {
date_audience: m.date_audience,
dem_id: m.dem_id || "IMPORT",
elu_id: m.elu_id || "IMPORT",
quartier_origine: m.quartier_origine,
quartier_elu: m.quartier_elu,
quartier_souhaite: m.quartier_souhaite,
quartier_attribue: null,
objet: m.objet,
favorable: m.favorable,
suite: m.suite,
statut: m.statut || "En attente proposition",
jours_audience_proposition: null,
jours_proposition_attribution: null,
});
ok++;
} catch(e) { fail++; }
}
setSaving(false);
setStep("done");
onImported && onImported(ok, fail);
};

return <div style={{fontFamily:F.b}}>
{step==="upload"&&(
<div>
<div style={{background:C.bg,borderRadius:12,padding:24,marginBottom:16,
border:`2px dashed ${C.border}`,textAlign:"center"}}>
<div style={{fontSize:36,marginBottom:12}}>[files]</div>
<div style={{fontFamily:F.h,fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>
Importer le fichier Excel des audiences</div>
<div style={{fontSize:12.5,color:C.muted,marginBottom:16,lineHeight:1.6}}>
Formats acceptés : <b>.csv</b><br/>
Si ton fichier est .xlsx -> dans Excel : <b>Fichier -> Enregistrer sous -> CSV UTF-8</b>
</div>
<input ref={fileRef} type="file" accept=".csv,.xlsx"
style={{display:"none"}} onChange={e=>e.target.files[0]&&parseExcel(e.target.files[0])}/>
<button onClick={()=>fileRef.current.click()}
style={{padding:"11px 24px",background:C.purple,color:"#fff",border:"none",
borderRadius:9,cursor:"pointer",fontFamily:F.h,fontSize:13,fontWeight:700}}>
Choisir le fichier
</button>
</div>
<div style={{background:"#F8F7FF",borderRadius:10,padding:16,border:`1px solid ${C.purple}22`}}>
<div style={{fontFamily:F.h,fontSize:11,fontWeight:700,color:C.purple,
textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
Colonnes attendues dans le CSV</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
{FIELDS.map(f=>(
<div key={f.key} style={{fontSize:11.5,color:C.text}}>
<span style={{fontWeight:600}}>{f.label}</span>
<span style={{color:C.muted,marginLeft:4}}>ex: {f.ex}</span>
</div>
))}
</div>
</div>
</div>
)}

{step==="preview"&&(
  <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
      <div style={{flex:1}}>
        <div style={{fontFamily:F.h,fontSize:14,fontWeight:700,color:C.text}}>
          {rows.length} lignes détectées</div>
        <div style={{fontSize:12,color:C.muted}}>Vérifiez la correspondance des colonnes</div>
      </div>
      <button onClick={()=>setStep("upload")}
        style={{padding:"7px 14px",border:`1px solid ${C.border}`,borderRadius:8,
          background:"transparent",cursor:"pointer",fontFamily:F.h,fontSize:11,
          fontWeight:600,color:C.muted}}>← Changer de fichier</button>
    </div>

    {/* Mapping des colonnes */}
    <div style={{background:C.bg,borderRadius:10,padding:16,marginBottom:16}}>
      <div style={{fontFamily:F.h,fontSize:11,fontWeight:700,color:C.muted,
        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>
        Correspondance des colonnes</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {FIELDS.map(f=>(
          <div key={f.key} style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:12,color:C.text,minWidth:140}}>{f.label}</div>
            <select value={mapping[f.key]||""} onChange={e=>setMapping(p=>({...p,[f.key]:e.target.value}))}
              style={{flex:1,padding:"5px 8px",borderRadius:6,border:`1px solid ${C.border}`,
                fontFamily:F.b,fontSize:11,color:C.text,background:C.card}}>
              <option value="">- Non mappé -</option>
              {cols.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>

    {errors.length>0&&(
      <div style={{background:C.redBg,borderRadius:9,padding:12,marginBottom:12,
        border:`1px solid ${C.red}22`}}>
        {errors.slice(0,3).map((e,i)=><div key={i} style={{fontSize:12,color:C.red}}>{e}</div>)}
        {errors.length>3&&<div style={{fontSize:11,color:C.muted}}>{errors.length-3} autres erreurs...</div>}
      </div>
    )}

    {/* Aperçu */}
    <div style={{background:C.card,borderRadius:10,border:`1px solid ${C.border}`,
      overflow:"hidden",marginBottom:16}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5}}>
          <thead>
            <tr style={{background:C.bg}}>
              {["Date","Demandeur","Élu","Q. souhaité","Objet","Favorable","Statut"].map(h=>(
                <th key={h} style={{padding:"7px 10px",textAlign:"left",fontSize:10,
                  fontWeight:700,color:C.muted,textTransform:"uppercase",
                  letterSpacing:"0.05em",borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapped.slice(0,10).map((m,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.border}`,
                background:m._warn?"#FFFBEB":"transparent"}}>
                <td style={{padding:"7px 10px",color:C.text}}>{m.date_audience}</td>
                <td style={{padding:"7px 10px"}}>
                  <div style={{fontWeight:600,color:m.dem_id?C.text:C.amber}}>{m.dem_nom||"-"}</div>
                  {!m.dem_id&&<div style={{fontSize:10,color:C.amber}}>Non trouvé</div>}
                </td>
                <td style={{padding:"7px 10px"}}>
                  <div style={{color:m.elu_id?C.purple:C.amber,fontWeight:600}}>
                    {m.elu_nom||"-"}</div>
                </td>
                <td style={{padding:"7px 10px",color:C.text}}>{m.quartier_souhaite||"-"}</td>
                <td style={{padding:"7px 10px",color:C.muted,maxWidth:150}}>
                  <div style={{fontSize:11,lineHeight:1.3}}>{m.objet||"-"}</div>
                </td>
                <td style={{padding:"7px 10px"}}>
                  <span style={{fontSize:11,fontWeight:600,
                    color:m.favorable?C.green:C.muted}}>
                    {m.favorable?"v Oui":"Non"}</span>
                </td>
                <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>{m.statut}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mapped.length>10&&<div style={{padding:"8px 12px",fontSize:11,color:C.muted,
        borderTop:`1px solid ${C.border}`}}>
        + {mapped.length-10} lignes supplémentaires
      </div>}
    </div>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:12,color:C.muted}}>
        {mapped.filter(m=>!m._warn).length} lignes prêtes -{" "}
        {mapped.filter(m=>m._warn).length} avertissements
      </div>
      <button onClick={importAll} disabled={saving||mapped.length===0}
        style={{padding:"10px 22px",background:C.purple,color:"#fff",border:"none",
          borderRadius:9,cursor:"pointer",fontFamily:F.h,fontSize:13,fontWeight:700}}>
        {saving?`Import en cours...`:`Importer ${mapped.length} audiences`}
      </button>
    </div>
  </div>
)}

{step==="done"&&(
  <div style={{textAlign:"center",padding:32}}>
    <div style={{fontSize:48,marginBottom:16}}>[ok]</div>
    <div style={{fontFamily:F.h,fontSize:18,fontWeight:800,color:C.text,marginBottom:8}}>
      Import terminé</div>
    <div style={{fontSize:13,color:C.muted,marginBottom:20}}>
      Les audiences ont été ajoutées à la base.</div>
    <button onClick={()=>{setStep("upload");setRows([]);setMapped([]);}}
      style={{padding:"9px 20px",background:C.purple,color:"#fff",border:"none",
        borderRadius:8,cursor:"pointer",fontFamily:F.h,fontSize:12,fontWeight:700}}>
      Importer un autre fichier
    </button>
  </div>
)}

  </div>;
}

// ─── MODULE STATISTIQUES ──────────────────────────────────────────────────────
export default function Statistiques() {
const [tab, setTab] = useState("demandeurs");
const [data, setData] = useState({});
const [loading, setLoading] = useState(true);
const [showImport, setShowImport] = useState(false);
const [importResult, setImportResult] = useState(null);

useEffect(()=>{
const load = async () => {
setLoading(true);
try {
const [dem, log, aud, notifs, ref] = await Promise.all([
api.get('/demandeurs'),
api.get('/logements'),
api.get('/audiences'),
api.get('/notifications'),
api.get('/referentiels'),
]);
setData({ dem, log, aud, notifs, ref,
elus: ref.elus||[],
});
} catch(e) { console.error(e); }
finally { setLoading(false); }
};
load();
},[]);

if(loading) return <Spin/>;

const { dem=[], log=[], aud=[], notifs=[], ref={}, elus=[] } = data;

// ── Calculs demandeurs ──
const actifs = dem.filter(d=>d.statut==="active");
const urgents = actifs.filter(d=>d.dalo||d.prio_expulsion||d.sans_log||d.violences);
const incomplets = actifs.filter(d=>!d.pieces);
const avecAudience = actifs.filter(d=>aud.some(a=>a.dem_id===d.id));

const parTyp = ["T1","T2","T3","T4","T5"].map(t=>({
label:t, val:actifs.filter(d=>d.typ_v===t).length
}));

const parSit = {};
actifs.forEach(d=>{ if(d.sit) parSit[d.sit]=(parSit[d.sit]||0)+1; });
const sitData = Object.entries(parSit).sort((a,b)=>b[1]-a[1])
.map(([label,val])=>({label,val}));

const parQ = {};
actifs.forEach(d=>(d.quartiers||[]).forEach(q=>{ parQ[q]=(parQ[q]||0)+1; }));
const qData = Object.entries(parQ).sort((a,b)=>b[1]-a[1]).slice(0,8)
.map(([label,val])=>({label,val}));

const ancTranches = [
{label:"< 6 mois", val:actifs.filter(d=>d.anc<6).length, color:C.green},
{label:"6-12 mois", val:actifs.filter(d=>d.anc>=6&&d.anc<12).length, color:C.teal},
{label:"1-2 ans", val:actifs.filter(d=>d.anc>=12&&d.anc<24).length, color:C.blue},
{label:"2-3 ans", val:actifs.filter(d=>d.anc>=24&&d.anc<36).length, color:C.amber},
{label:"3+ ans", val:actifs.filter(d=>d.anc>=36).length, color:C.red},
];

const urgenceDetails = [
{label:"DALO reconnu", val:actifs.filter(d=>d.dalo).length, color:C.red},
{label:"Sans logement", val:actifs.filter(d=>d.sans_log).length, color:C.red},
{label:"VIF", val:actifs.filter(d=>d.violences).length, color:C.red},
{label:"Expulsion", val:actifs.filter(d=>d.prio_expulsion).length, color:C.amber},
{label:"Suroccupation", val:actifs.filter(d=>d.suroc).length, color:C.amber},
{label:"Handicap", val:actifs.filter(d=>d.handicap).length, color:C.purple},
{label:"Grossesse", val:actifs.filter(d=>d.grossesse).length, color:C.teal},
].filter(d=>d.val>0);

// ── Calculs attributions ──
const attribues = aud.filter(a=>a.statut==="Attribué");
const favorables = aud.filter(a=>a.favorable);
const attribFav = aud.filter(a=>a.statut==="Attribué"&&a.favorable);
const tauxAttr = aud.length>0?Math.round(attribues.length/aud.length*100):0;
const tauxFavAttr = favorables.length>0?Math.round(attribFav.length/favorables.length*100):0;

const delaiData = attribues
.filter(a=>a.jours_audience_proposition)
.map(a=>a.jours_audience_proposition+(a.jours_proposition_attribution||0));
const delaiMoyen = delaiData.length>0?Math.round(delaiData.reduce((s,v)=>s+v,0)/delaiData.length):null;
const delaiMin = delaiData.length>0?Math.min(...delaiData):null;
const delaiMax = delaiData.length>0?Math.max(...delaiData):null;

const parStatut = [
{label:"Attribué", val:attribues.length, color:C.green},
{label:"En att. attribution", val:aud.filter(a=>a.statut==="En attente attribution").length, color:C.amber},
{label:"En att. proposition", val:aud.filter(a=>a.statut==="En attente proposition").length, color:C.blue},
];

// ── Calculs territoire ──
const migrations = {};
aud.filter(a=>a.quartier_attribue).forEach(a=>{
const k=`${a.quartier_origine}->${a.quartier_attribue}`;
if(!migrations[k]) migrations[k]={from:a.quartier_origine,to:a.quartier_attribue,count:0};
migrations[k].count++;
});
const migTop = Object.values(migrations).sort((a,b)=>b.count-a.count).slice(0,6);

const parElu = elus.map(e=>{
const eAud = aud.filter(a=>a.elu_id===e.id);
const eAttr = eAud.filter(a=>a.statut==="Attribué");
const eFav = eAud.filter(a=>a.favorable);
return{...e,nb:eAud.length,attrib:eAttr.length,fav:eFav.length,
taux:eAud.length>0?Math.round(eAttr.length/eAud.length*100):0};
}).sort((a,b)=>b.nb-a.nb);

const TABS=[
{id:"demandeurs",label:"[users] Demandeurs"},
{id:"attributions",label:"[log] Attributions"},
{id:"territoire",label:"[map] Territoire"},
{id:"elus",label:"* Élus"},
{id:"import",label:"[files] Import Excel"},
];

return <div style={{padding:28,fontFamily:F.b}}>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
<div>
<h1 style={{fontFamily:F.h,fontSize:22,fontWeight:800,color:C.text,
margin:"0 0 4px",letterSpacing:"-0.03em"}}>Statistiques</h1>
<p style={{color:C.muted,fontSize:12.5}}>
{actifs.length} demandeurs - {aud.length} audiences - {attribues.length} attributions
</p>
</div>
{importResult&&(
<div style={{padding:"8px 14px",background:C.greenBg,borderRadius:9,
fontSize:12,color:C.green,fontWeight:600}}>
v {importResult.ok} audiences importées
{importResult.fail>0&&<span style={{color:C.amber}}> - {importResult.fail} erreurs</span>}
</div>
)}
</div>

{/* Tabs */}
<div style={{display:"flex",gap:2,marginBottom:24,background:C.bg,
  borderRadius:10,padding:4,width:"fit-content"}}>
  {TABS.map(t=>(
    <button key={t.id} onClick={()=>setTab(t.id)}
      style={{padding:"8px 16px",borderRadius:8,border:"none",cursor:"pointer",
        fontFamily:F.h,fontSize:12,fontWeight:tab===t.id?700:500,
        background:tab===t.id?C.card:"transparent",
        color:tab===t.id?C.text:C.muted,
        boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
      {t.label}
    </button>
  ))}
</div>

{/* ── DEMANDEURS ── */}
{tab==="demandeurs"&&<>
  <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
    <StatBig label="Actifs" val={actifs.length} color={C.accent}/>
    <StatBig label="Urgents" val={urgents.length} color={C.red}
      sub={`${Math.round(urgents.length/actifs.length*100)||0}% des demandes`}/>
    <StatBig label="Dossiers incomplets" val={incomplets.length} color={C.amber}/>
    <StatBig label="Avec audience élu" val={avecAudience.length} color={C.purple}
      sub={`${Math.round(avecAudience.length/actifs.length*100)||0}% ont vu un élu`}/>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
    <Card title="Répartition par typologie demandée">
      <ColumnChart data={parTyp} height={140}/>
    </Card>
    <Card title="Situation de logement actuelle">
      <BarChart data={sitData.slice(0,6)} unit=" dem."/>
    </Card>
    <Card title="Ancienneté des demandes">
      <PieChart data={ancTranches}/>
    </Card>
    <Card title="Situations d'urgence">
      <BarChart data={urgenceDetails} unit=" dem."/>
    </Card>
  </div>
  <Card title="Top quartiers demandés" subtitle="Nombre de demandeurs souhaitant ce quartier">
    <BarChart data={qData} unit=" dem."/>
  </Card>
</>}

{/* ── ATTRIBUTIONS ── */}
{tab==="attributions"&&<>
  <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
    <StatBig label="Audiences totales" val={aud.length} color={C.purple}/>
    <StatBig label="Favorables" val={favorables.length} color={C.green}
      sub={`${Math.round(favorables.length/aud.length*100)||0}% des audiences`}/>
    <StatBig label="Attribuées" val={attribues.length} color={C.accent}
      sub={`taux ${tauxAttr}%`}/>
    <StatBig label="Taux fav.->attrib." val={`${tauxFavAttr}%`} color={C.teal}
      sub="audiences favorables abouties"/>
    {delaiMoyen&&<StatBig label="Délai moyen" val={`${delaiMoyen}j`} color="#1D6FA8"
      sub={`min ${delaiMin}j - max ${delaiMax}j`}/>}
  </div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
    <Card title="Statut des audiences">
      <PieChart data={parStatut}/>
    </Card>
    <Card title="Taux d'attribution" subtitle="Audiences -> logement attribué">
      <div style={{display:"flex",justifyContent:"space-around",paddingTop:10}}>
        <Gauge val={tauxAttr} max={100} color={C.accent} label="Toutes audiences"/>
        <Gauge val={tauxFavAttr} max={100} color={C.green} label="Favorables"/>
      </div>
    </Card>
  </div>
  <Card title="Délais audience -> attribution" subtitle="Par dossier abouti">
    {attribues.filter(a=>a.jours_audience_proposition).length===0?(
      <div style={{color:C.muted,fontSize:12,padding:20,textAlign:"center"}}>
        Aucune donnée de délai disponible</div>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {attribues.filter(a=>a.jours_audience_proposition).map(a=>{
          const dem2=dem.find(d=>d.id===a.dem_id);
          const total=(a.jours_audience_proposition||0)+(a.jours_proposition_attribution||0);
          const maxJ=400;
          const pProp=Math.min((a.jours_audience_proposition||0)/maxJ*100,100);
          const pAttr=Math.min((a.jours_proposition_attribution||0)/maxJ*100,100);
          return <div key={a.id}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600,color:C.text}}>
                {dem2?`${dem2.nom} ${dem2.prenom}`:a.dem_id}
              </span>
              <span style={{fontSize:12,fontWeight:700,color:C.text}}>{total}j</span>
            </div>
            <div style={{display:"flex",height:18,borderRadius:99,overflow:"hidden",gap:2}}>
              <div style={{width:`${pProp}%`,background:C.purple,minWidth:a.jours_audience_proposition>0?20:0,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:9,color:"#fff",fontWeight:700}}>
                  {a.jours_audience_proposition}j</span>
              </div>
              {a.jours_proposition_attribution>0&&(
                <div style={{width:`${pAttr}%`,background:C.accent,minWidth:20,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:9,color:"#fff",fontWeight:700}}>
                    {a.jours_proposition_attribution}j</span>
                </div>
              )}
            </div>
          </div>;
        })}
        <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.muted}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:10,height:10,background:C.purple,borderRadius:2,display:"inline-block"}}/>
            Audience -> Proposition
          </span>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:10,height:10,background:C.accent,borderRadius:2,display:"inline-block"}}/>
            Proposition -> Attribution
          </span>
        </div>
      </div>
    )}
  </Card>
</>}

{/* ── TERRITOIRE ── */}
{tab==="territoire"&&<>
  <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
    <StatBig label="Mobilités tracées" val={aud.filter(a=>a.quartier_attribue).length} color={C.accent}/>
    <StatBig label="Maintien dans quartier" color={C.green}
      val={aud.filter(a=>a.quartier_attribue&&a.quartier_attribue===a.quartier_origine).length}/>
    <StatBig label="Changement de quartier" color={C.blue}
      val={aud.filter(a=>a.quartier_attribue&&a.quartier_attribue!==a.quartier_origine).length}/>
    <StatBig label="Q. souhaité obtenu" color={C.teal}
      val={aud.filter(a=>a.quartier_attribue&&a.quartier_attribue===a.quartier_souhaite).length}
      sub="quartier obtenu = souhaité"/>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
    <Card title="Flux de mobilité" subtitle="Quartier d'origine -> Quartier attribué">
      {migTop.length===0?(
        <div style={{color:C.muted,fontSize:12,padding:20,textAlign:"center"}}>
          Aucune mobilité enregistrée</div>
      ):migTop.map((m,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:11.5,fontWeight:600,color:C.text,minWidth:90,textAlign:"right"}}>
            {m.from}</span>
          <div style={{flex:1,height:3,background:m.from===m.to?C.teal:C.accent,
            borderRadius:99,opacity:0.4+m.count*0.15}}/>
          <span style={{fontSize:10,fontWeight:700,color:C.muted}}>-></span>
          <span style={{fontSize:11.5,fontWeight:600,color:C.text,minWidth:90}}>{m.to}</span>
          <span style={{fontSize:11,fontWeight:700,color:m.from===m.to?C.teal:C.accent,
            minWidth:30,textAlign:"right"}}>{m.count}</span>
        </div>
      ))}
    </Card>
    <Card title="Sollicitations par quartier élu">
      {(()=>{
        const byQ={};
        aud.forEach(a=>{if(a.quartier_elu)byQ[a.quartier_elu]=(byQ[a.quartier_elu]||0)+1;});
        const qBarData=Object.entries(byQ).sort((a,b)=>b[1]-a[1])
          .map(([label,val])=>({label,val}));
        return <BarChart data={qBarData} unit=" aud."/>;
      })()}
    </Card>
    <Card title="Demandeurs sans logement en attente" style={{gridColumn:"1/-1"}}>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {(()=>{
          const byQ={};
          aud.filter(a=>a.statut!=="Attribué").forEach(a=>{
            if(a.quartier_souhaite) byQ[a.quartier_souhaite]=(byQ[a.quartier_souhaite]||0)+1;
          });
          return Object.entries(byQ).sort((a,b)=>b[1]-a[1]).map(([q,n])=>(
            <div key={q} style={{background:C.bg,borderRadius:10,padding:"12px 16px",
              textAlign:"center",minWidth:90}}>
              <div style={{fontSize:22,fontWeight:800,color:C.accent,fontFamily:F.h}}>{n}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{q}</div>
            </div>
          ));
        })()}
      </div>
    </Card>
  </div>
</>}

{/* ── ÉLUS ── */}
{tab==="elus"&&<>
  <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
    <StatBig label="Élus actifs" val={elus.length} color={C.purple}/>
    <StatBig label="Audiences enreg." val={aud.length} color={C.accent}/>
    <StatBig label="Taux global attrib." val={`${tauxAttr}%`} color={C.green}/>
    <StatBig label="Notifications non lues"
      val={notifs.filter(n=>!n.lu).length} color={C.amber}/>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:20}}>
    {parElu.map(e=>(
      <Card key={e.id}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:38,height:38,borderRadius:9,background:C.purpleBg,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:15,fontWeight:800,color:C.purple,fontFamily:F.h}}>
            {e.nom.split(" ").pop()?.[0]}{e.prenom?.[0]}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:13,color:C.text,fontFamily:F.h}}>{e.nom}</div>
            <div style={{fontSize:11,color:C.muted}}>{e.secteur}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            {l:"Audiences",v:e.nb,c:C.purple},
            {l:"Favorables",v:e.fav,c:C.green},
            {l:"Attribuées",v:e.attrib,c:C.accent},
            {l:"Taux attrib.",v:`${e.taux}%`,c:e.taux>=50?C.green:e.taux>=25?C.amber:C.red},
          ].map((s,i)=>(
            <div key={i} style={{textAlign:"center",background:C.bg,borderRadius:8,padding:"8px 4px"}}>
              <div style={{fontSize:18,fontWeight:800,color:s.c,fontFamily:F.h}}>{s.v}</div>
              <div style={{fontSize:10,color:C.muted}}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:10.5,color:C.muted}}>Taux d'attribution</span>
            <span style={{fontSize:10.5,fontWeight:700,
              color:e.taux>=50?C.green:e.taux>=25?C.amber:C.red}}>{e.taux}%</span>
          </div>
          <div style={{height:6,background:"#EEF1F6",borderRadius:99}}>
            <div style={{height:"100%",width:`${e.taux}%`,borderRadius:99,
              background:e.taux>=50?C.green:e.taux>=25?C.amber:C.red}}/>
          </div>
        </div>
      </Card>
    ))}
    {elus.length===0&&<div style={{color:C.muted,fontSize:13,padding:20}}>
      Aucun élu enregistré dans les référentiels.</div>}
  </div>
  <Card title="Comparaison élus - audiences et attributions">
    <ColumnChart height={150} data={parElu.map(e=>({label:e.nom.split(" ").pop(),val:e.nb,color:C.purple}))}/>
    <div style={{marginTop:12}}>
      <ColumnChart height={100} data={parElu.map(e=>({label:e.nom.split(" ").pop(),val:e.attrib,color:C.green}))}/>
    </div>
    <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.muted}}>
      <span style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{width:10,height:10,background:C.purple,borderRadius:2,display:"inline-block"}}/>Audiences
      </span>
      <span style={{display:"flex",alignItems:"center",gap:4}}>
        <span style={{width:10,height:10,background:C.green,borderRadius:2,display:"inline-block"}}/>Attributions
      </span>
    </div>
  </Card>
</>}

{/* ── IMPORT EXCEL ── */}
{tab==="import"&&(
  <div style={{maxWidth:800}}>
    <div style={{marginBottom:20}}>
      <div style={{fontFamily:F.h,fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>
        Import audiences depuis Excel / CSV</div>
      <div style={{fontSize:13,color:C.muted,lineHeight:1.6}}>
        Tu peux importer directement le tableau Excel de ta collègue.<br/>
        Le système fait correspondre automatiquement les colonnes et lie les audiences aux demandeurs et élus existants.
      </div>
    </div>
    <Card>
      <ImportExcelAudiences
        elus={elus}
        demandeurs={dem}
        ref={ref}
        onImported={(ok,fail)=>{
          setImportResult({ok,fail});
          setTab("elus");
        }}
      />
    </Card>
  </div>
)}

  </div>;
}