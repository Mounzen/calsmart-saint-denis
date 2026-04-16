"""
CAL Smart — Générateur de fiche CAL PDF
Usage : python3 generate_pdf.py <logement_id> <output_path>
Appelé par le serveur Express via child_process
"""

import sys
import json
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ─── COULEURS ────────────────────────────────────────────────────────────────
NAVY    = colors.HexColor('#0B1E3D')
ACCENT  = colors.HexColor('#E05C2A')
GOLD    = colors.HexColor('#F0B429')
LIGHT   = colors.HexColor('#EEF1F6')
MUTED   = colors.HexColor('#5B6B85')
GREEN   = colors.HexColor('#16A34A')
AMBER   = colors.HexColor('#D97706')
RED     = colors.HexColor('#DC2626')
PURPLE  = colors.HexColor('#7C3AED')
WHITE   = colors.white
BORDER  = colors.HexColor('#DDE3EE')

# ─── STYLES ──────────────────────────────────────────────────────────────────
def styles():
    return {
        'title': ParagraphStyle('title',
            fontSize=18, fontName='Helvetica-Bold', textColor=WHITE,
            leading=22, alignment=TA_LEFT),
        'subtitle': ParagraphStyle('subtitle',
            fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#8A9BB5'),
            leading=14, alignment=TA_LEFT),
        'section': ParagraphStyle('section',
            fontSize=9, fontName='Helvetica-Bold', textColor=MUTED,
            leading=12, spaceBefore=4, spaceAfter=4,
            textTransform='uppercase', letterSpacing=1),
        'label': ParagraphStyle('label',
            fontSize=8, fontName='Helvetica', textColor=MUTED, leading=11),
        'value': ParagraphStyle('value',
            fontSize=9.5, fontName='Helvetica-Bold', textColor=NAVY, leading=13),
        'body': ParagraphStyle('body',
            fontSize=9, fontName='Helvetica', textColor=NAVY, leading=13),
        'small': ParagraphStyle('small',
            fontSize=8, fontName='Helvetica', textColor=MUTED, leading=11),
        'score_big': ParagraphStyle('score_big',
            fontSize=22, fontName='Helvetica-Bold', textColor=ACCENT,
            leading=26, alignment=TA_CENTER),
        'candidate_name': ParagraphStyle('candidate_name',
            fontSize=11, fontName='Helvetica-Bold', textColor=NAVY, leading=14),
        'tag': ParagraphStyle('tag',
            fontSize=8, fontName='Helvetica-Bold', textColor=ACCENT, leading=10),
        'footer': ParagraphStyle('footer',
            fontSize=7.5, fontName='Helvetica', textColor=MUTED,
            leading=10, alignment=TA_CENTER),
        'motif': ParagraphStyle('motif',
            fontSize=8.5, fontName='Helvetica', textColor=NAVY, leading=12),
    }

def chex(c):
    """Convert reportlab color to hex string for use in Paragraph markup"""
    r, g, b = int(c.red*255), int(c.green*255), int(c.blue*255)
    return f'{r:02x}{g:02x}{b:02x}'

# ─── DONNÉES ─────────────────────────────────────────────────────────────────
def load_data():
    base = os.path.join(os.path.dirname(__file__), 'data')
    with open(os.path.join(base, 'logements.json'), encoding='utf-8') as f:
        logements = json.load(f)
    with open(os.path.join(base, 'demandeurs.json'), encoding='utf-8') as f:
        demandeurs = json.load(f)
    with open(os.path.join(base, 'audiences.json'), encoding='utf-8') as f:
        audiences = json.load(f)
    with open(os.path.join(base, 'referentiels.json'), encoding='utf-8') as f:
        ref = json.load(f)
    return logements, demandeurs, audiences, ref

# ─── SCORING (miroir du JS) ───────────────────────────────────────────────────
TYP = ['T1','T2','T3','T4','T5','T6']

def ti(t):
    return TYP.index(t) if t in TYP else -1

def in_range(t, mn, mx):
    return ti(mn) <= ti(t) <= ti(mx)

