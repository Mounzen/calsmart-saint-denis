/**
 * Logivia - Assistant IA conversationnel
 *
 * Moteur hybride :
 * 1. Détection d'intention par regex sur les mots-clés FR (rapide, offline, gratuit)
 * 2. Réponses riches avec données temps réel (demandeurs, logements, stats)
 * 3. Suggestions d'actions cliquables (naviguer vers un onglet, ouvrir un dossier)
 * 4. Fallback LLM (Anthropic Claude) si ANTHROPIC_API_KEY est configuré
 *
 * Le module est volontairement autonome : il prend un "ctx" avec des lecteurs
 * de données et renvoie { reply, actions, context } sans toucher à l'Express app.
 */

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function any(text, kws) {
  const t = norm(text)
  return kws.some(k => t.includes(k))
}

function all(text, kws) {
  const t = norm(text)
  return kws.every(k => t.includes(k))
}

function pluriel(n, sing, plur) {
  return (n > 1 ? (plur || sing + 's') : sing)
}

function fmtDateFr(d) {
  try {
    const dt = new Date(d)
    if (isNaN(dt)) return d
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return d }
}

/* ------------------------------------------------------------------ */
/* Détection d'intention                                               */
/* ------------------------------------------------------------------ */

function detectIntent(q) {
  const t = norm(q)

  // Salutations / politesse
  if (/^(bonjour|salut|hello|hey|coucou|bonsoir|hi)\b/.test(t)) return 'greeting'
  if (any(t, ['merci', 'merci beaucoup', 'super', 'parfait', 'ok merci'])) return 'thanks'
  if (any(t, ['aide', 'help', 'que peux-tu', 'que sais-tu', 'comment ca marche', 'que fais-tu'])) return 'help'

  // Statistiques globales
  if (any(t, ['combien', 'nombre', 'total']) && any(t, ['demandeur', 'dossier', 'candidat'])) return 'count_demandeurs'
  if (any(t, ['combien', 'nombre', 'total']) && any(t, ['logement', 'habitation'])) return 'count_logements'
  if (any(t, ['combien', 'nombre', 'total']) && any(t, ['audience'])) return 'count_audiences'
  if (any(t, ['combien', 'nombre', 'total']) && any(t, ['elu'])) return 'count_elus'
  if (any(t, ['statistique', 'stats', 'chiffres', 'bilan', 'indicateurs'])) return 'stats'

  // Urgence / alertes
  if (any(t, ['urgent', 'urgence', 'priorit', 'grave', 'critique', 'alerte'])) return 'urgents'

  // Recherche ciblée
  if (any(t, ['trouve', 'cherche', 'recherche', 'retrouve', 'ou est', 'localise'])) return 'search'

  // Navigation / actions
  if (any(t, ['ouvre', 'affiche', 'montre', 'va sur', 'va a', 'va au', 'aller a'])) return 'navigate'

  // Commissions / CAL
  if (any(t, ['cal', 'commission', 'prepa'])) return 'cal'
  if (any(t, ['audience', 'rdv elu', 'rendez-vous elu'])) return 'audiences'

  // Workflow
  if (any(t, ['kanban', 'workflow', 'etape'])) return 'kanban'
  if (any(t, ['relance', 'echeance', 'rappel'])) return 'relances'
  if (any(t, ['notification', 'message non lu'])) return 'notifications'

  // Thèmes métier
  if (any(t, ['scoring', 'score', 'regle', 'ponderation'])) return 'scoring'
  if (any(t, ['rgpd', 'cnil', 'donnees personnelles', 'droit a l oubli'])) return 'rgpd'
  if (any(t, ['telegram', 'bot', 'chat'])) return 'telegram'
  if (any(t, ['rapport', 'export', 'pdf', 'courrier'])) return 'rapports'
  if (any(t, ['backup', 'sauvegarde', 'base', 'sqlite'])) return 'backup'
  if (any(t, ['portail', 'candidat en ligne'])) return 'portail'
  if (any(t, ['secteur', 'quartier', 'territoire', 'carte', 'bailleur'])) return 'territoire'

  // "Créer / comment..."
  if (/^(comment|ou)\b/.test(t) || any(t, ['creer', 'ajouter', 'faire pour'])) return 'how_to'

  return 'unknown'
}

/* ------------------------------------------------------------------ */
/* Chargement de contexte (lazy, prudent si SQL down)                 */
/* ------------------------------------------------------------------ */

