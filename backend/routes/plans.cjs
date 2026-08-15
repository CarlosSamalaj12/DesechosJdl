// backend/routes/plans.cjs — planes de reducción
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole } = require('../auth.cjs');
const { todayLocal, isoDay, addDays, parseLocal } = require('../utils.cjs');

const router = express.Router();
router.use(requireAuth);

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

const planSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional().nullable(),
  area_id: z.number().int().positive().nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  start_date: z.string().regex(dateOnly),
  end_date: z.string().regex(dateOnly),
  target_pct: z.number().min(0).max(100).nullable().optional(),
  target_lb_person: z.number().min(0).max(1000).nullable().optional(),
  status: z.enum(['active', 'completed', 'expired', 'cancelled']).optional(),
  responsible_id: z.number().int().positive().nullable().optional(),
});

const stepSchema = z.object({
  title: z.string().trim().min(2).max(200),
  step_order: z.number().int().optional(),
});

const stepUpdateSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  step_order: z.number().int().optional(),
  is_done: z.boolean().optional(),
});

// ── Listado ─────────────────────────────────────
router.get('/', async (req, res) => {
  const status = req.query.status; // active, completed, expired, cancelled
  const params = [];
  let where = '1=1';
  if (status) { where += ' AND p.status = ?'; params.push(status); }

  const plans = await query(
    `SELECT p.*,
            a.name AS area_name, a.color AS area_color,
            c.name AS category_name, c.color AS category_color,
            r.full_name AS responsible_name,
            (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.plan_id = p.id) AS steps_total,
            (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.plan_id = p.id AND s.is_done = 1) AS steps_done
     FROM reduction_plans p
     LEFT JOIN waste_areas a        ON a.id = p.area_id
     LEFT JOIN waste_categories c   ON c.id = p.category_id
     LEFT JOIN users r              ON r.id = p.responsible_id
     WHERE ${where}
     ORDER BY
       CASE p.status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
       p.start_date DESC`,
    params,
  );
  res.json({ plans });
});

router.get('/active', async (_req, res) => {
  const today = todayLocal();
  const plans = await query(
    `SELECT p.*,
            a.name AS area_name, a.color AS area_color,
            c.name AS category_name, c.color AS category_color,
            r.full_name AS responsible_name,
            (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.plan_id = p.id) AS steps_total,
            (SELECT COUNT(*) FROM reduction_plan_steps s WHERE s.plan_id = p.id AND s.is_done = 1) AS steps_done
     FROM reduction_plans p
     LEFT JOIN waste_areas a        ON a.id = p.area_id
     LEFT JOIN waste_categories c   ON c.id = p.category_id
     LEFT JOIN users r              ON r.id = p.responsible_id
     WHERE p.status = 'active' AND p.start_date <= ? AND p.end_date >= ?
     ORDER BY p.start_date DESC`,
    [today, today],
  );
  res.json({ plans });
});

