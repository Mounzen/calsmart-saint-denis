// ═══════════════════════════════════════════════════════════════
// Logivia - Telegram.jsx
// Gestion des connexions Telegram élus et candidats
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { apiFetch } from "./Auth.jsx";

const C = {
navy:"#0B1E3D", accent:"#E05C2A", accentL:"rgba(224,92,42,0.10)",
bg:"#EEF1F6", card:"#FFFFFF", text:"#0B1E3D", muted:"#5B6B85",
border:"#DDE3EE", green:"#16A34A", greenBg:"#DCFCE7",
amber:"#D97706", amberBg:"#FEF3C7", red:"#DC2626", redBg:"#FEE2E2",
purple:"#7C3AED", purpleBg:"#EDE9FE", teal:"#0D9488", tealBg:"#CCFBF1",
blue:"#1D6FA8", telegram:"#229ED9", telegramBg:"#E3F2FD",
};
const F = { h:"'Syne',sans-serif", b:"'DM Sans',sans-serif" };

function Tag({ text, color=C.muted, bg=C.bg }) {
return <span style={{ fontSize:11, padding:"2px 8px", borderRadius:5,
background:bg, color, fontWeight:600, marginRight:4 }}>{text}</span>;
}

const STATUT_COURRIER = {
  en_attente: { lib: "Reponse en attente", col: C.amber, bg: C.amberBg },
  prioritaire: { lib: "Dossier prioritaire", col: C.red, bg: C.redBg },
  deja_livre: { lib: "Operation deja livree", col: C.green, bg: C.greenBg },
  livre: { lib: "Logement attribue", col: C.green, bg: C.greenBg },
  refuse: { lib: "Refus motive", col: C.red, bg: C.redBg },
  en_etude: { lib: "En etude", col: C.blue, bg: "#DBEAFE" }
};

