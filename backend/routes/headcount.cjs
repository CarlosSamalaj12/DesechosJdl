// backend/routes/headcount.cjs — headcount global del día
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole } = require('../auth.cjs');
const { todayLocal, parseLocal, isoDay } = require('../utils.cjs');

const router = express.Router();
router.use(requireAuth);

const headcountSchema = z.object({
  people_count: z.number().int().min(0).max(100000),
  notes: z.string().max(255).optional().nullable(),
});

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/headcount?from=&to=
router.get('/', async (req, res) => {
  const from = req.query.from;
  const to   = req.query.to;
  let sql = 'SELECT * FROM daily_headcount';
  const params = [];
  const where = [];
  if (from && dateOnly.test(from)) { where.push('record_date >= ?'); params.push(from); }
  if (to   && dateOnly.test(to))   { where.push('record_date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY record_date DESC';
  if (req.query.limit) sql += ' LIMIT ' + Math.min(Number(req.query.limit) || 30, 365);
  const rows = await query(sql, params);
  res.json({ headcounts: rows });
});

// GET /api/headcount/month?year=2026&month=8
// Devuelve todos los headcount de un mes
router.get('/month', async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month); // 1-12
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year y month (1-12) requeridos' });
  }
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const rows = await query(
    'SELECT * FROM daily_headcount WHERE record_date BETWEEN ? AND ? ORDER BY record_date',
    [from, to],
  );
  res.json({ year, month, from, to, headcounts: rows });
});

// POST /api/headcount/bulk (solo admin)
// body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', people_count: N }
// Aplica el mismo people_count a todos los días del rango (upsert)
router.post('/bulk', requireRole('admin'), async (req, res) => {
  const { from, to, people_count, skip_existing } = req.body;
  if (!from || !dateOnly.test(from)) return res.status(400).json({ error: 'from inválido' });
  if (!to   || !dateOnly.test(to))   return res.status(400).json({ error: 'to inválido' });
  if (to < from) return res.status(400).json({ error: 'to debe ser >= from' });
  const n = Number(people_count);
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    return res.status(400).json({ error: 'people_count inválido' });
  }

  // Generar todos los días del rango
  const start = parseLocal(from);
  const end = parseLocal(to);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(isoDay(d));
  }

  let saved = 0;
  let skipped = 0;
  for (const day of days) {
    if (skip_existing) {
      const exists = await one('SELECT id FROM daily_headcount WHERE record_date = ?', [day]);
      if (exists) { skipped++; continue; }
    }
    await query(
      `INSERT INTO daily_headcount (record_date, people_count, recorded_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE people_count = VALUES(people_count), recorded_by = VALUES(recorded_by)`,
      [day, n, req.user.sub],
    );
    saved++;
  }
  res.json({ ok: true, saved, skipped, total: days.length });
});

// GET /api/headcount/today
router.get('/today', async (_req, res) => {
  const today = todayLocal();
  const row = await one(
    'SELECT * FROM daily_headcount WHERE record_date = ?',
    [today],
  );
  res.json({ headcount: row, date: today });
});

// GET /api/headcount/:date
router.get('/:date', async (req, res) => {
  if (!dateOnly.test(req.params.date)) {
    return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
  }
  const row = await one(
    'SELECT * FROM daily_headcount WHERE record_date = ?',
    [req.params.date],
  );
  res.json({ headcount: row, date: req.params.date });
});

// PUT /api/headcount/:date — upsert (solo admin)
router.put('/:date', requireRole('admin'), async (req, res) => {
  if (!dateOnly.test(req.params.date)) {
    return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
  }
  const parsed = headcountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const { people_count, notes } = parsed.data;
  await query(
    `INSERT INTO daily_headcount (record_date, people_count, notes, recorded_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       people_count = VALUES(people_count),
       notes = VALUES(notes),
       recorded_by = VALUES(recorded_by)`,
    [req.params.date, people_count, notes || null, req.user.sub],
  );
  const row = await one('SELECT * FROM daily_headcount WHERE record_date = ?', [req.params.date]);
  res.json({ headcount: row });
});

// DELETE /api/headcount/:date (solo admin)
router.delete('/:date', requireRole('admin'), async (req, res) => {
  if (!dateOnly.test(req.params.date)) {
    return res.status(400).json({ error: 'Fecha inválida' });
  }
  const result = await query(
    'DELETE FROM daily_headcount WHERE record_date = ?',
    [req.params.date],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Sin datos para esa fecha' });
  res.json({ ok: true });
});

module.exports = router;
