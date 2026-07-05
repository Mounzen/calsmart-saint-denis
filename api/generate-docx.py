"""
Logivia - Génération de courrier .docx (fonction serverless Vercel Python)

Remplace l'ancien appel `spawn('python3', ['generate_docx.py', ...])` depuis
le serveur Express (server/index.js) : un environnement Node serverless
(Vercel) n'a pas de binaire python3 disponible pour un sous-processus.
Vercel supporte nativement les fonctions Python (@vercel/python) : ce fichier
est déployé comme son propre endpoint, appelé en HTTP interne depuis
server/index.js (voir runDocxGenerator).

Même logique de génération OOXML que l'ancien server/generate_docx.py,
adaptée pour construire le .docx en mémoire (BytesIO) et le renvoyer
directement dans la réponse HTTP au lieu d'écrire sur disque.
"""
import json
import zipfile
import io
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from xml.sax.saxutils import escape as xml_escape

CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"""

PACKAGE_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""

DOCUMENT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

STYLES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Titre">
    <w:name w:val="Titre"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="36"/><w:color w:val="0B1E3D"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Sous">
    <w:name w:val="Sous-titre"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Objet">
    <w:name w:val="Objet"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="E05C2A"/></w:pBdr>
      <w:shd w:val="clear" w:color="auto" w:fill="FEF3E9"/>
      <w:spacing w:before="160" w:after="200"/>
      <w:ind w:left="120" w:right="120"/>
    </w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0B1E3D"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Dest">
    <w:name w:val="Destinataire"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="right"/><w:spacing w:after="80"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Signature">
    <w:name w:val="Signature"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="right"/><w:spacing w:before="600" w:after="80"/></w:pPr>
    <w:rPr><w:i/><w:color w:val="475569"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Footer">
    <w:name w:val="Footer"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="400"/></w:pPr>
    <w:rPr><w:sz w:val="16"/><w:color w:val="64748B"/></w:rPr>
  </w:style>
</w:styles>
"""

CORE_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{title}</dc:title>
  <dc:creator>Logivia - Service Habitat</dc:creator>
  <cp:lastModifiedBy>Logivia</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{date_iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{date_iso}</dcterms:modified>
</cp:coreProperties>
"""

APP_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Logivia</Application>
  <Company>Mairie de Saint-Denis - La Reunion</Company>
</Properties>
"""


def esc(s):
    return xml_escape(str(s or ''))


def p_plain(text, style=None, bold=False, align=None, color=None, size=None):
    ppr = ''
    if style or align:
        ppr = '<w:pPr>'
        if style:
            ppr += '<w:pStyle w:val="{}"/>'.format(style)
        if align:
            ppr += '<w:jc w:val="{}"/>'.format(align)
        ppr += '</w:pPr>'
    rpr = ''
    if bold or color or size:
        rpr = '<w:rPr>'
        if bold:
            rpr += '<w:b/>'
        if color:
            rpr += '<w:color w:val="{}"/>'.format(color)
        if size:
            rpr += '<w:sz w:val="{}"/>'.format(size)
        rpr += '</w:rPr>'
    return '<w:p>{}<w:r>{}<w:t xml:space="preserve">{}</w:t></w:r></w:p>'.format(ppr, rpr, esc(text))


def p_empty():
    return '<w:p/>'


def p_meta_2col(left, right):
    return ('<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr>'
            '<w:r><w:t xml:space="preserve">{}</w:t></w:r>'
            '<w:r><w:tab/><w:t xml:space="preserve">{}</w:t></w:r></w:p>'
    ).format(esc(left), esc(right))


def p_separator():
    return ('<w:p><w:pPr><w:pBdr>'
            '<w:bottom w:val="single" w:sz="16" w:space="1" w:color="E05C2A"/>'
            '</w:pBdr></w:pPr></w:p>')


def build_document_xml(data):
    parts = []
    parts.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    parts.append('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">')
    parts.append('<w:body>')

    parts.append(p_plain('MAIRIE DE SAINT-DENIS', style='Titre', bold=True))
    parts.append(p_plain('La Reunion (974) - Service Habitat - Commission d Attribution des Logements', style='Sous'))
    parts.append(p_plain('2 rue de Paris, 97400 Saint-Denis - Tel : 02 62 40 62 62', style='Sous'))
    parts.append(p_separator())

    ref = data.get('ref', '')
    date_fr = data.get('date_fr', '')
    nud = data.get('nud', '')
    meta_left = 'Ref : {}'.format(ref) + (' / NUD : ' + nud if nud else '')
    meta_right = 'Saint-Denis, le ' + date_fr
    parts.append(p_meta_2col(meta_left, meta_right))
    parts.append(p_empty())

    dest = data.get('destinataire') or {}
    ligne1 = ' '.join(filter(None, [dest.get('civilite'), dest.get('prenom'), dest.get('nom')])).strip()
    if ligne1:
        parts.append(p_plain(ligne1, style='Dest', bold=True))
    if dest.get('adresse_ligne1'):
        parts.append(p_plain(dest['adresse_ligne1'], style='Dest'))
    if dest.get('adresse_ligne2'):
        parts.append(p_plain(dest['adresse_ligne2'], style='Dest'))
    parts.append(p_empty())

    objet = data.get('objet', '')
    if objet:
        parts.append(p_plain('Objet : ' + objet, style='Objet', bold=True))

    for par in (data.get('paragraphes') or []):
        if par and par.strip():
            parts.append(p_plain(par))
        else:
            parts.append(p_empty())

    sig = data.get('signature_line') or 'Pour le Maire, l Adjoint delegue au Logement'
    parts.append(p_plain(sig, style='Signature'))
    parts.append(p_empty())

    parts.append(p_separator())
    parts.append(p_plain(
        'Mairie de Saint-Denis - Service Habitat - www.saintdenis.re - Document genere le '
        + datetime.now().strftime('%d/%m/%Y %H:%M'),
        style='Footer'))

    parts.append('<w:sectPr>')
    parts.append('<w:pgSz w:w="11906" w:h="16838"/>')
    parts.append('<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>')
    parts.append('</w:sectPr>')

    parts.append('</w:body>')
    parts.append('</w:document>')
    return ''.join(parts)


def build_docx_bytes(data):
    title = data.get('titre') or data.get('objet') or 'Courrier Logivia'
    date_iso = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    core = CORE_XML.format(title=esc(title), date_iso=date_iso)
    document = build_document_xml(data)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CONTENT_TYPES_XML)
        z.writestr('_rels/.rels', PACKAGE_RELS)
        z.writestr('word/document.xml', document)
        z.writestr('word/_rels/document.xml.rels', DOCUMENT_RELS)
        z.writestr('word/styles.xml', STYLES_XML)
        z.writestr('docProps/core.xml', core)
        z.writestr('docProps/app.xml', APP_XML)
    return buf.getvalue()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('content-length', 0))
            body = self.rfile.read(length) if length else b'{}'
            data = json.loads(body.decode('utf-8') or '{}')

            # Authentification interne simple : évite qu'un tiers appelle
            # directement cet endpoint public pour générer des documents
            # arbitraires. Doit correspondre à DOCX_SERVICE_SECRET côté
            # serveur Node (voir server/index.js / runDocxGenerator).
            secret = self.headers.get('x-internal-secret', '')
            expected = __import__('os').environ.get('DOCX_SERVICE_SECRET', '')
            if expected and secret != expected:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'{"error":"unauthorized"}')
                return

            docx_bytes = build_docx_bytes(data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            self.send_header('Content-Length', str(len(docx_bytes)))
            self.end_headers()
            self.wfile.write(docx_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