async function safeRead(readArr, name) {
  try { return (await readArr(name)) || [] } catch { return [] }
}
async function safeReadObj(readObj, name) {
  try { return (await readObj(name)) || {} } catch { return {} }
}

async function loadSnapshot(readArr, readObj) {
  return {
    demandeurs: await safeRead(readArr, 'demandeurs'),
    logements: await safeRead(readArr, 'logements'),
    audiences: await safeRead(readArr, 'audiences'),
    elus: await safeRead(readArr, 'elus'),
    decisions: await safeRead(readArr, 'decisions'),
    notifications: await safeRead(readArr, 'notifications'),
    relances: await safeRead(readArr, 'relances'),
    referentiels: await safeReadObj(readObj, 'referentiels')
  }
}

/* ------------------------------------------------------------------ */
/* Réponses par intention                                              */
/* ------------------------------------------------------------------ */

function replyGreeting(user) {
  const prenom = user?.prenom ? ' ' + user.prenom : ''
  return {
    reply: `Bonjour${prenom} 👋 Je suis l'assistante Logivia. Je peux vous aider à chercher des dossiers, faire le point sur les chiffres du jour, ou expliquer comment utiliser une fonction. Posez-moi votre question ou cliquez sur une suggestion.`,
    suggestions: ['Combien de dossiers urgents ?', 'Prochaines audiences', 'Statistiques du mois', 'Aide']
  }
}

function replyThanks() {
  return { reply: 'Avec plaisir. Je reste disponible si vous avez d\'autres questions.', suggestions: [] }
}

function replyHelp() {
  return {
    reply: [
      'Voici ce que je sais faire :',
      '',
      '• **Compter** : "combien de demandeurs", "nombre de logements disponibles"',
      '• **Chercher** : "trouve Dupont", "recherche NUD 974123"',
      '• **Prioriser** : "dossiers urgents", "candidats les plus prioritaires"',
      '• **Naviguer** : "ouvre les audiences", "va sur le kanban"',
      '• **Expliquer** : "comment fonctionne le scoring", "c\'est quoi la CAL"',
      '• **Statistiques** : "stats du mois", "bilan attribution"',
      '',
      'Je ne remplace pas un agent : je vous aide à trouver l\'info plus vite.'
    ].join('\n'),
    suggestions: ['Dossiers urgents', 'Stats du mois', 'Comment scorer ?', 'Audiences à venir']
  }
}

function replyCountDemandeurs(snap) {
  const actifs = snap.demandeurs.filter(d => d.statut !== 'attribue' && d.statut !== 'archive' && d.statut !== 'radie')
  const urgents = snap.demandeurs.filter(d => d.urgence === 'critique' || d.priorite === 'urgente')
  return {
    reply: `Il y a **${snap.demandeurs.length} demandeurs** au total dont **${actifs.length} actifs** et **${urgents.length} en situation urgente**.`,
    actions: [{ label: 'Voir la liste', tab: 'demandeurs' }],
    suggestions: ['Dossiers urgents', 'Combien de logements ?', 'Stats du mois']
  }
}

function replyCountLogements(snap) {
  const dispo = snap.logements.filter(l => l.statut === 'disponible' || l.statut === 'libre' || !l.statut)
  const attribues = snap.logements.filter(l => l.statut === 'attribue')
  return {
    reply: `**${snap.logements.length} logements** enregistrés dont **${dispo.length} disponibles** et **${attribues.length} attribués**.`,
    actions: [{ label: 'Voir les logements', tab: 'logements' }],
    suggestions: ['Lancer un matching', 'Carte du territoire', 'Combien de demandeurs ?']
  }
}

function replyCountAudiences(snap) {
  const now = new Date()
  const futures = snap.audiences.filter(a => {
    const d = new Date(a.date)
    return !isNaN(d) && d >= now
  })
  return {
    reply: `**${snap.audiences.length} audiences** enregistrées au total, dont **${futures.length} à venir**.`,
    actions: [{ label: 'Voir les audiences', tab: 'audiences' }],
    suggestions: ['Calendrier CAL', 'Gestion élus', 'Prépa CAL']
  }
}

function replyCountElus(snap) {
  return {
    reply: `**${snap.elus.length} élus** référencés dans l'application.`,
    actions: [{ label: 'Gestion Élus', tab: 'elus' }]
  }
}

