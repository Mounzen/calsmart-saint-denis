
// ═══════════════════════════════════════════════════════════════
// Logivia - ImportPelehas.jsx
// Import CSV depuis Pelehas AFI
// Gère : Demandeurs - Logements - Attributions - Audiences élus
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from "react";

const C = {
navy:"#0B1E3D", accent:"#E05C2A", accentL:"rgba(224,92,42,0.10)",
bg:"#EEF1F6", card:"#FFFFFF", text:"#0B1E3D", muted:"#5B6B85",
border:"#DDE3EE", green:"#16A34A", greenBg:"#DCFCE7",
amber:"#D97706", amberBg:"#FEF3C7", red:"#DC2626", redBg:"#FEE2E2",
purple:"#7C3AED", purpleBg:"#EDE9FE", teal:"#0D9488", tealBg:"#CCFBF1",
blue:"#1D6FA8", blueBg:"#DBEAFE",
};
const F = { h:"'Syne',sans-serif", b:"'DM Sans',sans-serif" };

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
post: async (path, body) => {
const r = await fetch(`/api${path}`, {
method:"POST", headers:{"Content-Type":"application/json"},
body: JSON.stringify(body)
});
if (!r.ok) throw new Error(`${r.status}`);
return r.json();
},
get: async (path) => {
const r = await fetch(`/api${path}`);
if (!r.ok) throw new Error(`${r.status}`);
return r.json();
},
};

