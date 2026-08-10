// backend/routes/areas.cjs — CRUD áreas
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole } = require('../auth.cjs');
const { asyncHandler } = require('../utils.cjs');

const router = express.Router();
router.use(requireAuth);

// Acepta boolean o 0/1 (lo que venga de MySQL o del frontend) y normaliza a boolean
const isActive = z.union([z.boolean(), z.number().int().min(0).max(1)])
  .transform((v) => v === 1 || v === true)
  .optional()
  .default(true);

const areaSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(255).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
  icon: z.string().trim().max(40).default('trash-2'),
  is_active: isActive,
  sort_order: z.number().int().optional().default(0),
});

const normalize = (row) => row ? { ...row, is_active: Boolean(row.is_active) } : row;

router.get('/', async (_req, res) => {
  const rows = await query(
    'SELECT * FROM waste_areas ORDER BY sort_order ASC, name ASC',
  );
  res.json({ areas: rows.map(normalize) });
});

router.get('/:id', async (req, res) => {
  const area = await one('SELECT * FROM waste_areas WHERE id = ?', [req.params.id]);
  if (!area) return res.status(404).json({ error: 'Área no encontrada' });
  res.json({ area: normalize(area) });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = areaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const a = parsed.data;
  try {
    const result = await query(
      `INSERT INTO waste_areas (name, description, color, icon, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [a.name, a.description || null, a.color, a.icon, a.is_active ? 1 : 0, a.sort_order],
    );
    const created = await one('SELECT * FROM waste_areas WHERE id = ?', [result.insertId]);
    res.status(201).json({ area: normalize(created) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    }
    throw err;
  }
});

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const parsed = areaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const a = parsed.data;
  try {
    const result = await query(
      `UPDATE waste_areas
       SET name=?, description=?, color=?, icon=?, is_active=?, sort_order=?
       WHERE id=?`,
      [a.name, a.description || null, a.color, a.icon, a.is_active ? 1 : 0, a.sort_order, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Área no encontrada' });
    const updated = await one('SELECT * FROM waste_areas WHERE id = ?', [req.params.id]);
    res.json({ area: normalize(updated) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    }
    throw err;
  }
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const usage = await one(
    'SELECT COUNT(*) AS n FROM waste_records WHERE area_id = ?',
    [req.params.id],
  );
  if (usage && usage.n > 0) {
    return res.status(409).json({
      error: `No se puede eliminar: el área tiene ${usage.n} registros asociados`,
    });
  }
  const result = await query('DELETE FROM waste_areas WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Área no encontrada' });
  res.json({ ok: true });
}));

module.exports = router;