function replyStats(snap) {
  const now = new Date()
  const moisEnCours = now.getMonth()
  const anneeEnCours = now.getFullYear()
  const decisionsDuMois = snap.decisions.filter(d => {
    const dt = new Date(d.date || d.createdAt)
    return !isNaN(dt) && dt.getMonth() === moisEnCours && dt.getFullYear() === anneeEnCours
  })
  const attributionsDuMois = decisionsDuMois.filter(d => d.decision === 'attribue' || d.statut === 'attribue')
  return {
    reply: [
      `📊 **Tableau du mois en cours**`,
      '',
      `• Demandeurs : **${snap.demandeurs.length}**`,
      `• Logements : **${snap.logements.length}** (${snap.logements.filter(l => l.statut === 'disponible' || !l.statut).length} dispo)`,
      `• Décisions ce mois : **${decisionsDuMois.length}**`,
      `• Attributions ce mois : **${attributionsDuMois.length}**`,
      `• Audiences totales : **${snap.audiences.length}**`,
      '',
      `Pour plus de détails, ouvrez l'onglet Statistiques.`
    ].join('\n'),
    actions: [{ label: 'Ouvrir Statistiques', tab: 'stats' }, { label: 'Rapport mensuel', tab: 'rapport' }]
  }
}

function replyUrgents(snap) {
  const urgents = snap.demandeurs.filter(d => d.urgence === 'critique' || d.priorite === 'urgente' || (d.score && d.score >= 80))
  if (urgents.length === 0) {
    return { reply: 'Bonne nouvelle : aucun dossier marqué en situation urgente actuellement.', suggestions: ['Stats du mois', 'Kanban workflow'] }
  }
  const top = urgents.slice(0, 5)
  const list = top.map(d => `• ${d.nom || ''} ${d.prenom || ''} — NUD ${d.nud || 'n/a'}${d.urgence ? ' (' + d.urgence + ')' : ''}`).join('\n')
  return {
    reply: `⚠️ **${urgents.length} ${pluriel(urgents.length, 'dossier')} urgent${urgents.length > 1 ? 's' : ''}**${urgents.length > 5 ? ' (top 5)' : ''} :\n\n${list}`,
    actions: [{ label: 'Voir tous les dossiers', tab: 'demandeurs' }, { label: 'Alertes', tab: 'alertes' }],
    suggestions: ['Ouvrir le premier', 'Relances auto', 'Stats du mois']
  }
}

function replySearch(q, snap) {
  // Extrait un token utile (nom, NUD, référence logement)
  const t = norm(q)
  const tokens = t.split(/\s+/).filter(w =>
    w.length >= 3 &&
    !['trouve', 'cherche', 'recherche', 'retrouve', 'dossier', 'demandeur', 'logement', 'monsieur', 'madame', 'candidat', 'audience'].includes(w)
  )
  if (tokens.length === 0) {
    return { reply: 'Que dois-je chercher ? Donnez-moi un nom, un NUD, ou une référence de logement.', suggestions: [] }
  }
  const key = tokens.join(' ')
  const dems = snap.demandeurs.filter(d => {
    const s = norm((d.nom || '') + ' ' + (d.prenom || '') + ' ' + (d.nud || '') + ' ' + (d.email || ''))
    return s.includes(key) || tokens.every(tok => s.includes(tok))
  }).slice(0, 8)
  const logs = snap.logements.filter(l => {
    const s = norm((l.ref || '') + ' ' + (l.adresse || '') + ' ' + (l.operation || '') + ' ' + (l.bailleur || ''))
    return s.includes(key) || tokens.every(tok => s.includes(tok))
  }).slice(0, 5)

  if (dems.length === 0 && logs.length === 0) {
    return { reply: `Aucun résultat pour "${key}". Vérifiez l'orthographe ou essayez avec un NUD.`, suggestions: ['Voir tous les demandeurs', 'Voir tous les logements'] }
  }
  const lines = []
  if (dems.length) {
    lines.push(`👤 **${dems.length} ${pluriel(dems.length, 'demandeur')}** trouvé${dems.length > 1 ? 's' : ''} :`)
    dems.forEach(d => lines.push(`  • ${d.nom || ''} ${d.prenom || ''} — NUD ${d.nud || 'n/a'}`))
  }
  if (logs.length) {
    if (lines.length) lines.push('')
    lines.push(`🏠 **${logs.length} ${pluriel(logs.length, 'logement')}** trouvé${logs.length > 1 ? 's' : ''} :`)
    logs.forEach(l => lines.push(`  • ${l.ref || l.id} — ${l.adresse || l.operation || ''}`))
  }
  const actions = []
  if (dems.length) actions.push({ label: 'Ouvrir le 1er demandeur', tab: 'demandeurs', openDemandeurId: dems[0].id })
  if (logs.length) actions.push({ label: 'Ouvrir le 1er logement', tab: 'logements' })
  return { reply: lines.join('\n'), actions }
}

