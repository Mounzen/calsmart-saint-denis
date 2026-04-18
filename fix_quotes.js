/**
 * Logivia - Nettoyeur de sources
 *
 * Corrige les problèmes courants qui cassent Babel/Vite :
 *  - Guillemets/apostrophes "intelligents" → ASCII
 *  - Lignes markdown parasites (```)
 *  - Flèches ASCII dans JSX (<- → ←, -> → →)
 *  - Espaces insécables invisibles (\u00A0) → espace normal
 *
 * Usage : node fix_quotes.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const REMPLACEMENTS = [
  ['\u2018', "'"], ['\u2019', "'"],
  ['\u201C', '"'], ['\u201D', '"'],
  ['\u2026', '...'], ['\u2013', '-'], ['\u2014', '-'],
  ['\u00A0', ' '],  // espace insécable
  ['\uFE0F', ''],   // variation selector (emoji)
  ['\u00B2', '2'], ['\u00B7', '-'],
]

const EXTENSIONS = ['.jsx', '.js']
const IGNORES = ['node_modules', '.git', 'dist', 'build', 'fix_quotes.js']

function corriger(chemin) {
  let contenu = fs.readFileSync(chemin, 'utf8')
  const original = contenu

  // 1) Remplacements caractères
  for (const [a, b] of REMPLACEMENTS) contenu = contenu.split(a).join(b)

  // 2) Supprimer lignes markdown parasites ``` (seules sur leur ligne)
  contenu = contenu.split('\n').filter(l => !/^\s*```\s*$/.test(l)).join('\n')

  // 3) Remplacer <- et -> dans JSX (entre > et <) par ← →
  //    uniquement quand c'est clairement du texte JSX
  contenu = contenu.replace(/>(\s*)<-(\s)/g, '>$1←$2')
  contenu = contenu.replace(/(\s)->(\s*)</g, '$1→$2<')

  if (contenu !== original) {
    fs.writeFileSync(chemin, contenu, 'utf8')
    console.log('  CORRIGE : ' + path.relative(__dirname, chemin))
    return true
  }
  return false
}

function scanner(dossier) {
  let corrections = 0, fichiers = 0
  for (const item of fs.readdirSync(dossier)) {
    if (IGNORES.includes(item)) continue
    const p = path.join(dossier, item)
    if (fs.statSync(p).isDirectory()) {
      const r = scanner(p)
      corrections += r.corrections; fichiers += r.fichiers
    } else if (EXTENSIONS.includes(path.extname(item))) {
      fichiers++
      if (corriger(p)) corrections++
    }
  }
  return { fichiers, corrections }
}

console.log('\n=== Nettoyage des sources Logivia ===\n')
const { fichiers, corrections } = scanner(__dirname)
console.log('\nFichiers analysés : ' + fichiers)
console.log('Fichiers corrigés : ' + corrections)
console.log(corrections === 0 ? '\nTout est déjà propre.' : '\nFait. Relance : npm run dev')
