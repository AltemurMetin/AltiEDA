/**
 * AltiEDA – Project API Routes
 * POST   /api/projects               – create project
 * GET    /api/projects/:id           – load project
 * PUT    /api/projects/:id/schematic – sync schematic state
 * PUT    /api/projects/:id/pcb       – sync PCB state
 * PUT    /api/projects/:id/stackup   – sync stackup
 * GET    /api/projects               – list user projects
 * DELETE /api/projects/:id           – delete project
 */
import { Router } from 'express';
import { pool }   from '../db/pool.js';

const router = Router();

// ── Middleware: simple auth placeholder ───────────────────────────────────────
function requireAuth(req, res, next) {
  // In production: verify JWT token from Authorization header
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

// ── Create project ────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, description, isPublic = false } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (owner_id, name, description, is_public)
       VALUES ($1, $2, $3, $4) RETURNING id, name, created_at`,
      [req.userId, name, description ?? '', isPublic]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── List user projects ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, is_public, thumbnail_url, created_at, updated_at
       FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Load project ──────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM projects WHERE id = $1 AND (owner_id = $2 OR is_public = true)`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sync schematic state ──────────────────────────────────────────────────────
router.put('/:id/schematic', requireAuth, async (req, res) => {
  const { schematicState } = req.body;
  if (!schematicState) return res.status(400).json({ error: 'schematicState required' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE projects SET schematic_state = $1
       WHERE id = $2 AND owner_id = $3`,
      [JSON.stringify(schematicState), req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or forbidden' });

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, project_id, action) VALUES ($1, $2, 'save_schematic')`,
      [req.userId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sync PCB state ────────────────────────────────────────────────────────────
router.put('/:id/pcb', requireAuth, async (req, res) => {
  const { pcbState } = req.body;
  if (!pcbState) return res.status(400).json({ error: 'pcbState required' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE projects SET pcb_state = $1 WHERE id = $2 AND owner_id = $3`,
      [JSON.stringify(pcbState), req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or forbidden' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sync stackup ──────────────────────────────────────────────────────────────
router.put('/:id/stackup', requireAuth, async (req, res) => {
  const { stackupState } = req.body;
  if (!stackupState) return res.status(400).json({ error: 'stackupState required' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE projects SET stackup_state = $1 WHERE id = $2 AND owner_id = $3`,
      [JSON.stringify(stackupState), req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or forbidden' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete project ────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM projects WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or forbidden' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
