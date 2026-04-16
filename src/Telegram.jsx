// ═══════════════════════════════════════════════════════════════
// CALSmart — Telegram.jsx
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
  }, []);

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
      alert('✅ Message de test envoyé !');
    } catch(e) {
      alert('❌ Élu non connecté à Telegram. Partage d\'abord le lien de connexion.');
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
    color:C.muted, fontFamily:F.b }}>Chargement…</div>;

  return (
    <div style={{ padding:28, fontFamily:F.b }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start",
        justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:F.h, fontSize:22, fontWeight:800, color:C.text,
            margin:"0 0 4px", letterSpacing:"-0.03em" }}>
            ✈ Notifications Telegram
          </h1>
          <p style={{ color:C.muted, fontSize:12.5 }}>
            Bot @CALSmartSaintDenis_bot · {nbConnectes}/{elus.length} élus connectés
          </p>
        </div>
        <button onClick={sendDigest}
          style={{ padding:"10px 18px", background:C.telegram, color:"#fff",
            border:"none", borderRadius:9, cursor:"pointer",
            fontFamily:F.h, fontSize:12.5, fontWeight:700 }}>
          {digestOk ? "✅ Envoyé !" : "📊 Envoyer digest maintenant"}
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
        {[{id:"elus",label:"⊛ Élus"},{id:"candidats",label:"☰ Candidats"},
          {id:"infos",label:"ℹ️ Comment ça marche"}].map(t=>(
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
                      {elu.secteur} · {elu.quartiers?.join(", ")||"—"}</div>
                  </div>
                  {/* Statut */}
                  <div style={{ flexShrink:0 }}>
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:99,
                      fontWeight:700,
                      background:connecte?C.telegramBg:C.redBg,
                      color:connecte?C.telegram:C.red }}>
                      {connecte ? "✈ Connecté Telegram" : "Non connecté"}
                    </span>
                  </div>
                  {/* Actions */}
                  <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                    {connecte && (
                      <button onClick={()=>sendTest(elu.id)} disabled={sending[elu.id]}
                        style={{ padding:"7px 14px", background:C.telegram, color:"#fff",
                          border:"none", borderRadius:8, cursor:"pointer",
                          fontFamily:F.h, fontSize:11.5, fontWeight:700 }}>
                        {sending[elu.id]?"…":"Tester"}
                      </button>
                    )}
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
              placeholder="Rechercher un demandeur…"
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
                        {d.nud||"—"}</td>
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

      {/* ── TAB INFOS ── */}
      {tab==="infos"&&(
        <div style={{ maxWidth:700 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {[
              { n:1, titre:"Le bot est créé", desc:"@CALSmartSaintDenis_bot est actif sur Telegram.", done:true },
              { n:2, titre:"Connecter les élus",
                desc:"Pour chaque élu, clique sur 'Générer lien' dans l'onglet Élus, puis partage le lien ou QR code à l'élu. Il clique depuis son téléphone et démarre le bot.", done:false },
              { n:3, titre:"Digest hebdomadaire automatique",
                desc:"Chaque lundi à 9h, CAL Smart envoie automatiquement à chaque élu connecté un résumé de son secteur : demandeurs actifs, logements disponibles, urgences, attributions.", done:true },
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
                  {step.done?"✓":step.n}
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
                { ico:"⚠️", label:"Urgence territoire", qui:"Élu du secteur", auto:"Oui (>30j)" },
                { ico:"📊", label:"Digest hebdo", qui:"Tous les élus", auto:"Lundi 9h" },
                { ico:"✦", label:"CAL à venir", qui:"Élu du secteur", auto:"Manuel" },
                { ico:"📋", label:"Dossier incomplet", qui:"Candidat", auto:"Manuel" },
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
    </div>
  );
}