function replyNavigate(q) {
  const t = norm(q)
  const mapTabs = [
    { kws: ['tableau', 'dashboard', 'accueil'], tab: 'dashboard', label: 'Tableau de bord' },
    { kws: ['alerte'], tab: 'alertes', label: 'Alertes' },
    { kws: ['demandeur', 'candidat'], tab: 'demandeurs', label: 'Demandeurs' },
    { kws: ['logement', 'habitation'], tab: 'logements', label: 'Logements' },
    { kws: ['matching'], tab: 'matching', label: 'Matching' },
    { kws: ['cal', 'prepa'], tab: 'cal', label: 'Prépa CAL' },
    { kws: ['audience'], tab: 'audiences', label: 'Audiences' },
    { kws: ['elu'], tab: 'elus', label: 'Gestion Élus' },
    { kws: ['calendrier'], tab: 'calendrier', label: 'Calendrier' },
    { kws: ['kanban', 'workflow'], tab: 'kanban', label: 'Kanban' },
    { kws: ['messagerie', 'message'], tab: 'messagerie', label: 'Messagerie' },
    { kws: ['relance'], tab: 'relances', label: 'Relances' },
    { kws: ['ia ', 'predict'], tab: 'ia-stats', label: 'IA prédictive' },
    { kws: ['carte', 'territoire'], tab: 'carte', label: 'Carte' },
    { kws: ['rapport'], tab: 'rapport', label: 'Rapport mensuel' },
    { kws: ['scoring', 'regle'], tab: 'scoring', label: 'Scoring' },
    { kws: ['stat'], tab: 'stats', label: 'Statistiques' },
    { kws: ['import'], tab: 'import', label: 'Import Pelehas' },
    { kws: ['notification'], tab: 'notifications', label: 'Notifications' },
    { kws: ['portail'], tab: 'portail', label: 'Portail' },
    { kws: ['utilisateur', 'user'], tab: 'users', label: 'Utilisateurs' },
    { kws: ['referentiel'], tab: 'referentiels', label: 'Référentiels' },
    { kws: ['telegram', 'bot'], tab: 'telegram', label: 'Telegram' },
    { kws: ['journal', 'log'], tab: 'logs', label: 'Journal' }
  ]
  const hit = mapTabs.find(m => any(t, m.kws))
  if (!hit) return { reply: 'Je ne reconnais pas cet onglet. Essayez : "ouvre les audiences", "va sur le kanban", etc.', suggestions: [] }
  return {
    reply: `J'ouvre **${hit.label}** pour vous.`,
    actions: [{ label: 'Y aller', tab: hit.tab, auto: true }]
  }
}

function replyCal() {
  return {
    reply: [
      '**Commission d\'Attribution des Logements (CAL)**',
      '',
      'Parcours complet dans Logivia :',
      '1. **Matching** : liste automatique des 4 meilleurs candidats pour chaque logement',
      '2. **Prépa CAL** : constitution des dossiers, ajustements manuels',
      '3. **Audiences Élus** : propositions validées par chaque élu référent',
      '4. **Calendrier CAL** : planification des commissions mensuelles',
      '5. **PV automatique** : PDF signé numériquement après validation du directeur',
      '',
      'Le scoring est configurable dans l\'onglet Scoring (accès directeur).'
    ].join('\n'),
    actions: [
      { label: 'Matching', tab: 'matching' },
      { label: 'Prépa CAL', tab: 'cal' },
      { label: 'Calendrier', tab: 'calendrier' }
    ]
  }
}

function replyAudiences(snap) {
  const now = new Date()
  const futures = snap.audiences.filter(a => {
    const d = new Date(a.date)
    return !isNaN(d) && d >= now
  }).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5)
  if (futures.length === 0) {
    return { reply: 'Aucune audience planifiée dans les jours à venir.', actions: [{ label: 'Planifier', tab: 'audiences' }] }
  }
  const list = futures.map(a => `• ${fmtDateFr(a.date)} — ${a.elu || 'élu'}${a.demandeur_nom ? ' · ' + a.demandeur_nom : ''}`).join('\n')
  return {
    reply: `📅 **${futures.length} prochaine${futures.length > 1 ? 's' : ''} audience${futures.length > 1 ? 's' : ''}** :\n\n${list}`,
    actions: [{ label: 'Voir toutes', tab: 'audiences' }, { label: 'Calendrier', tab: 'calendrier' }]
  }
}