export default function TelegramPanel() {
const [elus, setElus] = useState([]);
const [demandeurs, setDemandeurs] = useState([]);
const [statutsElus, setStatutsElus] = useState({});
const [loading, setLoading] = useState(true);
const [liens, setLiens] = useState({});
const [sending, setSending] = useState({});
const [digestOk, setDigestOk] = useState(false);
const [tab, setTab] = useState("elus");
const [search, setSearch] = useState("");

// Courriers officiels
const [courriers, setCourriers] = useState([]);
const [statsCour, setStatsCour] = useState(null);
const [courrierForm, setCourrierForm] = useState(null); // { dem, statut, objet, corps, envoyer_telegram }
const [courrierSaving, setCourrierSaving] = useState(false);
const [courrierFilter, setCourrierFilter] = useState("");
const [changeStatut, setChangeStatut] = useState(null); // { courrier, nouveau_statut, motif }
const [chatIdEluForm, setChatIdEluForm] = useState(null); // { elu, chat_id }

// Test direct (Configuration)
const [testChatId, setTestChatId] = useState("");
const [testMessage, setTestMessage] = useState("");
const [testSending, setTestSending] = useState(false);
const [testResult, setTestResult] = useState(null); // { ok, message }
const [webhookInfo, setWebhookInfo] = useState(null);
const [webhookBusy, setWebhookBusy] = useState(false);

const reloadWebhookInfo = async () => {
  try {
    const info = await apiFetch('/telegram/webhook-info');
    setWebhookInfo(info);
  } catch(e) { setWebhookInfo({ error: e.message }); }
};

const sendTestDirect = async () => {
  if (!testChatId || !testChatId.trim()) {
    setTestResult({ ok:false, message:"Saisissez d abord un chat_id Telegram." });
    return;
  }
  setTestSending(true);
  setTestResult(null);
  try {
    const res = await apiFetch('/telegram/test-direct', {
      method:'POST',
      body:{
        chat_id: testChatId.trim(),
        texte: testMessage.trim() || undefined
      }
    });
    setTestResult({ ok:true, message: "Message de test envoye avec succes (message_id: " + (res?.message_id || '?') + ")." });
  } catch(e) {
    setTestResult({ ok:false, message: e.message || "Echec de l envoi." });
  } finally {
    setTestSending(false);
  }
};

const configurerWebhook = async () => {
  const defaultUrl = (typeof window !== 'undefined') ? window.location.origin : '';
  const url = prompt("URL publique de l application (sera suivie de /api/telegram/webhook)", defaultUrl);
  if (!url) return;
  setWebhookBusy(true);
  try {
    const res = await apiFetch('/telegram/setup-webhook', {
      method:'POST', body:{ app_url: url.trim() }
    });
    alert("Webhook configure : " + (res?.webhook_url || url));
    reloadWebhookInfo();
  } catch(e) { alert("Erreur : " + e.message); }
  finally { setWebhookBusy(false); }
};

const reloadCourriers = () => {
  apiFetch('/courriers').then(setCourriers).catch(() => {});
  apiFetch('/courriers/stats').then(setStatsCour).catch(() => {});
};

useEffect(() => {
Promise.all([
apiFetch('/elus'),
apiFetch('/demandeurs'),
]).then(([e, d]) => {
setElus(e);
setDemandeurs(d);
// Vérifier statut Telegram de chaque élu
Promise.all(e.map(elu =>
apiFetch(`/telegram/statut/elu/${elu.id}`)
.then(s => ({ id: elu.id, ...s }))
.catch(() => ({ id: elu.id, connecte: false }))
)).then(statuts => {
const map = {};
statuts.forEach(s => { map[s.id] = s.connecte; });
setStatutsElus(map);
});
}).finally(() => setLoading(false));
reloadCourriers();
}, []);

// Enregistrement manuel chat_id elu (pour essai sans webhook)
const saveChatIdElu = async () => {
  if (!chatIdEluForm || !chatIdEluForm.chat_id) return;
  try {
    await apiFetch('/telegram/register-elu/' + chatIdEluForm.elu.id, {
      method: 'POST', body: { chat_id: chatIdEluForm.chat_id }
    });
    setStatutsElus(p => ({ ...p, [chatIdEluForm.elu.id]: true }));
    setChatIdEluForm(null);
    alert('Chat_id enregistre. L elu peut recevoir les notifications.');
  } catch(e) { alert('Erreur : ' + e.message); }
};

const sendCourrier = async () => {
  if (!courrierForm) return;
  setCourrierSaving(true);
  try {
    await apiFetch('/courriers', {
      method: 'POST',
      body: {
        dem_id: courrierForm.dem.id,
        statut: courrierForm.statut,
        objet: courrierForm.objet,
        corps: courrierForm.corps,
        envoyer_telegram: !!courrierForm.envoyer_telegram
      }
    });
    setCourrierForm(null);
    reloadCourriers();
  } catch(e) { alert('Erreur : ' + e.message); }
  finally { setCourrierSaving(false); }
};

const appliqueStatut = async () => {
  if (!changeStatut || !changeStatut.motif) return alert('Motif obligatoire');
  try {
    await apiFetch('/courriers/' + changeStatut.courrier.id + '/statut', {
      method: 'PUT', body: { statut: changeStatut.nouveau_statut, motif: changeStatut.motif }
    });
    setChangeStatut(null);
    reloadCourriers();
  } catch(e) { alert('Erreur : ' + e.message); }
};

// Preset templates selon le statut choisi
const presetCourrier = (dem, statut) => {
  const objets = {
    en_attente: 'Votre demande de logement social - accuse de reception',
    prioritaire: 'Votre demande de logement social - dossier reconnu prioritaire',
    deja_livre: 'Votre demande de logement social - operation de relogement deja livree',
    livre: 'Votre demande de logement social - attribution',
    refuse: 'Votre demande de logement social - decision',
    en_etude: 'Votre demande de logement social - etude en cours'
  };
  return { dem, statut, objet: objets[statut] || '', corps: '', envoyer_telegram: false };
};

const getLien = async (eluId) => {
if (liens[eluId]) return;
try {
const data = await apiFetch(`/telegram/lien-elu/${eluId}`);
setLiens(p => ({ ...p, [eluId]: data }));
} catch(e) {}
};

const sendTest = async (eluId) => {
setSending(p => ({ ...p, [eluId]: true }));
try {
await apiFetch(`/telegram/test/${eluId}`, { method:'POST', body:{} });
alert('✓ Message de test envoyé !');
} catch(e) {
alert("Élu non connecté à Telegram. Partage d'abord le lien de connexion.");
} finally {
setSending(p => ({ ...p, [eluId]: false }));
}
};

const sendDigest = async () => {
try {
await apiFetch('/telegram/digest', { method:'POST', body:{} });
setDigestOk(true);
setTimeout(() => setDigestOk(false), 3000);
} catch(e) { alert('Erreur: '+e.message); }
};

const nbConnectes = Object.values(statutsElus).filter(Boolean).length;

const filteredDem = demandeurs.filter(d =>
`${d.nom} ${d.prenom} ${d.nud}`.toLowerCase().includes(search.toLowerCase())
).slice(0, 20);

if (loading) return <div style={{ padding:40, textAlign:"center",
color:C.muted, fontFamily:F.b }}>Chargement...</div>;

return (
<div style={{ padding:28, fontFamily:F.b }}>
{/* Header */}
<div style={{ display:"flex", alignItems:"flex-start",
justifyContent:"space-between", marginBottom:24 }}>
<div>
<h1 style={{ fontFamily:F.h, fontSize:22, fontWeight:800, color:C.text,
margin:"0 0 4px", letterSpacing:"-0.03em" }}>
💬 Notifications Telegram
</h1>
<p style={{ color:C.muted, fontSize:12.5 }}>
Bot @CALSmartSaintDenis_bot - {nbConnectes}/{elus.length} élus connectés
</p>
</div>
<button onClick={sendDigest}
style={{ padding:"10px 18px", background:C.telegram, color:"#fff",
border:"none", borderRadius:9, cursor:"pointer",
fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
{digestOk ? "✓ Envoyé !" : "📊 Envoyer digest maintenant"}
</button>
</div>

  {/* KPIs */}
  <div style={{ display:"flex", gap:12, marginBottom:24 }}>
    {[
      { label:"Élus connectés", val:`${nbConnectes}/${elus.length}`, color:C.telegram },
      { label:"Digest auto", val:"Lundi 9h", color:C.green },
      { label:"Alertes urgences", val:"Auto 24h", color:C.amber },
      { label:"Bot actif", val:"@CALSmartSaintDenis_bot", color:C.purple },
    ].map((k,i) => (
      <div key={i} style={{ background:C.card, borderRadius:11, padding:"13px 18px",
        border:`1px solid ${C.border}`, flex:"1 1 120px" }}>
        <div style={{ fontSize:16, fontWeight:800, color:k.color,
          fontFamily:F.h }}>{k.val}</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{k.label}</div>
      </div>
    ))}
  </div>

  {/* Tabs */}
  <div style={{ display:"flex", gap:2, marginBottom:20, background:C.bg,
    borderRadius:10, padding:4, width:"fit-content" }}>
    {[{id:"elus",label:"🛡 Élus"},{id:"candidats",label:"📋 Candidats"},
      {id:"courriers",label:"✉ Courriers officiels"},
      {id:"config",label:"⚙ Configuration & test"},
      {id:"infos",label:"ℹ Comment ça marche"}].map(t=>(
      <button key={t.id} onClick={()=>setTab(t.id)}
        style={{ padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer",
          fontFamily:F.h, fontSize:12, fontWeight:tab===t.id?700:500,
          background:tab===t.id?C.card:"transparent",
          color:tab===t.id?C.text:C.muted,
          boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,0.08)":"none" }}>
        {t.label}
      </button>
    ))}
  </div>

  {/* ── TAB ÉLUS ── */}
  {tab==="elus"&&(
    <div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>
        Pour connecter un élu, partage son lien personnel. Il clique dessus depuis
        son téléphone et démarre une conversation avec le bot.
      </div>
      {elus.map(elu => {
        const connecte = statutsElus[elu.id];
        const lienData = liens[elu.id];
        return (
          <div key={elu.id} style={{ background:C.card, borderRadius:11,
            padding:"16px 20px", border:`1px solid ${C.border}`,
            marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              {/* Avatar */}
              <div style={{ width:40, height:40, borderRadius:10,
                background:connecte?C.telegramBg:C.bg,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:16, fontWeight:800, color:connecte?C.telegram:C.muted,
                fontFamily:F.h, flexShrink:0 }}>
                {elu.nom.split(" ").pop()?.[0]}{elu.prenom?.[0]}
              </div>
              {/* Info */}
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13.5, color:C.text,
                  fontFamily:F.h }}>{elu.nom}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:1 }}>
                  {elu.secteur} - {elu.quartiers?.join(", ")||"-"}</div>
              </div>
              {/* Statut */}
              <div style={{ flexShrink:0 }}>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99,
                  fontWeight:700,
                  background:connecte?C.telegramBg:C.redBg,
                  color:connecte?C.telegram:C.red }}>
                  {connecte ? "💬 Connecté Telegram" : "Non connecté"}
                </span>
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap", justifyContent:"flex-end" }}>
                {connecte && (
                  <button onClick={()=>sendTest(elu.id)} disabled={sending[elu.id]}
                    style={{ padding:"7px 14px", background:C.telegram, color:"#fff",
                      border:"none", borderRadius:8, cursor:"pointer",
                      fontFamily:F.h, fontSize:11.5, fontWeight:700 }}>
                    {sending[elu.id]?"...":"Tester"}
                  </button>
                )}
                <button onClick={()=>setChatIdEluForm({ elu, chat_id:"" })}
                  style={{ padding:"7px 12px", background:C.greenBg, color:C.green,
                    border:`1px solid ${C.green}44`, borderRadius:8, cursor:"pointer",
                    fontFamily:F.h, fontSize:11.5, fontWeight:700 }}>
                  Essai chat_id
                </button>
                <button onClick={()=>getLien(elu.id)}
                  style={{ padding:"7px 14px",
                    background:connecte?"transparent":C.accentL,
                    color:connecte?C.muted:C.accent,
                    border:`1px solid ${connecte?C.border:C.accent}`,
                    borderRadius:8, cursor:"pointer",
                    fontFamily:F.h, fontSize:11.5, fontWeight:700 }}>
                  {lienData?"Masquer lien":"Générer lien"}
                </button>
              </div>
            </div>

            {/* Lien de connexion */}
            {lienData && (
              <div style={{ marginTop:14, padding:"14px 16px", background:C.bg,
                borderRadius:9, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted,
                  textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>
                  Lien de connexion Telegram pour {elu.nom}</div>
                <div style={{ display:"flex", gap:10, alignItems:"center",
                  flexWrap:"wrap" }}>
                  {/* QR Code */}
                  <img src={lienData.qr} alt="QR Code" style={{ width:80, height:80,
                    borderRadius:8, border:`1px solid ${C.border}` }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>
                      L'élu scanne le QR code ou clique sur le lien depuis son téléphone :
                    </div>
                    <div style={{ background:C.card, borderRadius:7, padding:"8px 12px",
                      fontFamily:"monospace", fontSize:11.5, color:C.telegram,
                      border:`1px solid ${C.border}`, wordBreak:"break-all",
                      marginBottom:8 }}>
                      {lienData.lien}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={()=>navigator.clipboard.writeText(lienData.lien)}
                        style={{ padding:"6px 14px", background:C.telegram, color:"#fff",
                          border:"none", borderRadius:7, cursor:"pointer",
                          fontFamily:F.h, fontSize:11, fontWeight:700 }}>
                        Copier le lien
                      </button>
                      <a href={lienData.lien} target="_blank" rel="noreferrer"
                        style={{ padding:"6px 14px", background:"transparent",
                          color:C.telegram, border:`1px solid ${C.telegram}`,
                          borderRadius:7, cursor:"pointer", fontFamily:F.h,
                          fontSize:11, fontWeight:700, textDecoration:"none",
                          display:"inline-block" }}>
                        Ouvrir Telegram →
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}

  {/* ── TAB CANDIDATS ── */}
  {tab==="candidats"&&(
    <div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>
        Les candidats reçoivent des notifications Telegram sur les étapes clés
        de leur dossier. Ils doivent donner leur accord et démarrer le bot eux-mêmes.
      </div>
      <div style={{ marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Rechercher un demandeur..."
          style={{ width:300, padding:"8px 12px", borderRadius:8,
            border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
            outline:"none" }}/>
      </div>
      <div style={{ background:C.card, borderRadius:12, border:`1px solid ${C.border}`,
        overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:C.bg }}>
              {["Demandeur","NUD","Composition","Statut Telegram","Action"].map(h=>(
                <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:10,
                  fontWeight:700, color:C.muted, textTransform:"uppercase",
                  letterSpacing:"0.05em", borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredDem.map(d => {
              const lienD = liens[`dem_${d.id}`];
              return (
                <tr key={d.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:"9px 14px", fontWeight:700, color:C.text,
                    fontFamily:F.h }}>{d.nom} {d.prenom}</td>
                  <td style={{ padding:"9px 14px", color:C.muted, fontSize:11 }}>
                    {d.nud||"-"}</td>
                  <td style={{ padding:"9px 14px", color:C.text }}>{d.compo}</td>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:99,
                      background:C.amberBg, color:C.amber, fontWeight:600 }}>
                      Non connecté
                    </span>
                  </td>
                  <td style={{ padding:"9px 14px" }}>
                    <button onClick={async()=>{
                      try {
                        const data = await apiFetch(`/telegram/lien-candidat/${d.id}`);
                        setLiens(p=>({...p,[`dem_${d.id}`]:data}));
                      } catch(e){}
                    }}
                      style={{ padding:"5px 12px", background:C.accentL, color:C.accent,
                        border:`1px solid ${C.accent}`, borderRadius:7, cursor:"pointer",
                        fontFamily:F.h, fontSize:11, fontWeight:700 }}>
                      Générer lien
                    </button>
                    {lienD&&(
                      <div style={{ marginTop:6, fontSize:11, color:C.telegram,
                        wordBreak:"break-all" }}>
                        <a href={lienD.lien} target="_blank" rel="noreferrer"
                          style={{ color:C.telegram }}>{lienD.lien}</a>
                        <button onClick={()=>navigator.clipboard.writeText(lienD.lien)}
                          style={{ marginLeft:6, padding:"2px 8px", borderRadius:4,
                            border:`1px solid ${C.border}`, background:"transparent",
                            cursor:"pointer", fontSize:10, color:C.muted }}>
                          Copier
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {/* ── TAB COURRIERS OFFICIELS ── */}
  {tab==="courriers"&&(
    <div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>
        Envoi de courriers officiels aux candidats avec statut (en attente, prioritaire,
        operation deja livree, attribue, refuse, en etude). Envoi optionnel par Telegram.
        Tout est trace dans l audit.
      </div>

      {/* KPIs courriers */}
      {statsCour && (
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:18 }}>
          {Object.entries(statsCour.par_statut || {}).map(([k,v]) => {
            const s = STATUT_COURRIER[k] || { lib:k, col:C.muted, bg:C.bg };
            return (
              <div key={k} style={{ background:s.bg, border:`1px solid ${s.col}33`,
                borderRadius:10, padding:"10px 14px", minWidth:130 }}>
                <div style={{ fontSize:18, fontFamily:F.h, fontWeight:800, color:s.col }}>{v}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.lib}</div>
              </div>
            );
          })}
          <div style={{ background:C.card, border:`1px solid ${C.border}`,
            borderRadius:10, padding:"10px 14px", minWidth:130 }}>
            <div style={{ fontSize:18, fontFamily:F.h, fontWeight:800, color:C.navy }}>{statsCour.total}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Courriers au total</div>
          </div>
        </div>
      )}

      {/* Creer un courrier */}
      <div style={{ background:C.card, borderRadius:11, border:`1px solid ${C.border}`,
        padding:"16px 18px", marginBottom:18 }}>
        <div style={{ fontFamily:F.h, fontWeight:700, fontSize:13, color:C.text, marginBottom:12 }}>
          Envoyer un courrier officiel
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
              textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
              Candidat destinataire
            </label>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Rechercher nom, prenom, NUD..."
              style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, outline:"none" }}/>
            {search && (
              <div style={{ marginTop:6, maxHeight:150, overflowY:"auto",
                border:`1px solid ${C.border}`, borderRadius:7 }}>
                {demandeurs.filter(d =>
                  `${d.nom} ${d.prenom} ${d.nud||''}`.toLowerCase().includes(search.toLowerCase())
                ).slice(0,6).map(d => (
                  <button key={d.id} onClick={()=>{ setCourrierForm(presetCourrier(d,'en_attente')); setSearch(''); }}
                    style={{ display:"block", width:"100%", padding:"7px 12px", textAlign:"left",
                      background:"transparent", border:"none", borderBottom:`1px solid ${C.border}`,
                      cursor:"pointer", fontSize:12, color:C.text }}>
                    <b>{d.nom} {d.prenom}</b> · <span style={{ color:C.muted }}>{d.nud||'-'}</span>
                  </button>
                ))}
              </div>
            )}
            {courrierForm && (
              <div style={{ marginTop:8, padding:"6px 10px", background:C.bg,
                borderRadius:6, fontSize:12 }}>
                <b>{courrierForm.dem.nom} {courrierForm.dem.prenom}</b>
                {' '}· {courrierForm.dem.nud||'-'}
                <button onClick={()=>setCourrierForm(null)}
                  style={{ marginLeft:10, border:"none", background:"transparent",
                    cursor:"pointer", color:C.muted, fontSize:11 }}>x</button>
              </div>
            )}
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
              textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
              Statut du courrier
            </label>
            <select disabled={!courrierForm}
              value={courrierForm?.statut || 'en_attente'}
              onChange={e=> courrierForm && setCourrierForm({ ...presetCourrier(courrierForm.dem, e.target.value) })}
              style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
                background:courrierForm?"#fff":C.bg }}>
              {Object.entries(STATUT_COURRIER).map(([k,s])=>(
                <option key={k} value={k}>{s.lib}</option>
              ))}
            </select>
          </div>
        </div>

        {courrierForm && (
          <>
            <div style={{ marginTop:12 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Objet</label>
              <input value={courrierForm.objet||''} onChange={e=>setCourrierForm(p=>({...p, objet:e.target.value}))}
                style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                  border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, outline:"none" }}/>
            </div>
            <div style={{ marginTop:10 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
                textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
                Corps du courrier (laisser vide pour utiliser le modele officiel)
              </label>
              <textarea rows={6} value={courrierForm.corps||''}
                onChange={e=>setCourrierForm(p=>({...p, corps:e.target.value}))}
                placeholder="Si vide, un modele automatique sera envoye."
                style={{ width:"100%", padding:"8px 10px", borderRadius:7,
                  border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12.5,
                  outline:"none", resize:"vertical" }}/>
            </div>
            <div style={{ marginTop:10, display:"flex", alignItems:"center", justifyContent:"space-between",
              flexWrap:"wrap", gap:10 }}>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, cursor:"pointer" }}>
                <input type="checkbox" checked={!!courrierForm.envoyer_telegram}
                  onChange={e=>setCourrierForm(p=>({...p, envoyer_telegram:e.target.checked}))}/>
                Envoyer aussi par Telegram (si candidat connecte)
              </label>
              <button onClick={sendCourrier} disabled={courrierSaving}
                style={{ padding:"9px 20px", background:C.telegram, color:"#fff",
                  border:"none", borderRadius:8, cursor:"pointer",
                  fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
                {courrierSaving?"...":"Enregistrer le courrier"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Liste courriers */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <input value={courrierFilter} onChange={e=>setCourrierFilter(e.target.value)}
          placeholder="Filtrer (nom, statut, objet...)"
          style={{ width:280, padding:"8px 12px", borderRadius:8,
            border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13, outline:"none" }}/>
        <div style={{ fontSize:12, color:C.muted }}>
          {courriers.filter(c => {
            const k = courrierFilter.toLowerCase();
            return !k || (c.dem_nom+c.objet+c.libelle_statut+c.statut).toLowerCase().includes(k);
          }).length} courrier(s)
        </div>
      </div>

      <div style={{ background:C.card, borderRadius:11, border:`1px solid ${C.border}`,
        overflow:"hidden" }}>
        {courriers.filter(c => {
          const k = courrierFilter.toLowerCase();
          return !k || (c.dem_nom+c.objet+c.libelle_statut+c.statut).toLowerCase().includes(k);
        }).map(c => {
          const s = STATUT_COURRIER[c.statut] || { lib:c.statut, col:C.muted, bg:C.bg };
          return (
            <div key={c.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`,
              borderLeft:`4px solid ${s.col}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.text, fontFamily:F.h }}>
                    {c.dem_nom} <span style={{ color:C.muted, fontWeight:400, fontSize:11.5 }}>
                      · {c.dem_nud||'-'}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{c.objet}</div>
                </div>
                <span style={{ fontSize:10.5, padding:"3px 10px", borderRadius:99, fontWeight:700,
                  background:s.bg, color:s.col, textTransform:"uppercase", letterSpacing:"0.04em" }}>
                  {s.lib}
                </span>
                <span style={{ fontSize:10.5, padding:"3px 8px", borderRadius:99,
                  background:c.telegram_envoye?C.telegramBg:C.bg,
                  color:c.telegram_envoye?C.telegram:C.muted, fontWeight:600 }}>
                  {c.telegram_envoye?"💬 Envoye Telegram":"Archive"}
                </span>
                <div style={{ fontSize:10.5, color:C.muted, minWidth:110, textAlign:"right" }}>
                  {c.date_creation} · {c.cree_par}
                </div>
                <button onClick={()=>setChangeStatut({ courrier:c, nouveau_statut:c.statut, motif:"" })}
                  style={{ padding:"5px 10px", background:C.bg, color:C.text,
                    border:`1px solid ${C.border}`, borderRadius:6, cursor:"pointer",
                    fontFamily:F.h, fontSize:11, fontWeight:600 }}>
                  Reclassifier
                </button>
              </div>
            </div>
          );
        })}
        {courriers.length===0 && (
          <div style={{ padding:30, textAlign:"center", color:C.muted, fontSize:13 }}>
            Aucun courrier officiel envoye pour le moment.
          </div>
        )}
      </div>
    </div>
  )}

  {/* ── TAB CONFIGURATION ── */}
  {tab==="config"&&(
    <div style={{ maxWidth:760 }}>
      {/* Instructions */}
      <div style={{ background:C.card, borderRadius:12, padding:"18px 20px",
        border:`1px solid ${C.border}`, marginBottom:16 }}>
        <div style={{ fontFamily:F.h, fontSize:14, fontWeight:800, color:C.text,
          marginBottom:10 }}>Comment recuperer votre chat_id Telegram</div>
        <ol style={{ margin:0, paddingLeft:20, fontSize:12.5, color:C.text,
          lineHeight:1.7 }}>
          <li>Ouvrez Telegram sur votre telephone.</li>
          <li>Recherchez <b>@CALSmartSaintDenis_bot</b>.</li>
          <li>Demarrez la conversation, puis tapez <code style={{
            background:C.bg, padding:"1px 6px", borderRadius:4 }}>/start</code>.</li>
          <li>Le bot affiche votre identifiant de chat Telegram (un nombre).</li>
          <li>Copiez-le et collez-le dans le champ ci-dessous pour vous envoyer un
            message de test.</li>
        </ol>
      </div>

      {/* Test direct */}
      <div style={{ background:C.card, borderRadius:12, padding:"18px 20px",
        border:`1px solid ${C.border}`, marginBottom:16 }}>
        <div style={{ fontFamily:F.h, fontSize:14, fontWeight:800, color:C.text,
          marginBottom:4 }}>Envoi test direct</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
          Envoie un message directement a un chat_id, sans passer par la liste des
          elus. Pratique pour verifier que le token Telegram fonctionne.
        </div>

        <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
          textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
          chat_id Telegram
        </label>
        <input value={testChatId}
          onChange={e=>setTestChatId(e.target.value.replace(/[^0-9-]/g,''))}
          placeholder="ex: 123456789"
          style={{ width:"100%", padding:"9px 12px", borderRadius:8,
            border:`1px solid ${C.border}`, fontFamily:"monospace", fontSize:14,
            outline:"none", marginBottom:12 }}/>

        <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
          textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
          Message (optionnel)
        </label>
        <textarea value={testMessage} rows={3}
          onChange={e=>setTestMessage(e.target.value)}
          placeholder="Laissez vide pour utiliser le message de test par defaut."
          style={{ width:"100%", padding:"9px 12px", borderRadius:8,
            border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13,
            outline:"none", resize:"vertical" }}/>

        <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:14 }}>
          <button onClick={sendTestDirect} disabled={testSending || !testChatId}
            style={{ padding:"10px 20px", background:C.telegram, color:"#fff",
              border:"none", borderRadius:8, cursor:(testSending||!testChatId)?"not-allowed":"pointer",
              fontFamily:F.h, fontSize:13, fontWeight:700,
              opacity:(testSending||!testChatId)?0.5:1 }}>
            {testSending ? "Envoi..." : "Envoyer le message de test"}
          </button>
          {testResult && (
            <span style={{ fontSize:12, fontWeight:600,
              color: testResult.ok ? C.green : C.red }}>
              {testResult.ok ? "✓ " : "✗ "}{testResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Webhook */}
      <div style={{ background:C.card, borderRadius:12, padding:"18px 20px",
        border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          marginBottom:8 }}>
          <div style={{ fontFamily:F.h, fontSize:14, fontWeight:800, color:C.text }}>
            Webhook Telegram
          </div>
          <button onClick={reloadWebhookInfo}
            style={{ padding:"6px 12px", background:"transparent", color:C.telegram,
              border:`1px solid ${C.telegram}55`, borderRadius:7, cursor:"pointer",
              fontFamily:F.h, fontSize:11, fontWeight:700 }}>
            Voir l etat actuel
          </button>
        </div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
          Le webhook est l URL que Telegram appelle quand un utilisateur ecrit au bot.
          A configurer une fois l application en ligne (prod ou staging).
        </div>

        {webhookInfo && (
          <pre style={{ background:C.bg, padding:"10px 12px", borderRadius:7,
            fontSize:11, color:C.text, overflow:"auto", margin:"0 0 14px",
            maxHeight:200 }}>
{JSON.stringify(webhookInfo, null, 2)}
          </pre>
        )}

        <button onClick={configurerWebhook} disabled={webhookBusy}
          style={{ padding:"10px 20px", background:C.navy, color:"#fff",
            border:"none", borderRadius:8, cursor:webhookBusy?"not-allowed":"pointer",
            fontFamily:F.h, fontSize:13, fontWeight:700, opacity:webhookBusy?0.5:1 }}>
          {webhookBusy ? "Configuration..." : "Configurer le webhook Telegram"}
        </button>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
          Reserve au directeur. L URL publique sera suivie automatiquement de
          <code style={{ background:C.bg, padding:"1px 5px", borderRadius:3,
            margin:"0 4px" }}>/api/telegram/webhook</code>.
        </div>
      </div>
    </div>
  )}

  {/* ── TAB INFOS ── */}
  {tab==="infos"&&(
    <div style={{ maxWidth:700 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {[
          { n:1, titre:"Le bot est créé", desc:"@CALSmartSaintDenis_bot est actif sur Telegram.", done:true },
          { n:2, titre:"Connecter les élus",
            desc:"Pour chaque élu, clique sur 'Générer lien' dans l'onglet Élus, puis partage le lien ou QR code à l'élu. Il clique depuis son téléphone et démarre le bot.", done:false },
          { n:3, titre:"Digest hebdomadaire automatique",
            desc:"Chaque lundi à 9h, Logivia envoie automatiquement à chaque élu connecté un résumé de son secteur : demandeurs actifs, logements disponibles, urgences, attributions.", done:true },
          { n:4, titre:"Alertes urgences automatiques",
            desc:"Toutes les 24h, le serveur vérifie les dossiers urgents (DALO, SDF, VIF) avec audience favorable sans proposition depuis 30+ jours. L'élu reçoit automatiquement une alerte.", done:true },
          { n:5, titre:"Notifications attributions",
            desc:"Quand une décision CAL est validée, l'élu concerné reçoit automatiquement un message l'informant que le ménage qu'il a reçu en audience a été attribué.", done:false },
          { n:6, titre:"Activer après déploiement en ligne",
            desc:"Une fois l'appli hébergée (Railway), configure le webhook Telegram depuis l'onglet Administration pour que les messages entrants soient traités.", done:false },
        ].map(step=>(
          <div key={step.n} style={{ display:"flex", gap:14, padding:"14px 16px",
            background:step.done?C.greenBg:C.card, borderRadius:11,
            border:`1px solid ${step.done?C.green:C.border}` }}>
            <div style={{ width:28, height:28, borderRadius:"50%",
              background:step.done?C.green:C.bg, color:step.done?"#fff":C.muted,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:13, fontWeight:800, flexShrink:0, fontFamily:F.h }}>
              {step.done?"v":step.n}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:13, color:C.text,
                fontFamily:F.h, marginBottom:3 }}>{step.titre}</div>
              <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.5 }}>
                {step.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:20, padding:"16px 18px", background:"#F0F9FF",
        borderRadius:11, border:`1px solid ${C.telegram}33` }}>
        <div style={{ fontFamily:F.h, fontSize:12, fontWeight:700, color:C.telegram,
          marginBottom:8 }}>Messages automatiques envoyés</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            { ico:"🏠", label:"Attribution post-audience", qui:"Élu concerné", auto:"Oui" },
            { ico:"(!)", label:"Urgence territoire", qui:"Élu du secteur", auto:"Oui (>30j)" },
            { ico:"📊", label:"Digest hebdo", qui:"Tous les élus", auto:"Lundi 9h" },
            { ico:"📅", label:"CAL à venir", qui:"Élu du secteur", auto:"Manuel" },
            { ico:"📝", label:"Dossier incomplet", qui:"Candidat", auto:"Manuel" },
            { ico:"🏠", label:"Proposition logement", qui:"Candidat", auto:"Manuel" },
          ].map((m,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start",
              padding:"8px 10px", background:C.card, borderRadius:8,
              border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:16 }}>{m.ico}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{m.label}</div>
                <div style={{ fontSize:10.5, color:C.muted }}>→ {m.qui} · {m.auto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}

  {/* Modal : enregistrer manuellement un chat_id pour essai */}
  {chatIdEluForm && (
    <div style={{ position:"fixed", inset:0, background:"rgba(11,30,61,0.55)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.card, borderRadius:14, padding:26, width:"100%", maxWidth:500 }}>
        <h2 style={{ fontFamily:F.h, fontSize:16, fontWeight:800, color:C.text, margin:"0 0 14px" }}>
          Essai - enregistrer chat_id Telegram pour {chatIdEluForm.elu.nom}
        </h2>
        <div style={{ background:C.amberBg, border:`1px solid ${C.amber}33`, borderRadius:8,
          padding:"10px 12px", fontSize:12, color:C.amber, marginBottom:14, fontWeight:600 }}>
          Cette saisie manuelle est un contournement pour tester avant l activation
          du webhook Telegram en production. L elu doit demarrer le bot
          @CALSmartSaintDenis_bot puis vous communique son chat_id numerique.
        </div>
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
          textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>
          chat_id Telegram (nombre entier)
        </label>
        <input value={chatIdEluForm.chat_id}
          onChange={e=>setChatIdEluForm(p=>({...p, chat_id:e.target.value.replace(/[^0-9-]/g,'')}))}
          placeholder="ex: 123456789"
          style={{ width:"100%", padding:"9px 12px", borderRadius:8,
            border:`1px solid ${C.border}`, fontFamily:"monospace", fontSize:14, outline:"none" }}/>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:18 }}>
          <button onClick={()=>setChatIdEluForm(null)}
            style={{ padding:"8px 14px", border:`1px solid ${C.border}`, borderRadius:7,
              background:"transparent", cursor:"pointer", fontFamily:F.h, fontSize:12,
              fontWeight:600, color:C.muted }}>Annuler</button>
          <button onClick={saveChatIdElu} disabled={!chatIdEluForm.chat_id}
            style={{ padding:"8px 18px", background:C.green, color:"#fff", border:"none",
              borderRadius:7, cursor:"pointer", fontFamily:F.h, fontSize:12, fontWeight:700 }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Modal : reclassifier un courrier */}
  {changeStatut && (
    <div style={{ position:"fixed", inset:0, background:"rgba(11,30,61,0.55)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.card, borderRadius:14, padding:26, width:"100%", maxWidth:520 }}>
        <h2 style={{ fontFamily:F.h, fontSize:16, fontWeight:800, color:C.text, margin:"0 0 6px" }}>
          Reclassifier le courrier
        </h2>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
          {changeStatut.courrier.dem_nom} - {changeStatut.courrier.objet}
        </div>
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted,
          textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>Nouveau statut</label>
        <select value={changeStatut.nouveau_statut}
          onChange={e=>setChangeStatut(p=>({...p, nouveau_statut:e.target.value}))}
          style={{ width:"100%", padding:"8px 10px", borderRadius:7,
            border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:13 }}>
          {Object.entries(STATUT_COURRIER).map(([k,s])=>(
            <option key={k} value={k}>{s.lib}</option>
          ))}
        </select>
        <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.red,
          textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5, marginTop:12 }}>
          Motif obligatoire *
        </label>
        <textarea rows={3} value={changeStatut.motif}
          onChange={e=>setChangeStatut(p=>({...p, motif:e.target.value}))}
          placeholder="Pourquoi reclassifier ce courrier ?"
          style={{ width:"100%", padding:"8px 10px", borderRadius:7,
            border:`1px solid ${C.border}`, fontFamily:F.b, fontSize:12.5, outline:"none" }}/>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:18 }}>
          <button onClick={()=>setChangeStatut(null)}
            style={{ padding:"8px 14px", border:`1px solid ${C.border}`, borderRadius:7,
              background:"transparent", cursor:"pointer", fontFamily:F.h, fontSize:12,
              fontWeight:600, color:C.muted }}>Annuler</button>
          <button onClick={appliqueStatut} disabled={!changeStatut.motif}
            style={{ padding:"8px 18px", background:C.telegram, color:"#fff", border:"none",
              borderRadius:7, cursor:"pointer", fontFamily:F.h, fontSize:12, fontWeight:700,
              opacity: changeStatut.motif ? 1 : 0.5 }}>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )}
</div>

);
}