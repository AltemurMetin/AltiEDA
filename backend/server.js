/**
 * AltiEDA – Node.js / Express API Server
 */
import express    from 'express';
import path       from 'path';
import { fileURLToPath } from 'url';
import projectRoutes   from './routes/projects.js';
import componentRoutes from './routes/components.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
const PORT      = process.env.PORT ?? 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));   // large JSON payloads for schematic/PCB state
app.use(express.urlencoded({ extended: true }));

// CORS (simple)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-User-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/projects',   projectRoutes);
app.use('/api/components', componentRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Static frontend (production) ──────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`AltiEDA server running on http://localhost:${PORT}`);
});

export default app;