def compute_score(dem, log, biais_data):
    te = log['loyer'] / dem['rev'] * 100
    excl = []
    if dem['statut'] != 'active': excl.append('Demande non active')
    if not in_range(log['typ'], dem['typ_min'], dem['typ_max']): excl.append('Typologie incompatible')
    if dem['pmr'] and not log['pmr']: excl.append('PMR requis — logement non adapté')
    if dem['rdc'] and not log['rdc']: excl.append('RDC requis — non disponible')
    if te > 40: excl.append(f"Taux d'effort {te:.0f}% trop élevé")
    if excl:
        return {'eligible': False, 'excl': excl, 'total': 0, 'te': f'{te:.1f}', 'scores': {}}

    s_typ = 20 if log['typ'] == dem['typ_v'] else 15
    np_ = dem['adultes'] + dem['enfants']
    idx = ti(log['typ'])
    s_comp = 15 if idx <= np_ <= idx+2 else 10 if np_ in (idx-1, idx+3) else 5 if np_ == idx+4 else 0
    s_taux = 20 if te<=25 else 16 if te<=30 else 10 if te<=35 else 5 if te<=40 else 0
    s_anc = 10 if dem['anc']>=36 else 8 if dem['anc']>=24 else 5 if dem['anc']>=12 else 3 if dem['anc']>=6 else 1
    s_urg = 0
    if dem['sans_log']: s_urg += 6
    if dem['violences']: s_urg += 5
    if dem['handicap']: s_urg += 4
    if dem['expulsion']: s_urg += 5
    if dem['suroc']: s_urg += 4
    if dem['grossesse']: s_urg += 3
    if dem['urgence'] and s_urg < 4: s_urg += 3
    s_urg = min(s_urg, 15)
    s_loc = 10 if log['quartier'] in dem['quartiers'] else 8 if log['secteur'] in dem['secteurs'] else 2
    s_prio = 5 if (dem['dalo'] or dem['prio_expulsion']) else 3 if (dem['mutation'] or dem['prio_handicap']) else 0
    s_dos = 5 if dem['pieces'] else 1
    base = s_typ + s_comp + s_taux + s_anc + s_urg + s_loc + s_prio + s_dos

    hb = biais_data.get(dem['id'], {})
    bonus, malus = 0, 0
    if hb.get('nb_presentations', 0) == 0: bonus += 5
    if hb.get('derniere_proposition_mois') is not None and hb['derniere_proposition_mois'] < 2: malus += 5
    nb_refus = hb.get('nb_refus_non_motives', 0)
    if nb_refus >= 2: malus += 8
    elif nb_refus == 1: malus += 3
    if hb.get('nb_presentations', 0) >= 3: bonus += 4

    total = min(max(base + bonus - malus, 0), 100)
    return {
        'eligible': True, 'excl': [], 'total': total, 'base': base,
        'te': f'{te:.1f}',
        'scores': {
            'typ': s_typ, 'comp': s_comp, 'taux': s_taux, 'anc': s_anc,
            'urg': s_urg, 'loc': s_loc, 'prio': s_prio, 'dos': s_dos
        },
        'biais': {'bonus': bonus, 'malus': malus}
    }

def adequation_label(score):
    if score >= 80: return 'Adéquation très forte', GREEN
    if score >= 60: return 'Adéquation forte', colors.HexColor('#1D6FA8')
    if score >= 40: return 'Adéquation moyenne', AMBER
    return 'Adéquation faible', RED

