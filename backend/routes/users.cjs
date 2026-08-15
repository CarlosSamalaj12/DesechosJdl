// backend/routes/users.cjs — CRUD usuarios (solo admin)
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole, hashPassword } = require('../auth.cjs');
const { asyncHandler } = require('../utils.cjs');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const createSchema = z.object({
  email: z.string().email().max(190),
  full_name: z.string().trim().min(2).max(190),
  password: z.string().min(4).max(120),
  role: z.enum(['admin', 'operator']).default('operator'),
  area_id: z.number().int().positive().nullable().optional(),
});

const isActive = z.union([z.boolean(), z.number().int().min(0).max(1)])
  .transform((v) => v === 1 || v === true)
  .optional();

const updateSchema = z.object({
  email: z.string().email().max(190).optional(),
  full_name: z.string().trim().min(2).max(190).optional(),
  password: z.string().min(4).max(120).optional(),
  role: z.enum(['admin', 'operator']).optional(),
  area_id: z.number().int().positive().nullable().optional(),
  is_active: isActive,
});

const normalize = (u) => u ? { ...u, is_active: Boolean(u.is_active) } : u;

router.get('/', async (_req, res) => {
  const users = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.area_id, u.is_active, u.created_at,
            a.name AS area_name, a.color AS area_color,
            (SELECT COUNT(*) FROM waste_records r WHERE r.recorded_by = u.id) +
            (SELECT COUNT(*) FROM daily_headcount h WHERE h.recorded_by = u.id) +
            (SELECT COUNT(*) FROM reduction_plans p WHERE p.created_by = u.id OR p.responsible_id = u.id) +
            (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.done_by = u.id) AS record_count
     FROM users u
     LEFT JOIN waste_areas a ON a.id = u.area_id
     ORDER BY u.role DESC, u.full_name ASC`,
  );
  res.json({ users: users.map(normalize) });
});

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const u = parsed.data;
  const hash = await hashPassword(u.password);

  try {
    const result = await query(
      `INSERT INTO users (email, full_name, password_hash, role, area_id, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [u.email.toLowerCase(), u.full_name, hash, u.role, u.area_id || null],
    );
    const created = await one(
      `SELECT id, email, full_name, role, area_id, is_active FROM users WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ user: normalize(created) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    throw err;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const u = parsed.data;

  // Construcción dinámica del SET
  const fields = [];
  const values = [];
  if (u.email !== undefined)        { fields.push('email = ?');         values.push(u.email.toLowerCase()); }
  if (u.full_name !== undefined)    { fields.push('full_name = ?');     values.push(u.full_name); }
  if (u.role !== undefined)         { fields.push('role = ?');          values.push(u.role); }
  if (u.area_id !== undefined)      { fields.push('area_id = ?');       values.push(u.area_id); }
  if (u.is_active !== undefined)    { fields.push('is_active = ?');     values.push(u.is_active ? 1 : 0); }
  if (u.password) {
    const hash = await hashPassword(u.password);
    fields.push('password_hash = ?');
    values.push(hash);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  values.push(req.params.id);
  try {
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values,
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
    const updated = await one(
      `SELECT u.id, u.email, u.full_name, u.role, u.area_id, u.is_active,
              a.name AS area_name, a.color AS area_color
       FROM users u LEFT JOIN waste_areas a ON a.id = u.area_id
       WHERE u.id = ?`,
      [req.params.id],
    );
    res.json({ user: normalize(updated) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    throw err;
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  // No permitir borrarse a sí mismo
  if (Number(req.params.id) === req.user.sub) {
    return res.status(409).json({ error: 'No podés eliminar tu propio usuario' });
  }
  const id = Number(req.params.id);
  // Si el usuario tiene historial (registros, headcounts, planes), no se borra:
  // hay que desactivarlo para conservar la integridad de los datos (FK).
  const usage = await one(
    `SELECT
       (SELECT COUNT(*) FROM waste_records r WHERE r.recorded_by = ?) +
       (SELECT COUNT(*) FROM daily_headcount h WHERE h.recorded_by = ?) +
       (SELECT COUNT(*) FROM reduction_plans p WHERE p.created_by = ? OR p.responsible_id = ?) +
       (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.done_by = ?) AS n`,
    [id, id, id, id, id],
  );
  const n = Number(usage ? usage.n : 0);
  if (n > 0) {
    return res.status(409).json({
      error: `El usuario tiene ${n} registros asociados. Desactivá el usuario en vez de eliminarlo (botón de encendido).`,
    });
  }
  const result = await query('DELETE FROM users WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
}));

module.exports = router;
