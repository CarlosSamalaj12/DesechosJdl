// backend/routes/categories.cjs — CRUD categorías
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole } = require('../auth.cjs');
const { asyncHandler } = require('../utils.cjs');

const router = express.Router();
router.use(requireAuth);

const slugify = (s) =>
  s.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const isActive = z.union([z.boolean(), z.number().int().min(0).max(1)])
  .transform((v) => v === 1 || v === true)
  .optional()
  .default(true);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  icon: z.string().trim().max(40).default('package'),
  is_active: isActive,
  sort_order: z.number().int().optional().default(0),
});

const normalize = (row) => row ? { ...row, is_active: Boolean(row.is_active) } : row;

router.get('/', async (_req, res) => {
  const rows = await query(
    'SELECT * FROM waste_categories ORDER BY sort_order ASC, name ASC',
  );
  res.json({ categories: rows.map(normalize) });
});

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const c = parsed.data;
  const slug = c.slug || slugify(c.name);
  try {
    const result = await query(
      `INSERT INTO waste_categories (name, slug, color, icon, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [c.name, slug, c.color, c.icon, c.is_active ? 1 : 0, c.sort_order],
    );
    const created = await one('SELECT * FROM waste_categories WHERE id = ?', [result.insertId]);
    res.status(201).json({ category: normalize(created) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o slug' });
    }
    throw err;
  }
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const c = parsed.data;
  try {
    const result = await query(
      `UPDATE waste_categories
       SET name=?, color=?, icon=?, is_active=?, sort_order=?
       WHERE id=?`,
      [c.name, c.color, c.icon, c.is_active ? 1 : 0, c.sort_order, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
    const updated = await one('SELECT * FROM waste_categories WHERE id = ?', [req.params.id]);
    res.json({ category: normalize(updated) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o slug' });
    }
    throw err;
  }
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const usage = await one(
    'SELECT COUNT(*) AS n FROM waste_records WHERE category_id = ?',
    [req.params.id],
  );
  if (usage && usage.n > 0) {
    return res.status(409).json({
      error: `No se puede eliminar: la categoría tiene ${usage.n} registros`,
    });
  }
  const result = await query('DELETE FROM waste_categories WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ ok: true });
}));

module.exports = router;