function replyKanban() {
  return {
    reply: 'Le **Kanban workflow** visualise les dossiers par étape (dépôt → instruction → matching → CAL → attribution). Drag-drop pour changer d\'étape. Lancez-le avec le bouton ci-dessous.',
    actions: [{ label: 'Ouvrir Kanban', tab: 'kanban', auto: true }]
  }
}

function replyRelances(snap) {
  const cnt = snap.relances.filter(r => !r.envoyee && !r.archivee).length
  return {
    reply: `**${cnt} relance${cnt > 1 ? 's' : ''}** en attente. Les relances automatiques sont déclenchées par des règles d\'échéance (pièces manquantes, réponse candidat, etc.).`,
    actions: [{ label: 'Voir les relances', tab: 'relances' }]
  }
}

function replyNotifications(snap) {
  const nonLues = snap.notifications.filter(n => !n.lu).length
  return {
    reply: `Vous avez **${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}**.`,
    actions: [{ label: 'Ouvrir', tab: 'notifications' }]
  }
}

function replyScoring() {
  return {
    reply: [
      '**Scoring Logivia** — pondération configurable des critères d\'attribution :',
      '',
      '• Ancienneté de la demande',
      '• Composition familiale vs typologie du logement',
      '• Ressources vs plafonds',
      '• Situation actuelle (mal-logé, sans-abri, violence, DALO…)',
      '• Territoire / secteur de rattachement',
      '',
      'Les règles sont éditables par le directeur dans l\'onglet Scoring. Chaque candidat affiche "Voir pourquoi" pour expliquer son score.'
    ].join('\n'),
    actions: [{ label: 'Ouvrir Scoring', tab: 'scoring' }]
  }
}

function replyRgpd() {
  return {
    reply: [
      '**Conformité RGPD Logivia** :',
      '',
      '• Registre des traitements, DPIA, politique et mentions — disponibles en PDF',
      '• Endpoints d\'export et d\'effacement pour les demandeurs',
      '• Purge automatique : logs > 12 mois, sessions expirées',
      '• Base SQLite chiffrable (option SQLCipher)',
      '• Le portail candidat propose l\'onglet "Mes droits RGPD"',
      '',
      'Pour un droit d\'accès/effacement, c\'est dans le portail ou via le directeur.'
    ].join('\n')
  }
}

function replyTelegram() {
  return {
    reply: 'Le bot Telegram envoie aux élus leurs propositions d\'audience et aux candidats leurs mises à jour. Activation par QR code ou lien individuel depuis la fiche élu/candidat.',
    actions: [{ label: 'Ouvrir Telegram', tab: 'telegram' }]
  }
}

function replyRapports() {
  return {
    reply: 'Logivia génère automatiquement : **PV de CAL**, **rapport mensuel**, et 4 courriers officiels PDF (convocation, attestation, refus, attribution). Archivés et envoyables par Telegram.',
    actions: [{ label: 'Rapport mensuel', tab: 'rapport' }]
  }
}

function replyBackup() {
  return {
    reply: 'La base SQLite est sauvegardée **chaque jour** sur le volume persistant Railway (30 jours de rétention). Le directeur peut télécharger la base à tout moment depuis Journal → Backups.',
    actions: [{ label: 'Voir le journal', tab: 'logs' }]
  }
}

function replyPortail() {
  return {
    reply: 'Le **portail candidat** permet à chaque demandeur de : suivre son dossier, déposer ses pièces, répondre à une proposition, renouveler sa demande, télécharger son attestation, exercer ses droits RGPD. Accès NUD + date de naissance.',
    actions: [{ label: 'Portail Candidat', tab: 'portail' }]
  }
}

function replyTerritoire(snap) {
  const ref = snap.referentiels || {}
  const sect = (ref.secteurs || []).length
  const quart = (ref.quartiers || []).length
  const bail = (ref.bailleurs || []).length
  return {
    reply: `Saint-Denis de La Réunion : **${sect} secteurs**, **${quart} quartiers**, **${bail} bailleurs**. La carte affiche logements et demandes par quartier.`,
    actions: [{ label: 'Ouvrir la carte', tab: 'carte' }, { label: 'Référentiels', tab: 'referentiels' }]
  }
}