# ─── CONSTRUCTION PDF ─────────────────────────────────────────────────────────
def build_pdf(logement_id, output_path):
    logements, demandeurs, audiences, ref = load_data()
    S = styles()

    log = next((l for l in logements if l['id'] == logement_id), None)
    if not log:
        print(f'Logement {logement_id} non trouvé', file=sys.stderr)
        sys.exit(1)

    biais = ref.get('historique_biais', {})

    # Scoring de tous les demandeurs
    results = []
    for dem in demandeurs:
        res = compute_score(dem, log, biais)
        if res['eligible']:
            results.append((dem, res))
    results.sort(key=lambda x: -x[1]['total'])
    top4 = results[:4]

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=12*mm, bottomMargin=12*mm
    )
    story = []
    W = A4[0] - 30*mm  # largeur utile

    # ── HEADER ───────────────────────────────────────────────────────────────
    now = datetime.now().strftime('%d/%m/%Y à %H:%M')
    header_data = [[
        Paragraph('<b>CAL Smart</b>', ParagraphStyle('hd', fontSize=14,
            fontName='Helvetica-Bold', textColor=WHITE, leading=18)),
        Paragraph(f'FICHE DE COMMISSION D\'ATTRIBUTION<br/>'
                  f'<font size="8" color="#8A9BB5">Générée le {now}</font>',
            ParagraphStyle('hd2', fontSize=10, fontName='Helvetica-Bold',
                textColor=WHITE, leading=14, alignment=TA_RIGHT)),
    ]]
    header_tbl = Table(header_data, colWidths=[W*0.4, W*0.6])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (0,0), 12),
        ('RIGHTPADDING', (-1,0), (-1,0), 12),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 5*mm))

    # ── BLOC LOGEMENT ─────────────────────────────────────────────────────────
    story.append(Paragraph('LOGEMENT', S['section']))
    story.append(Spacer(1, 1*mm))

    log_left = [
        [Paragraph('Référence', S['label']), Paragraph(log['ref'], S['value'])],
        [Paragraph('Adresse', S['label']), Paragraph(log['adresse'], S['value'])],
        [Paragraph('Quartier / Secteur', S['label']), Paragraph(f"{log['quartier']} — {log['secteur']}", S['value'])],
        [Paragraph('Bailleur', S['label']), Paragraph(log['bailleur'], S['value'])],
        [Paragraph('Contingent / Réservataire', S['label']), Paragraph(log['contingent'], S['value'])],
        [Paragraph('Disponibilité', S['label']), Paragraph(log.get('dispo','—'), S['value'])],
    ]
    log_right = [
        [Paragraph('Typologie', S['label']), Paragraph(log['typ'], S['value'])],
        [Paragraph('Surface', S['label']), Paragraph(f"{log['surface']} m²", S['value'])],
        [Paragraph('Étage', S['label']), Paragraph(str(log['etage']), S['value'])],
        [Paragraph('Ascenseur', S['label']), Paragraph('Oui' if log['asc'] else 'Non', S['value'])],
        [Paragraph('PMR', S['label']), Paragraph('Oui' if log['pmr'] else 'Non', S['value'])],
        [Paragraph('RDC', S['label']), Paragraph('Oui' if log['rdc'] else 'Non', S['value'])],
    ]

    def make_info_block(rows):
        tbl = Table(rows, colWidths=[28*mm, 52*mm])
        tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ]))
        return tbl

    # Loyer
    loyer_data = [[
        Paragraph('HC', S['label']), Paragraph(f"{log['loyer_hc']} €", S['value']),
        Paragraph('Charges', S['label']), Paragraph(f"{log['charges']} €", S['value']),
        Paragraph('TOTAL', S['label']),
        Paragraph(f"<b>{log['loyer']} €/mois</b>",
            ParagraphStyle('loy', fontSize=13, fontName='Helvetica-Bold',
                textColor=ACCENT, leading=16)),
    ]]
    loyer_tbl = Table(loyer_data, colWidths=[14*mm, 22*mm, 20*mm, 22*mm, 16*mm, 36*mm])
    loyer_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('ROUNDEDCORNERS', [4,4,4,4]),
    ]))

    log_combined = Table([
        [make_info_block(log_left), make_info_block(log_right)]
    ], colWidths=[W*0.5, W*0.5])
    log_combined.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), LIGHT),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(log_combined)
    story.append(Spacer(1, 2*mm))
    story.append(loyer_tbl)
    story.append(Spacer(1, 5*mm))

    # ── TOP 4 CANDIDATS ───────────────────────────────────────────────────────
    story.append(Paragraph(f'TOP 4 CANDIDATS — {log["typ"]} {log["quartier"]}', S['section']))
    story.append(Spacer(1, 1*mm))

    for rank, (dem, res) in enumerate(top4, 1):
        adq_label, adq_color = adequation_label(res['total'])
        aud_fav = next((a for a in audiences if a['dem_id'] == dem['id'] and a['favorable']), None)

        # Tags priorités
        tags = []
        if dem.get('dalo'): tags.append('DALO')
        if dem.get('violences'): tags.append('VIF')
        if dem.get('sans_log'): tags.append('Sans logement')
        if dem.get('prio_expulsion'): tags.append('Expulsion')
        if dem.get('urgence'): tags.append('Urgence')
        if aud_fav: tags.append('⊛ Audience élu')
        if not dem.get('pieces'): tags.append('⚠ Dossier incomplet')

        tags_str = '  ·  '.join(tags) if tags else '—'

        # Score bars (ascii style in PDF)
        score_items = [
            ('Typ.', res['scores']['typ'], 20),
            ('Effort', res['scores']['taux'], 20),
            ('Compo', res['scores']['comp'], 15),
            ('Urgence', res['scores']['urg'], 15),
            ('Anc.', res['scores']['anc'], 10),
            ('Loc.', res['scores']['loc'], 10),
            ('Prio', res['scores']['prio'], 5),
            ('Dossier', res['scores']['dos'], 5),
        ]

        def score_bar_row(label, val, max_):
            pct = val / max_
            col = GREEN if pct >= 0.7 else AMBER if pct >= 0.4 else RED
            filled = int(pct * 12)
            bar = '█' * filled + '░' * (12 - filled)
            return [
                Paragraph(label, S['label']),
                Paragraph(f'<font color="#{chex(col)}">{bar}</font>',
                    ParagraphStyle('bar', fontSize=7, fontName='Helvetica', leading=9)),
                Paragraph(f'<font color="#{chex(col)}">{val}/{max_}</font>',
                    ParagraphStyle('bv', fontSize=7.5, fontName='Helvetica-Bold',
                        leading=9, alignment=TA_RIGHT)),
            ]

        score_rows = [score_bar_row(l, v, m) for l, v, m in score_items]
        score_tbl = Table(score_rows, colWidths=[14*mm, 28*mm, 12*mm])
        score_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))

        # Taux effort color
        te_val = float(res['te'])
        te_col = GREEN if te_val <= 30 else AMBER if te_val <= 35 else RED

        # Anti-biais résumé
        biais_txt = ''
        if res.get('biais'):
            parts = []
            if res['biais']['bonus'] > 0: parts.append(f"+{res['biais']['bonus']} équité")
            if res['biais']['malus'] > 0: parts.append(f"−{res['biais']['malus']} biais")
            if parts: biais_txt = ' · '.join(parts)

        # Audience detail
        aud_txt = ''
        if aud_fav:
            aud_txt = f"Audience {aud_fav['date_audience']} — {aud_fav['objet']}"

        # Décision (vide à remplir)
        decision_rows = [
            ['Décision', ''],
            ['Motif réglementaire', ''],
            ['Agent instructeur', ''],
        ]
        decision_tbl = Table(decision_rows, colWidths=[35*mm, 60*mm])
        decision_tbl.setStyle(TableStyle([
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
            ('TEXTCOLOR', (0,0), (0,-1), MUTED),
            ('TEXTCOLOR', (1,0), (1,-1), NAVY),
            ('BOX', (1,0), (1,-1), 0.5, BORDER),
            ('LINEBELOW', (1,0), (1,-1), 0.3, BORDER),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LEFTPADDING', (1,0), (1,-1), 4),
        ]))

        # Rang badge color
        rank_bg = ACCENT if rank == 1 else NAVY if rank == 2 else MUTED
        rang_cell = Table([[Paragraph(
            f'<font color="white"><b>#{rank}</b></font>',
            ParagraphStyle('rk', fontSize=16, fontName='Helvetica-Bold',
                textColor=WHITE, leading=20, alignment=TA_CENTER)
        )]], colWidths=[14*mm], rowHeights=[14*mm])
        rang_cell.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), rank_bg),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ROUNDEDCORNERS', [4,4,4,4]),
        ]))

        # Bloc identité + profil
        profil_lines = [
            Paragraph(f'{dem["nom"]} {dem["prenom"]}', S['candidate_name']),
            Paragraph(f'{dem["compo"]} · {dem["anc"]} mois d\'ancienneté · {dem["sit"]}',
                S['body']),
            Spacer(1, 1.5*mm),
            Paragraph(f'<font color="#{chex(adq_color)}">{adq_label}</font>  ·  '
                      f'NUD : {dem["nud"]}', S['small']),
            Spacer(1, 1*mm),
            Paragraph(f'Priorités : {tags_str}',
                ParagraphStyle('tags', fontSize=8, fontName='Helvetica',
                    textColor=ACCENT if tags else MUTED, leading=11)),
        ]
        if biais_txt:
            profil_lines.append(Spacer(1, 1*mm))
            profil_lines.append(Paragraph(f'Anti-biais : {biais_txt}',
                ParagraphStyle('ab', fontSize=8, fontName='Helvetica',
                    textColor=PURPLE, leading=11)))
        if aud_txt:
            profil_lines.append(Spacer(1, 1*mm))
            profil_lines.append(Paragraph(f'⊛ {aud_txt}',
                ParagraphStyle('aud', fontSize=8, fontName='Helvetica',
                    textColor=PURPLE, leading=11)))

        # Chiffres clés
        chiffres = Table([
            [Paragraph('Revenu/mois', S['label']),
             Paragraph('Taux effort', S['label']),
             Paragraph(f'Score ajusté', S['label'])],
            [Paragraph(f'{dem["rev"]:,} €'.replace(',', ' '), S['value']),
             Paragraph(f'<font color="#{chex(te_col)}">{res["te"]}%</font>',
                ParagraphStyle('te', fontSize=11, fontName='Helvetica-Bold', leading=14)),
             Paragraph(f'<font color="#{chex(adq_color)}">{res["total"]}</font>/100',
                ParagraphStyle('sc', fontSize=13, fontName='Helvetica-Bold', leading=16))],
        ], colWidths=[30*mm, 25*mm, 30*mm])
        chiffres.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
        ]))

        # Layout candidat : [rang] [profil] [scores] [décision]
        candidate_inner = Table([[
            rang_cell,
            [*profil_lines, Spacer(1, 2*mm), chiffres],
            score_tbl,
            decision_tbl,
        ]], colWidths=[16*mm, W*0.42, 56*mm, 97*mm])

        # Ajustement largeur
        candidate_inner = Table([[
            rang_cell,
            profil_lines + [Spacer(1,2*mm), chiffres],
            score_tbl,
            decision_tbl,
        ]], colWidths=[16*mm, W*0.36, 55*mm, 95*mm])

        candidate_inner.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 6),
            ('RIGHTPADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ]))

        # Wrapper avec fond et bordure
        rank_bg_light = colors.HexColor('#FFF5F0') if rank == 1 else colors.white
        wrapper = Table([[candidate_inner]], colWidths=[W])
        wrapper.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), rank_bg_light),
            ('BOX', (0,0), (-1,-1), 1.5 if rank==1 else 0.5,
             ACCENT if rank==1 else BORDER),
            ('ROUNDEDCORNERS', [6,6,6,6]),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))

        story.append(KeepTogether([wrapper, Spacer(1, 3*mm)]))

    # ── DÉCISION GLOBALE ─────────────────────────────────────────────────────
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph('DÉCISION DE COMMISSION', S['section']))
    story.append(Spacer(1, 1*mm))

    dec_data = [
        ['', 'Candidat retenu', 'Rang final', 'Date notification', 'Observations'],
        ['Décision :', '', '', '', ''],
        ['Visa président :', '', '', '', ''],
    ]
    dec_tbl = Table(dec_data, colWidths=[28*mm, 50*mm, 22*mm, 35*mm, W-135*mm])
    dec_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8.5),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0,1), (0,-1), MUTED),
        ('GRID', (0,0), (-1,-1), 0.4, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
        ('ROUNDEDCORNERS', [4,4,4,4]),
    ]))
    story.append(dec_tbl)

    # ── FOOTER ───────────────────────────────────────────────────────────────
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        f'CAL Smart · Ville de Saint-Denis · Service Habitat · '
        f'Commission du {datetime.now().strftime("%d/%m/%Y")} · '
        f'Document confidentiel — usage interne',
        S['footer']))
    story.append(Paragraph(
        f'Logement {log["ref"]} · {log["typ"]} {log["quartier"]} · '
        f'{log["bailleur"]} · Contingent {log["contingent"]}',
        S['footer']))

    doc.build(story)
    print(f'PDF généré : {output_path}')

# ─── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python3 generate_pdf.py <logement_id> <output_path>', file=sys.stderr)
        sys.exit(1)
    build_pdf(sys.argv[1], sys.argv[2])
