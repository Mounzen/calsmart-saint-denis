// Point d'entrée Vercel : une app Express est directement utilisable comme
// handler (req, res) => {} par le runtime Node de Vercel. On réexporte
// simplement l'app déjà entièrement configurée dans server/index.js
// (toutes les ~100 routes, middlewares, auth, etc. restent inchangés).
import app from '../server/index.js'

export default app