// ─── PARSE CSV ───────────────────────────────────────────────────────────────
function parseCSV(text) {
// Détecte séparateur ; ou , ou tabulation
const firstLine = text.split("\n")[0];
const sep = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

const lines = text.split("\n").filter(l => l.trim());
if (lines.length < 2) return { headers: [], rows: [] };

// Gestion des guillemets
const parseLine = (line) => {
const result = [];
let cur = "", inQ = false;
for (let i = 0; i < line.length; i++) {
const c = line[i];
if (c === '"') { inQ = !inQ; continue; }
if (c === sep && !inQ) { result.push(cur.trim()); cur = ""; continue; }
cur += c;
}
result.push(cur.trim());
return result;
};

const headers = parseLine(lines[0]).map(h => h.replace(/['"]/g, "").trim());
const rows = lines.slice(1)
.map(l => {
const vals = parseLine(l);
const obj = {};
headers.forEach((h, i) => obj[h] = (vals[i] || "").replace(/['"]/g, "").trim());
return obj;
})
.filter(r => Object.values(r).some(v => v));

return { headers, rows };
}

// ─── MAPPING PELEHAS -> Logivia ───────────────────────────────────────────────
// Pelehas exporte avec des noms de colonnes standardisés (FR)
// On mappe automatiquement en cherchant des correspondances
const MAPPINGS = {
demandeurs: [
// [clé interne, colonnes Pelehas possibles]
["nud", ["nud", "numéro unique", "numero unique", "n unique", "num unique", "identifiant", "id demande"]],
["nom", ["nom", "nom demandeur", "nom du demandeur", "name"]],
["prenom", ["prénom", "prenom", "prénom demandeur", "first name"]],
["date_naissance", ["date naissance", "date de naissance", "naissance", "ddn"]],
["telephone", ["téléphone", "telephone", "tel", "tél", "phone"]],
["email", ["email", "mail", "courriel", "e-mail"]],
["adresse", ["adresse", "adresse actuelle", "rue", "domicile"]],
["nb_adultes", ["nb adultes", "nombre adultes", "adultes", "nbre adultes"]],
["nb_enfants", ["nb enfants", "nombre enfants", "enfants", "nbre enfants"]],
["revenu", ["revenu", "revenus", "revenu mensuel", "ressources", "rev mensuel", "rmi", "ressources mensuelles"]],
["sit_logement", ["situation logement", "situation actuelle", "sit logement", "type logement actuel"]],
["typ_demande", ["type logement", "typ logement", "typo logement", "typ demandé", "type souhaité", "logement souhaité", "f2", "f3", "t2", "t3"]],
["anciennete", ["ancienneté", "anciennete", "ancienneté mois", "durée demande", "duree demande", "mois"]],
["quartier", ["quartier", "quartier souhaité", "secteur", "commune souhaitée", "localisation souhaitée"]],
["statut", ["statut", "état", "etat", "état demande", "statut demande"]],
["priorite_dalo", ["dalo", "priorité dalo", "reconnu dalo"]],
["urgence", ["urgence", "urgent", "prioritaire", "priorité"]],
["handicap", ["handicap", "pmr", "mobilité réduite", "handicapé"]],
["violences", ["vif", "violences", "violence conjugale", "victimes violences"]],
["sans_log", ["sans logement", "sdf", "sans domicile", "sans abri"]],
["pieces", ["dossier complet", "pièces", "pieces", "documents", "complet"]],
],
logements: [
["ref", ["référence", "ref", "référence logement", "id logement", "code logement"]],
["adresse", ["adresse", "adresse logement", "rue", "localisation"]],
["quartier", ["quartier", "quartier logement", "secteur", "localité"]],
["bailleur", ["bailleur", "organisme", "opérateur", "hlm", "gestionnaire"]],
["typ", ["type", "typ", "typo", "typologie", "f2", "f3", "t2", "t3", "nb pièces"]],
["surface", ["surface", "superficie", "m2", "m2"]],
["loyer", ["loyer", "loyer total", "loyer mensuel", "montant loyer"]],
["loyer_hc", ["loyer hc", "loyer hors charges", "loyer base"]],
["charges", ["charges", "provision charges", "charges locatives"]],
["etage", ["étage", "etage", "niveau"]],
["contingent", ["contingent", "réservataire", "reservataire", "quota"]],
["dispo", ["disponibilité", "date disponibilité", "date vacance", "libre le"]],
["statut", ["statut", "état", "disponible", "occupé", "vacant"]],
],
audiences: [
["date_audience", ["date audience", "date", "date entretien", "date permanence", "date rdv"]],
["nom_demandeur", ["nom", "nom demandeur", "bénéficiaire", "habitant", "administré"]],
["prenom_demandeur", ["prénom", "prenom", "prénom demandeur"]],
["nud", ["nud", "numéro unique", "num unique", "identifiant"]],
["elu", ["élu", "elu", "conseiller", "nom élu", "représentant", "interlocuteur"]],
["quartier", ["quartier", "secteur", "lieu", "territoire", "zone"]],
["objet", ["objet", "motif", "demande", "sujet", "nature", "problème", "type demande"]],
["suite", ["suite", "action", "décision", "résultat", "orientation", "réponse"]],
["favorable", ["favorable", "avis", "soutien", "appui", "positif", "accord"]],
],
};

function autoMap(headers, type) {
const map = {};
const headersLow = headers.map(h => h.toLowerCase().trim());
MAPPINGS[type].forEach(([key, aliases]) => {
const found = headersLow.findIndex(h =>
aliases.some(a => h.includes(a.toLowerCase()) || a.toLowerCase().includes(h))
);
if (found >= 0) map[key] = headers[found];
});
return map;
}

// ─── NORMALISATION ───────────────────────────────────────────────────────────
function normalizeTypo(val) {
if (!val) return "T3";
const v = val.toUpperCase().trim();
if (v.includes("1") || v === "F1" || v === "T1" || v === "STUDIO") return "T1";
if (v.includes("2") || v === "F2" || v === "T2") return "T2";
if (v.includes("3") || v === "F3" || v === "T3") return "T3";
if (v.includes("4") || v === "F4" || v === "T4") return "T4";
if (v.includes("5") || v === "F5" || v === "T5") return "T5";
return "T3";
}

function normalizeOuiNon(val) {
if (!val) return false;
return ["oui","yes","o","1","true","x","v","vrai","favorable","complet"].includes(
val.toLowerCase().trim()
);
}

function normalizeRevenu(val) {
if (!val) return 0;
const n = parseFloat(val.replace(/[^\d.,]/g, "").replace(",", "."));
return isNaN(n) ? 0 : Math.round(n);
}

function normalizeStatut(val) {
if (!val) return "active";
const v = val.toLowerCase();
if (v.includes("activ") || v.includes("valide") || v.includes("en cours")) return "active";
if (v.includes("attribu") || v.includes("logé")) return "attribuee";
if (v.includes("radié") || v.includes("radie") || v.includes("annul")) return "radiee";
if (v.includes("expir") || v.includes("périmé")) return "expiree";
return "active";
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
return <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:99,
fontSize:11, fontWeight:600, color, background:bg, marginRight:4 }}>{label}</span>;
}

function StepDot({ n, active, done }) {
return <div style={{ width:28, height:28, borderRadius:"50%",
background: done ? C.green : active ? C.accent : "#E8EDF6",
display:"flex", alignItems:"center", justifyContent:"center",
fontSize:12, fontWeight:800, color: (done||active) ? "#fff" : C.muted,
flexShrink:0 }}>
{done ? "v" : n}

  </div>;
}

function ProgressBar({ val, max, color=C.accent }) {
return <div style={{ height:6, background:"#EEF1F6", borderRadius:99, overflow:"hidden" }}>
<div style={{ height:"100%", width:`${Math.min(val/max*100,100)}%`,
background:color, borderRadius:99, transition:"width .4s" }}/>

  </div>;
}

// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
export default function ImportPelehas({ onDone }) {
const [step, setStep] = useState(0); // 0=choix type, 1=upload, 2=mapping, 3=preview, 4=import, 5=done
const [type, setType] = useState(null); // demandeurs | logements | audiences
const [parsed, setParsed] = useState(null); // { headers, rows }
const [mapping, setMapping] = useState({});
const [preview, setPreview] = useState([]);
const [errors, setErrors] = useState([]);
const [progress, setProgress] = useState({ done:0, total:0, errors:0 });
const [importing, setImporting] = useState(false);
const [log, setLog] = useState([]);
const fileRef = useRef();

const TYPES = [
{ id:"demandeurs", label:"Demandeurs", ico:"📋", desc:"Dossiers demandeurs depuis Pelehas",
color:C.accent, bg:C.accentL },
{ id:"logements", label:"Logements", ico:"🏠", desc:"Parc social et logements disponibles",
color:C.blue, bg:C.blueBg },
{ id:"audiences", label:"Audiences élus", ico:"*", desc:"Permanences et audiences élus",
color:C.purple, bg:C.purpleBg },
];

// ── Lecture fichier ──
const handleFile = (file) => {
const ext = file.name.split(".").pop().toLowerCase();
if (!["csv","txt"].includes(ext)) {
alert("Format non supporté. Exporte en CSV depuis Pelehas : Fichier -> Exporter -> CSV");
return;
}
const reader = new FileReader();
reader.onload = (e) => {
// Essai UTF-8 d'abord, sinon Latin-1
let text = e.target.result;
const result = parseCSV(text);
if (result.headers.length === 0) {
alert("Fichier vide ou format non reconnu.");
return;
}
setParsed(result);
const autoM = autoMap(result.headers, type);
setMapping(autoM);
setStep(2);
};
reader.readAsText(file, "UTF-8");
};

// ── Génération preview ──
const buildPreview = useCallback(() => {
if (!parsed) return;
const errs = [];
const rows = parsed.rows.slice(0, 200).map((row, i) => {
const get = (key) => mapping[key] ? row[mapping[key]] || "" : "";

  if (type === "demandeurs") {
    const nud = get("nud");
    const nom = get("nom");
    const prenom = get("prenom");
    if (!nom) errs.push(`Ligne ${i+2} : nom manquant`);
    return {
      _ok: !!nom,
      nud, nom, prenom,
      anc: parseInt(get("anciennete")) || 0,
      adultes: parseInt(get("nb_adultes")) || 1,
      enfants: parseInt(get("nb_enfants")) || 0,
      rev: normalizeRevenu(get("revenu")),
      typ_v: normalizeTypo(get("typ_demande")),
      typ_min: normalizeTypo(get("typ_demande")),
      typ_max: normalizeTypo(get("typ_demande")),
      sit: get("sit_logement"),
      statut: normalizeStatut(get("statut")),
      dalo: normalizeOuiNon(get("priorite_dalo")),
      urgence: normalizeOuiNon(get("urgence")),
      handicap: normalizeOuiNon(get("handicap")),
      pmr: normalizeOuiNon(get("handicap")),
      violences: normalizeOuiNon(get("violences")),
      sans_log: normalizeOuiNon(get("sans_log")),
      pieces: normalizeOuiNon(get("pieces")),
      quartiers: get("quartier") ? [get("quartier")] : [],
      secteurs: [],
      compo: `${get("nb_adultes")||1} adulte(s) + ${get("nb_enfants")||0} enfant(s)`,
      parcours: [{
        date: new Date().toLocaleDateString("fr-FR"),
        type: "Import Pelehas",
        detail: `Importé le ${new Date().toLocaleDateString("fr-FR")}`
      }],
    };
  }

  if (type === "logements") {
    const ref = get("ref");
    const adresse = get("adresse");
    if (!adresse && !ref) errs.push(`Ligne ${i+2} : adresse et référence manquantes`);
    const loyer_hc = normalizeRevenu(get("loyer_hc")) || normalizeRevenu(get("loyer"));
    const charges = normalizeRevenu(get("charges"));
    return {
      _ok: !!(adresse || ref),
      ref: ref || `IMPORT-${i+1}`,
      adresse: adresse || "-",
      quartier: get("quartier"),
      secteur: "",
      bailleur: get("bailleur"),
      typ: normalizeTypo(get("typ")),
      surface: parseFloat(get("surface")) || 0,
      loyer_hc,
      charges,
      loyer: loyer_hc + charges || normalizeRevenu(get("loyer")),
      etage: parseInt(get("etage")) || 0,
      asc: false, rdc: false, pmr: false,
      contingent: get("contingent") || "Ville",
      dispo: get("dispo"),
      plafond: "PLUS",
      statut: normalizeStatut(get("statut")) === "active" ? "vacant" : "attribué",
      ecole: false, transport: false,
    };
  }

  if (type === "audiences") {
    const date = get("date_audience");
    const nom = get("nom_demandeur");
    if (!date) errs.push(`Ligne ${i+2} : date manquante`);
    return {
      _ok: !!date,
      date_audience: date,
      dem_nom: `${nom} ${get("prenom_demandeur")}`.trim(),
      dem_nud: get("nud"),
      elu_nom: get("elu"),
      quartier_elu: get("quartier"),
      quartier_origine: get("quartier"),
      quartier_souhaite: get("quartier"),
      quartier_attribue: null,
      objet: get("objet"),
      suite: get("suite"),
      favorable: normalizeOuiNon(get("favorable")),
      statut: "En attente proposition",
      jours_audience_proposition: null,
      jours_proposition_attribution: null,
    };
  }
  return null;
}).filter(Boolean);

setErrors(errs.slice(0, 10));
setPreview(rows);
setStep(3);

}, [parsed, mapping, type]);

// ── Import réel via batch ──
const doImport = async () => {
setImporting(true);
setStep(4);
const validRows = preview.filter(r => r._ok);
setProgress({ done:0, total:validRows.length, errors:0 });

try {
  // Choisir l'endpoint batch selon le type
  const endpoint = type === "demandeurs" ? "/import/demandeurs"
    : type === "logements" ? "/import/logements"
    : "/import/audiences";

  // Préparer les rows en nettoyant les champs internes
  const rows = validRows.map(r => {
    const clean = { ...r };
    delete clean._ok;
    return clean;
  });

  const result = await api.post(endpoint, { rows });

  setProgress({
    done: (result.imported||0) + (result.updated||0) + (result.matched||0),
    total: validRows.length,
    errors: result.errors||0,
  });

  setLog([
    { ok:true, msg:`${result.imported||0} nouvelles entrées importées` },
    result.updated>0 && { ok:true, msg:`${result.updated} entrées mises à jour` },
    result.matched>0 && { ok:true, msg:`${result.matched} candidats matchés automatiquement` },
    result.unmatched>0 && { ok:false, msg:`${result.unmatched} candidats non trouvés dans la base` },
    result.errors>0 && { ok:false, msg:`${result.errors} erreurs` },
  ].filter(Boolean));

} catch(e) {
  setLog([{ ok:false, msg:`Erreur : ${e.message}` }]);
  setProgress(p => ({ ...p, errors:1 }));
}

setImporting(false);
setStep(5);

};

const reset = () => {
setStep(0); setType(null); setParsed(null);
setMapping({}); setPreview([]); setErrors([]);
setProgress({ done:0, total:0, errors:0 }); setLog([]);
};

// ── ÉTAPES UI ──────────────────────────────────────────────────────────────

// Stepper header
const STEPS = ["Type","Fichier","Colonnes","Aperçu","Import","Terminé"];

return <div style={{ fontFamily:F.b }}>
{/* Header */}
<div style={{ marginBottom:28 }}>
<h2 style={{ fontFamily:F.h, fontSize:18, fontWeight:800, color:C.text,
margin:"0 0 4px", letterSpacing:"-0.03em" }}>Import depuis Pelehas</h2>
<p style={{ color:C.muted, fontSize:12.5 }}>
Importe tes données CSV exportées depuis AFI-Pelehas directement dans Logivia.</p>
</div>

{/* Stepper */}
<div style={{ display:"flex", alignItems:"center", marginBottom:28, gap:0 }}>
  {STEPS.map((s, i) => (
    <div key={i} style={{ display:"flex", alignItems:"center", flex: i<STEPS.length-1?1:0 }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
        <StepDot n={i+1} active={step===i} done={step>i}/>
        <span style={{ fontSize:10, color:step>=i?C.text:C.muted, fontWeight:step===i?700:400,
          whiteSpace:"nowrap" }}>{s}</span>
      </div>
      {i < STEPS.length-1 && (
        <div style={{ flex:1, height:2, background:step>i?C.green:"#E8EDF6",
          margin:"0 6px", marginBottom:14, transition:"background .3s" }}/>
      )}
    </div>
  ))}
</div>

{/* ── ÉTAPE 0 : Choix du type ── */}
{step===0&&(
  <div>
    <div style={{ fontFamily:F.h, fontSize:12, fontWeight:700, color:C.text,
      marginBottom:14 }}>Que veux-tu importer depuis Pelehas ?</div>
    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
      {TYPES.map(t=>(
        <button key={t.id} onClick={()=>{ setType(t.id); setStep(1); }}
          style={{ flex:"1 1 200px", padding:"20px 20px", borderRadius:12,
            border:`2px solid ${C.border}`, background:C.card, cursor:"pointer",
            textAlign:"left", transition:"all .15s" }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor=t.color; e.currentTarget.style.background=t.bg; }}
          onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.background=C.card; }}>
          <div style={{ fontSize:28, marginBottom:10 }}>{t.ico}</div>
          <div style={{ fontFamily:F.h, fontSize:15, fontWeight:700, color:t.color,
            marginBottom:4 }}>{t.label}</div>
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.4 }}>{t.desc}</div>
        </button>
      ))}
    </div>

    {/* Instructions Pelehas */}
    <div style={{ marginTop:24, background:"#F8F7FF", borderRadius:12, padding:18,
      border:`1px solid ${C.purple}22` }}>
      <div style={{ fontFamily:F.h, fontSize:12, fontWeight:700, color:C.purple,
        marginBottom:12 }}>Comment exporter depuis Pelehas ?</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
        {[
          { ico:"📋", label:"Demandeurs",
            steps:["Pelehas -> Demandeurs","Recherche -> Tous","Exporter -> CSV","Séparateur ;"] },
          { ico:"🏠", label:"Logements",
            steps:["Pelehas -> Parc Social","Liste des logements","Exporter -> CSV","Séparateur ;"] },
          { ico:"*", label:"Audiences",
            steps:["Créer un tableau Excel","Colonnes : Date, Nom, Élu, Quartier, Objet","Enregistrer en CSV","Séparateur ; ou ,"] },
        ].map((g,i)=>(
          <div key={i}>
            <div style={{ fontWeight:700, fontSize:12, color:C.text, marginBottom:8 }}>
              {g.ico} {g.label}</div>
            {g.steps.map((s,j)=>(
              <div key={j} style={{ display:"flex", alignItems:"flex-start", gap:8,
                marginBottom:5 }}>
                <div style={{ width:18, height:18, borderRadius:"50%", background:C.purple,
                  color:"#fff", fontSize:10, fontWeight:700, display:"flex",
                  alignItems:"center", justifyContent:"center", flexShrink:0 }}>{j+1}</div>
                <span style={{ fontSize:11.5, color:C.text }}>{s}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
)}

{/* ── ÉTAPE 1 : Upload fichier ── */}
{step===1&&(
  <div>
    <div style={{ background:C.bg, borderRadius:12, padding:32, textAlign:"center",
      border:`2px dashed ${C.border}`, marginBottom:20 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>
        {TYPES.find(t=>t.id===type)?.ico}
      </div>
      <div style={{ fontFamily:F.h, fontSize:15, fontWeight:700, color:C.text,
        marginBottom:6 }}>
        Importer {TYPES.find(t=>t.id===type)?.label}
      </div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:20, lineHeight:1.6 }}>
        Fichier <b>.csv</b> exporté depuis Pelehas<br/>
        Encodage UTF-8 ou Latin-1 accepté - Séparateur ; ou , ou tabulation
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt"
        style={{ display:"none" }} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
      <button onClick={()=>fileRef.current.click()}
        style={{ padding:"12px 28px", background:C.accent, color:"#fff", border:"none",
          borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:13, fontWeight:700 }}>
        Choisir le fichier CSV
      </button>
      {/* Drag & drop */}
      <div style={{ marginTop:16, fontSize:12, color:C.muted }}>
        ou glisse ton fichier ici
      </div>
    </div>
    <button onClick={()=>setStep(0)}
      style={{ padding:"7px 14px", border:`1px solid ${C.border}`, borderRadius:8,
        background:"transparent", cursor:"pointer", fontFamily:F.h, fontSize:12,
        fontWeight:600, color:C.muted }}>← Retour</button>
  </div>
)}

{/* ── ÉTAPE 2 : Mapping colonnes ── */}
{step===2&&parsed&&(
  <div>
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      marginBottom:16 }}>
      <div>
        <div style={{ fontFamily:F.h, fontSize:14, fontWeight:700, color:C.text }}>
          {parsed.rows.length} lignes détectées - {parsed.headers.length} colonnes</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
          Vérifiez la correspondance entre les colonnes Pelehas et les champs Logivia.
          Les colonnes reconnues automatiquement sont présélectionnées.
        </div>
      </div>
      <button onClick={buildPreview}
        style={{ padding:"10px 20px", background:C.accent, color:"#fff", border:"none",
          borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
        Valider -> Aperçu
      </button>
    </div>

    {/* Aperçu colonnes brutes */}
    <div style={{ background:C.bg, borderRadius:9, padding:12, marginBottom:16,
      overflowX:"auto" }}>
      <div style={{ fontSize:11, color:C.muted, marginBottom:6, fontWeight:600 }}>
        Colonnes trouvées dans ton fichier :</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {parsed.headers.map(h=>(
          <span key={h} style={{ fontSize:11, padding:"3px 9px", borderRadius:6,
            background:Object.values(mapping).includes(h)?C.greenBg:C.card,
            border:`1px solid ${Object.values(mapping).includes(h)?C.green:C.border}`,
            color:Object.values(mapping).includes(h)?C.green:C.text, fontWeight:600 }}>
            {h}
            {Object.values(mapping).includes(h)&&" v"}
          </span>
        ))}
      </div>
    </div>

    {/* Table de mapping */}
    <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`,
      overflow:"hidden" }}>
      <div style={{ background:C.navy, padding:"10px 16px",
        display:"flex", gap:16 }}>
        <span style={{ fontFamily:F.h, fontSize:11, fontWeight:700, color:"#fff",
          flex:1 }}>Champ Logivia</span>
        <span style={{ fontFamily:F.h, fontSize:11, fontWeight:700, color:"#fff",
          flex:1 }}>Colonne Pelehas</span>
        <span style={{ fontFamily:F.h, fontSize:11, fontWeight:700, color:C.light,
          flex:1 }}>Exemple de valeur</span>
      </div>
      <div style={{ overflowY:"auto", maxHeight:400 }}>
        {MAPPINGS[type].map(([key, aliases]) => {
          const example = mapping[key] && parsed.rows[0]
            ? parsed.rows[0][mapping[key]] : "";
          const required = ["nud","nom","date_audience","adresse","ref"].includes(key);
          return <div key={key} style={{ display:"flex", alignItems:"center", gap:16,
            padding:"9px 16px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{key}</span>
              {required&&<span style={{ fontSize:10, color:C.red, marginLeft:4 }}>*</span>}
              <div style={{ fontSize:10, color:C.muted }}>{aliases[0]}</div>
            </div>
            <div style={{ flex:1 }}>
              <select value={mapping[key]||""} onChange={e=>setMapping(p=>({...p,[key]:e.target.value}))}
                style={{ width:"100%", padding:"6px 9px", borderRadius:7,
                  border:`1px solid ${mapping[key]?C.green:C.border}`,
                  fontFamily:F.b, fontSize:12, color:C.text, background:C.card }}>
                <option value="">- Non mappé -</option>
                {parsed.headers.map(h=><option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div style={{ flex:1, fontSize:11, color:C.muted, fontStyle:"italic",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {example||"-"}
            </div>
          </div>;
        })}
      </div>
    </div>

    <div style={{ display:"flex", justifyContent:"space-between", marginTop:16 }}>
      <button onClick={()=>setStep(1)} style={{ padding:"7px 14px",
        border:`1px solid ${C.border}`, borderRadius:8, background:"transparent",
        cursor:"pointer", fontFamily:F.h, fontSize:12, fontWeight:600, color:C.muted }}>
        ← Retour</button>
      <button onClick={buildPreview}
        style={{ padding:"10px 20px", background:C.accent, color:"#fff", border:"none",
          borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
        Valider -> Aperçu
      </button>
    </div>
  </div>
)}

{/* ── ÉTAPE 3 : Aperçu ── */}
{step===3&&(
  <div>
    <div style={{ display:"flex", gap:12, marginBottom:16 }}>
      <div style={{ background:C.greenBg, borderRadius:9, padding:"10px 16px",
        flex:1, textAlign:"center" }}>
        <div style={{ fontSize:22, fontWeight:800, color:C.green, fontFamily:F.h }}>
          {preview.filter(r=>r._ok).length}</div>
        <div style={{ fontSize:11, color:C.green }}>Lignes prêtes</div>
      </div>
      <div style={{ background:C.amberBg, borderRadius:9, padding:"10px 16px",
        flex:1, textAlign:"center" }}>
        <div style={{ fontSize:22, fontWeight:800, color:C.amber, fontFamily:F.h }}>
          {preview.filter(r=>!r._ok).length}</div>
        <div style={{ fontSize:11, color:C.amber }}>Lignes ignorées</div>
      </div>
      <div style={{ background:C.redBg, borderRadius:9, padding:"10px 16px",
        flex:1, textAlign:"center" }}>
        <div style={{ fontSize:22, fontWeight:800, color:C.red, fontFamily:F.h }}>
          {errors.length}</div>
        <div style={{ fontSize:11, color:C.red }}>Avertissements</div>
      </div>
    </div>

    {errors.length>0&&(
      <div style={{ background:C.amberBg, borderRadius:9, padding:12, marginBottom:14,
        border:`1px solid ${C.amber}33` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.amber, marginBottom:6 }}>
          Avertissements</div>
        {errors.map((e,i)=>(
          <div key={i} style={{ fontSize:12, color:C.text }}>{e}</div>
        ))}
      </div>
    )}

    {/* Table aperçu */}
    <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`,
      overflow:"hidden", marginBottom:16 }}>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:C.bg }}>
              <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>
                Statut</th>
              {type==="demandeurs"&&<>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>NUD</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Nom</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Prénom</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Typ.</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Revenu</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Flags</th>
              </>}
              {type==="logements"&&<>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Réf.</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Adresse</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Typ.</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Loyer</th>
              </>}
              {type==="audiences"&&<>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Date</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Demandeur</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Élu</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Objet</th>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, borderBottom:`1px solid ${C.border}` }}>Favorable</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {preview.slice(0,15).map((row,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}`,
                background:row._ok?"transparent":"#FFFBEB" }}>
                <td style={{ padding:"8px 12px" }}>
                  <span style={{ fontSize:11, padding:"2px 7px", borderRadius:99,
                    fontWeight:600,
                    background:row._ok?C.greenBg:C.amberBg,
                    color:row._ok?C.green:C.amber }}>
                    {row._ok?"v OK":"(!) Incomplet"}</span>
                </td>
                {type==="demandeurs"&&<>
                  <td style={{ padding:"8px 12px", color:C.muted, fontSize:11 }}>{row.nud||"-"}</td>
                  <td style={{ padding:"8px 12px", fontWeight:700, color:C.text }}>{row.nom}</td>
                  <td style={{ padding:"8px 12px", color:C.text }}>{row.prenom}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontFamily:F.h, fontWeight:700, color:C.accent }}>{row.typ_v}</span>
                  </td>
                  <td style={{ padding:"8px 12px", color:C.text }}>{row.rev>0?`${row.rev.toLocaleString()} EUR`:"-"}</td>
                  <td style={{ padding:"8px 12px" }}>
                    {row.dalo&&<Badge label="DALO" color={C.red} bg={C.redBg}/>}
                    {row.violences&&<Badge label="VIF" color={C.red} bg={C.redBg}/>}
                    {row.sans_log&&<Badge label="SDF" color={C.red} bg={C.redBg}/>}
                    {row.urgence&&<Badge label="Urgent" color={C.amber} bg={C.amberBg}/>}
                    {row.handicap&&<Badge label="PMR" color={C.purple} bg={C.purpleBg}/>}
                  </td>
                </>}
                {type==="logements"&&<>
                  <td style={{ padding:"8px 12px", color:C.muted, fontSize:11 }}>{row.ref}</td>
                  <td style={{ padding:"8px 12px", fontWeight:700, color:C.text }}>{row.adresse}</td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontFamily:F.h, fontWeight:700, color:C.accent }}>{row.typ}</span>
                  </td>
                  <td style={{ padding:"8px 12px", color:C.text }}>
                    {row.loyer>0?`${row.loyer} EUR/mois`:"-"}</td>
                </>}
                {type==="audiences"&&<>
                  <td style={{ padding:"8px 12px", color:C.muted }}>{row.date_audience}</td>
                  <td style={{ padding:"8px 12px", fontWeight:700, color:C.text }}>{row.dem_nom||"-"}</td>
                  <td style={{ padding:"8px 12px", color:C.purple, fontWeight:600 }}>{row.elu_nom||"-"}</td>
                  <td style={{ padding:"8px 12px", color:C.muted, fontSize:11, maxWidth:160 }}>
                    <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {row.objet||"-"}</div>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ fontSize:11, fontWeight:600,
                      color:row.favorable?C.green:C.muted }}>
                      {row.favorable?"v Oui":"Non"}</span>
                  </td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.length>15&&(
        <div style={{ padding:"8px 14px", fontSize:11, color:C.muted,
          borderTop:`1px solid ${C.border}` }}>
          + {preview.length-15} lignes supplémentaires
        </div>
      )}
    </div>

    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <button onClick={()=>setStep(2)} style={{ padding:"7px 14px",
        border:`1px solid ${C.border}`, borderRadius:8, background:"transparent",
        cursor:"pointer", fontFamily:F.h, fontSize:12, fontWeight:600, color:C.muted }}>
        ← Modifier le mapping</button>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:12, color:C.muted }}>
          {preview.filter(r=>r._ok).length} lignes seront importées
        </span>
        <button onClick={doImport} disabled={preview.filter(r=>r._ok).length===0}
          style={{ padding:"11px 24px", background:C.accent, color:"#fff", border:"none",
            borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:13, fontWeight:700,
            opacity:preview.filter(r=>r._ok).length===0?0.5:1 }}>
          Lancer l'import ->
        </button>
      </div>
    </div>
  </div>
)}

{/* ── ÉTAPE 4 : Import en cours ── */}
{step===4&&(
  <div style={{ textAlign:"center" }}>
    <div style={{ fontFamily:F.h, fontSize:16, fontWeight:700, color:C.text,
      marginBottom:24 }}>
      Import en cours...</div>
    <div style={{ background:C.card, borderRadius:12, padding:24,
      border:`1px solid ${C.border}`, marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <span style={{ fontSize:13, color:C.text }}>
          {progress.done} / {progress.total} lignes importées</span>
        <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>
          {progress.total>0?Math.round(progress.done/progress.total*100):0}%</span>
      </div>
      <ProgressBar val={progress.done} max={progress.total}/>
      {progress.errors>0&&(
        <div style={{ marginTop:8, fontSize:11.5, color:C.amber }}>
          {progress.errors} erreur(s)</div>
      )}
    </div>
    {/* Log */}
    <div style={{ background:C.bg, borderRadius:9, padding:14, maxHeight:200,
      overflowY:"auto", textAlign:"left" }}>
      {log.slice(-20).map((l,i)=>(
        <div key={i} style={{ fontSize:11.5, color:l.ok?C.green:C.red,
          marginBottom:3, display:"flex", gap:8 }}>
          <span>{l.ok?"v":"x"}</span>
          <span style={{ color:C.text }}>{l.msg}</span>
        </div>
      ))}
    </div>
  </div>
)}

{/* ── ÉTAPE 5 : Terminé ── */}
{step===5&&(
  <div style={{ textAlign:"center", padding:20 }}>
    <div style={{ fontSize:56, marginBottom:16 }}>
      {progress.errors===0 ? "✓" : "⚠"}
    </div>
    <div style={{ fontFamily:F.h, fontSize:20, fontWeight:800, color:C.text,
      marginBottom:8 }}>
      Import terminé !
    </div>
    <div style={{ fontSize:13, color:C.muted, marginBottom:24, lineHeight:1.6 }}>
      <span style={{ color:C.green, fontWeight:700 }}>{progress.done} lignes importées</span>
      {progress.errors>0&&<>
        {" - "}<span style={{ color:C.red, fontWeight:700 }}>{progress.errors} erreurs</span>
      </>}
      <br/>
      Les données sont maintenant disponibles dans Logivia.
    </div>
    <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
      <button onClick={reset}
        style={{ padding:"10px 22px", border:`1px solid ${C.border}`, borderRadius:9,
          background:"transparent", cursor:"pointer", fontFamily:F.h,
          fontSize:12.5, fontWeight:600, color:C.muted }}>
        Importer un autre fichier
      </button>
      <button onClick={()=>onDone&&onDone({ type, done:progress.done, errors:progress.errors })}
        style={{ padding:"10px 22px", background:C.accent, color:"#fff", border:"none",
          borderRadius:9, cursor:"pointer", fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
        Voir les données ->
      </button>
    </div>
  </div>
)}

  </div>;
}