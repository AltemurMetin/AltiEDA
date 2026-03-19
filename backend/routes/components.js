/**
 * AltiEDA – Component Library API Routes
 * POST   /api/components           – save custom component
 * GET    /api/components           – list (own + public)
 * GET    /api/components/:id       – get one
 * DELETE /api/components/:id       – delete
 */
import { Router } from 'express';
import { pool }   from '../db/pool.js';

const router = Router();

function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

// Save / upsert component
router.post('/', requireAuth, async (req, res) => {
  const { partId, partName, category, symbolData, footprintData, pinPadMap, spiceModel, isPublic = false, metadata = {} } = req.body;
  if (!partId || !partName) return res.status(400).json({ error: 'partId and partName required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO component_library
         (owner_id, part_id, part_name, category, symbol_data, footprint_data, pin_pad_map, spice_model, is_public, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (owner_id, part_id) DO UPDATE SET
         part_name      = EXCLUDED.part_name,
         category       = EXCLUDED.category,
         symbol_data    = EXCLUDED.symbol_data,
         footprint_data = EXCLUDED.footprint_data,
         pin_pad_map    = EXCLUDED.pin_pad_map,
         spice_model    = EXCLUDED.spice_model,
         is_public      = EXCLUDED.is_public,
         metadata       = EXCLUDED.metadata
       RETURNING id, part_id, part_name`,
      [req.userId, partId, partName, category ?? 'Custom',
       JSON.stringify(symbolData), JSON.stringify(footprintData),
       JSON.stringify(pinPadMap), JSON.stringify(spiceModel),
       isPublic, JSON.stringify(metadata)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List components
router.get('/', requireAuth, async (req, res) => {
  const { category, search } = req.query;
  let sql  = `SELECT id, part_id, part_name, category, is_public, metadata, created_at
              FROM component_library
              WHERE (owner_id = $1 OR is_public = true)`;
  const params = [req.userId];
  if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
  if (search)   { params.push(`%${search}%`); sql += ` AND part_name ILIKE $${params.length}`; }
  sql += ' ORDER BY part_name';
  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get one
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM component_library WHERE id = $1 AND (owner_id = $2 OR is_public = true)`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM component_library WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found or forbidden' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
