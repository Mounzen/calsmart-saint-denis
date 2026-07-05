/**
 * Migration ponctuelle : pousse les fichiers JSON existants
 * (server/data/*.json) vers Supabase (table logivia_kv).
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-to-supabase.mjs
 *
 * Sans risque à relancer : upsert (écrase la valeur existante pour un même
 * fichier). N'écrase rien d'autre.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'server', 'data')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (variables d\'environnement).')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  if (!existsSync(DATA_DIR)) {
    console.error('Dossier introuvable : ' + DATA_DIR)
    process.exit(1)
  }
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'))
  if (files.length === 0) {
    console.log('Aucun fichier .json à migrer dans ' + DATA_DIR)
    return
  }

  const now = Date.now()
  const rows = []
  for (const f of files) {
    try {
      const raw = readFileSync(join(DATA_DIR, f), 'utf8').trim()
      if (!raw) continue
      const parsed = JSON.parse(raw)
      rows.push({ file: f, data: parsed, updated_at: now, size_bytes: Buffer.byteLength(raw, 'utf8') })
      console.log('  + ' + f + ' (' + Math.round(Buffer.byteLength(raw, 'utf8') / 1024) + ' ko)')
    } catch (e) {
      console.error('  ! ' + f + ' ignoré (JSON invalide) : ' + e.message)
    }
  }

  if (rows.length === 0) {
    console.log('Rien à migrer.')
    return
  }

  const { error } = await supabase.from('logivia_kv').upsert(rows, { onConflict: 'file' })
  if (error) {
    console.error('Échec de la migration : ' + error.message)
    process.exit(1)
  }
  console.log('\n' + rows.length + ' fichier(s) migré(s) avec succès vers Supabase (table logivia_kv).')
}

main()