function replyHowTo(q) {
  const t = norm(q)
  if (any(t, ['demandeur', 'candidat'])) {
    return { reply: 'Pour **créer un demandeur** : onglet Demandeurs → bouton "Nouveau demandeur" en haut à droite. Renseignez NUD, identité, composition familiale, situation, puis enregistrez.', actions: [{ label: 'Y aller', tab: 'demandeurs' }] }
  }
  if (any(t, ['logement'])) {
    return { reply: 'Pour **ajouter un logement** : onglet Logements → bouton "Nouveau logement". Indiquez référence, adresse, typologie, bailleur, opération, etc.', actions: [{ label: 'Y aller', tab: 'logements' }] }
  }
  if (any(t, ['audience'])) {
    return { reply: 'Pour **planifier une audience** : onglet Audiences Élus → bouton "Planifier". Choisissez l\'élu, la date, le demandeur, le motif.', actions: [{ label: 'Y aller', tab: 'audiences' }] }
  }
  if (any(t, ['matching'])) {
    return { reply: 'Pour **lancer un matching** : onglet Matching → sélectionnez un logement → cliquez "Lancer matching". Logivia propose le top 4 des candidats scorés.', actions: [{ label: 'Y aller', tab: 'matching' }] }
  }
  return { reply: 'Dites-moi ce que vous voulez faire exactement (créer un demandeur, planifier une audience, lancer un matching…).', suggestions: ['Créer un demandeur', 'Ajouter un logement', 'Planifier une audience', 'Lancer un matching'] }
}

/* ------------------------------------------------------------------ */
/* Router principal                                                    */
/* ------------------------------------------------------------------ */

export async function answerQuery(query, ctx) {
  const { user, readArr, readObj } = ctx
  const snap = await loadSnapshot(readArr, readObj)
  const intent = detectIntent(query)

  switch (intent) {
    case 'greeting': return replyGreeting(user)
    case 'thanks': return replyThanks()
    case 'help': return replyHelp()
    case 'count_demandeurs': return replyCountDemandeurs(snap)
    case 'count_logements': return replyCountLogements(snap)
    case 'count_audiences': return replyCountAudiences(snap)
    case 'count_elus': return replyCountElus(snap)
    case 'stats': return replyStats(snap)
    case 'urgents': return replyUrgents(snap)
    case 'search': return replySearch(query, snap)
    case 'navigate': return replyNavigate(query)
    case 'cal': return replyCal()
    case 'audiences': return replyAudiences(snap)
    case 'kanban': return replyKanban()
    case 'relances': return replyRelances(snap)
    case 'notifications': return replyNotifications(snap)
    case 'scoring': return replyScoring()
    case 'rgpd': return replyRgpd()
    case 'telegram': return replyTelegram()
    case 'rapports': return replyRapports()
    case 'backup': return replyBackup()
    case 'portail': return replyPortail()
    case 'territoire': return replyTerritoire(snap)
    case 'how_to': return replyHowTo(query)
    default:
      return {
        reply: `Je n'ai pas compris "${query.slice(0, 80)}". Essayez par exemple : "combien de dossiers urgents", "trouve Dupont", "ouvre le kanban", ou tapez **aide**.`,
        suggestions: ['Aide', 'Dossiers urgents', 'Stats du mois', 'Audiences à venir']
      }
  }
}

/* ------------------------------------------------------------------ */
/* Fallback LLM Anthropic (optionnel)                                  */
/* ------------------------------------------------------------------ */

export async function answerWithLLM(query, ctx) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const snap = await loadSnapshot(ctx.readArr, ctx.readObj)
    const context = {
      nb_demandeurs: snap.demandeurs.length,
      nb_logements: snap.logements.length,
      nb_audiences: snap.audiences.length,
      nb_elus: snap.elus.length,
      nb_decisions: snap.decisions.length
    }
    const system = `Tu es l'assistante de l'application Logivia, un outil d'attribution de logements sociaux pour la ville de Saint-Denis de La Réunion. Tu réponds en français, de façon concise, professionnelle et bienveillante. Données actuelles : ${JSON.stringify(context)}. Si on te demande d'agir (modifier/supprimer), dis que tu ne peux que guider vers l'onglet concerné.`
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: query }]
      })
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content || []).map(c => c.text || '').join('\n').trim()
    if (!text) return null
    return { reply: text, llm: true }
  } catch {
    return null
  }
}