router.get('/:id', async (req, res) => {
  const plan = await one(
    `SELECT p.*,
            a.name AS area_name, a.color AS area_color,
            c.name AS category_name, c.color AS category_color,
            r.full_name AS responsible_name
     FROM reduction_plans p
     LEFT JOIN waste_areas a        ON a.id = p.area_id
     LEFT JOIN waste_categories c   ON c.id = p.category_id
     LEFT JOIN users r              ON r.id = p.responsible_id
     WHERE p.id = ?`,
    [req.params.id],
  );
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  const steps = await query(
    `SELECT s.*, u.full_name AS done_by_name
     FROM reduction_plan_steps s
     LEFT JOIN users u ON u.id = s.done_by
     WHERE s.plan_id = ?
     ORDER BY s.step_order ASC, s.id ASC`,
    [req.params.id],
  );
  res.json({ plan: { ...plan, steps } });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const p = parsed.data;
  if (new Date(p.end_date) < new Date(p.start_date)) {
    return res.status(400).json({ error: 'end_date debe ser >= start_date' });
  }
  const result = await query(
    `INSERT INTO reduction_plans
      (title, description, area_id, category_id, start_date, end_date,
       target_pct, target_lb_person, status, responsible_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.title, p.description || null,
      p.area_id || null, p.category_id || null,
      p.start_date, p.end_date,
      p.target_pct ?? null, p.target_lb_person ?? null,
      p.status || 'active',
      p.responsible_id || null,
      req.user.sub,
    ],
  );
  const created = await one('SELECT * FROM reduction_plans WHERE id = ?', [result.insertId]);
  res.status(201).json({ plan: created });
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const p = parsed.data;
  const result = await query(
    `UPDATE reduction_plans SET
       title=?, description=?, area_id=?, category_id=?,
       start_date=?, end_date=?, target_pct=?, target_lb_person=?,
       status=?, responsible_id=?
     WHERE id=?`,
    [
      p.title, p.description || null,
      p.area_id || null, p.category_id || null,
      p.start_date, p.end_date,
      p.target_pct ?? null, p.target_lb_person ?? null,
      p.status || 'active',
      p.responsible_id || null,
      req.params.id,
    ],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Plan no encontrado' });
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const result = await query('DELETE FROM reduction_plans WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Plan no encontrado' });
  res.json({ ok: true });
});

// ── Meta vs realidad ────────────────────────────
// Promedio de libras/día (y lb/persona) de un período, respetando
// el área y la categoría del plan.
async function periodStats(plan, from, to) {
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (plan.area_id)     { where += ' AND r.area_id = ?';     params.push(plan.area_id); }
  if (plan.category_id) { where += ' AND r.category_id = ?'; params.push(plan.category_id); }
  const rec = await one(
    `SELECT COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_records r WHERE ${where}`,
    params,
  );
  const hc = await one(
    'SELECT COALESCE(SUM(people_count), 0) AS people FROM daily_headcount WHERE record_date BETWEEN ? AND ?',
    [from, to],
  );
  const days = Math.round((parseLocal(to) - parseLocal(from)) / 86400000) + 1;
  const people = Number(hc.people || 0);
  const pounds = Number(rec.pounds || 0);
  return {
    from, to, days,
    pounds,
    avg_pounds: days > 0 ? pounds / days : 0,
    people,
    avg_lb_persona: people > 0 ? pounds / people : 0,
  };
}

// GET /api/plans/:id/impact
// Compara libras/día antes vs durante (y después si ya terminó) y
// lo contrasta con la meta de reducción (target_pct).
router.get('/:id/impact', async (req, res) => {
  const plan = await one('SELECT * FROM reduction_plans WHERE id = ?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const today = todayLocal();
  // Para planes activos, el período "durante" va hasta hoy (no hasta el final,
  // que todavía no pasó). "Antes" usa la misma cantidad de días para comparar igual.
  const duringTo = today > plan.end_date ? plan.end_date : today;
  const duringDays = Math.round((parseLocal(duringTo) - parseLocal(plan.start_date)) / 86400000) + 1;
  const before = await periodStats(
    plan,
    isoDay(addDays(parseLocal(plan.start_date), -duringDays)),
    isoDay(addDays(parseLocal(plan.start_date), -1)),
  );
  const during = await periodStats(plan, plan.start_date, duringTo);

  const ended = today > plan.end_date;
  const after = ended
    ? await periodStats(plan, isoDay(addDays(parseLocal(plan.end_date), 1)), today)
    : null;

  const changePct = before.avg_pounds > 0
    ? ((during.avg_pounds - before.avg_pounds) / before.avg_pounds) * 100
    : null;
  const changePctPersona = before.avg_lb_persona > 0
    ? ((during.avg_lb_persona - before.avg_lb_persona) / before.avg_lb_persona) * 100
    : null;
  const targetPct = plan.target_pct != null ? Number(plan.target_pct) : null;
  const met = targetPct != null && changePct != null ? changePct <= -targetPct : null;

  res.json({
    plan_id: plan.id,
    before,
    during,
    after,
    change_pct: changePct,
    change_pct_persona: changePctPersona,
    target_pct: targetPct,
    met,
  });
});

// ── Pasos (cualquier user puede marcar; solo admin crea/borra) ──
router.post('/:id/steps', requireRole('admin'), async (req, res) => {
  const parsed = stepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const plan = await one('SELECT id FROM reduction_plans WHERE id = ?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

  const order = parsed.data.step_order
    ?? (await one('SELECT COALESCE(MAX(step_order), 0) + 1 AS n FROM reduction_plan_steps WHERE plan_id = ?', [req.params.id]))?.n
    ?? 1;

  const result = await query(
    'INSERT INTO reduction_plan_steps (plan_id, step_order, title) VALUES (?, ?, ?)',
    [req.params.id, order, parsed.data.title],
  );
  res.status(201).json({
    step: await one('SELECT * FROM reduction_plan_steps WHERE id = ?', [result.insertId]),
  });
});

router.put('/steps/:stepId', async (req, res) => {
  const parsed = stepUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const fields = [];
  const values = [];
  if (parsed.data.title !== undefined)     { fields.push('title = ?'); values.push(parsed.data.title); }
  if (parsed.data.step_order !== undefined){ fields.push('step_order = ?'); values.push(parsed.data.step_order); }
  if (parsed.data.is_done !== undefined)   {
    fields.push('is_done = ?'); values.push(parsed.data.is_done ? 1 : 0);
    fields.push('done_at = ?');  values.push(parsed.data.is_done ? new Date() : null);
    fields.push('done_by = ?');  values.push(parsed.data.is_done ? req.user.sub : null);
  }
  if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
  values.push(req.params.stepId);
  const result = await query(
    `UPDATE reduction_plan_steps SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Paso no encontrado' });
  const step = await one('SELECT * FROM reduction_plan_steps WHERE id = ?', [req.params.stepId]);
  res.json({ step });
});

router.delete('/steps/:stepId', requireRole('admin'), async (req, res) => {
  const result = await query('DELETE FROM reduction_plan_steps WHERE id = ?', [req.params.stepId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Paso no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
