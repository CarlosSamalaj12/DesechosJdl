// backend/routes/dashboard.cjs — KPIs y analítica
const express = require('express');
const { query, one } = require('../db.cjs');
const { requireAuth } = require('../auth.cjs');

const router = express.Router();
router.use(requireAuth);

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const { isoDay, addDays, parseLocal, todayLocal } = require('../utils.cjs');
const daysBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / 86400000) + 1;

// Acepta ?area_id=1&area_id=2 o ?area_id=1,2 (repetidos o separados por coma)
function parseIds(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  return list.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}

function parseRange(req) {
  const today = new Date();
  const to = req.query.to && dateOnly.test(req.query.to) ? req.query.to : isoDay(today);
  // Soporta ?days=N como atajo
  const daysParam = req.query.days ? Number(req.query.days) : null;
  const defaultFrom = daysParam
    ? isoDay(addDays(today, -(daysParam - 1)))
    : isoDay(addDays(today, -29));
  const from = req.query.from && dateOnly.test(req.query.from) ? req.query.from : defaultFrom;
  const areaIds = parseIds(req.query.area_id);
  const categoryIds = parseIds(req.query.category_id);
  return { from, to, areaIds, categoryIds, days: daysBetween(from, to) };
}

function recordWhere({ areaIds, categoryIds }) {
  const parts = ['r.record_date BETWEEN ? AND ?'];
  const params = [];
  if (areaIds && areaIds.length) {
    parts.push(`r.area_id IN (${areaIds.map(() => '?').join(', ')})`);
    params.push(...areaIds);
  }
  if (categoryIds && categoryIds.length) {
    parts.push(`r.category_id IN (${categoryIds.map(() => '?').join(', ')})`);
    params.push(...categoryIds);
  }
  return { sql: parts.join(' AND '), params };
}

// ── SUMMARY (KPIs) ─────────────────────────────
router.get('/summary', async (req, res) => {
  const { from, to, areaIds, categoryIds, days } = parseRange(req);
  const { sql: filtSql, params: filtParams } = recordWhere({ areaIds, categoryIds });

  // Rango anterior equivalente (mismo largo, hacia atrás)
  const prevFrom = isoDay(addDays(parseLocal(from), -days));
  const prevTo = isoDay(addDays(parseLocal(to), -days));

  // Total pounds en rango actual
  const total = await one(
    `SELECT COALESCE(SUM(pounds), 0) AS pounds, COUNT(DISTINCT record_date) AS days
     FROM waste_records r WHERE ${filtSql}`,
    [from, to, ...filtParams],
  );

  // Total pounds en rango anterior
  const prevParams = [prevFrom, prevTo];
  let prevWhere = '';
  if (areaIds.length) {
    prevWhere += ` AND r.area_id IN (${areaIds.map(() => '?').join(', ')})`;
    prevParams.push(...areaIds);
  }
  if (categoryIds.length) {
    prevWhere += ` AND r.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
    prevParams.push(...categoryIds);
  }
  const prevTotal = await one(
    `SELECT COALESCE(SUM(pounds), 0) AS pounds
     FROM waste_records r WHERE r.record_date BETWEEN ? AND ?${prevWhere}`,
    prevParams,
  );

  // Headcount del rango
  const hc = await one(
    `SELECT COALESCE(SUM(people_count), 0) AS people, COUNT(*) AS days
     FROM daily_headcount WHERE record_date BETWEEN ? AND ?`,
    [from, to],
  );

  // Top área
  const areaFilterSql = areaIds.length ? `WHERE a.id IN (${areaIds.map(() => '?').join(', ')})` : '';
  const topArea = await one(
    `SELECT a.id, a.name, a.color, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_areas a
     LEFT JOIN waste_records r
       ON r.area_id = a.id AND r.record_date BETWEEN ? AND ?
     ${areaFilterSql}
     GROUP BY a.id ORDER BY pounds DESC LIMIT 1`,
    [from, to, ...areaIds],
  );

  // Top categoría
  const catFilterSql = categoryIds.length ? `WHERE c.id IN (${categoryIds.map(() => '?').join(', ')})` : '';
  const topCat = await one(
    `SELECT c.id, c.name, c.color, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_categories c
     LEFT JOIN waste_records r
       ON r.category_id = c.id AND r.record_date BETWEEN ? AND ?
     ${catFilterSql}
     GROUP BY c.id ORDER BY pounds DESC LIMIT 1`,
    [from, to, ...categoryIds],
  );

  const pounds = Number(total.pounds || 0);
  const poundsPrev = Number(prevTotal.pounds || 0);
  const people = Number(hc.people || 0);
  const lbPersona = people > 0 ? pounds / people : 0;
  const lbPersonaPrev = poundsPrev > 0 && people > 0 ? poundsPrev / people : 0;
  // Variación: si no hay período anterior comparable, 0
  const variationPct = poundsPrev > 0 ? ((pounds - poundsPrev) / poundsPrev) * 100 : 0;
  const coveragePct = days > 0 ? (Number(total.days) / days) * 100 : 0;

  res.json({
    range: { from, to, days },
    kpis: {
      total_pounds: pounds,
      headcount: people,
      lb_persona: lbPersona,
      lb_persona_prev: lbPersonaPrev,
      variation_pct: variationPct,
      days_with_records: Number(total.days || 0),
      total_days: days,
      coverage_pct: coveragePct,
      top_area: topArea && Number(topArea.pounds) > 0 ? topArea : null,
      top_category: topCat && Number(topCat.pounds) > 0 ? topCat : null,
    },
  });
});

// ── TREND (serie diaria) ────────────────────────
router.get('/trend', async (req, res) => {
  const { from, to, areaIds, categoryIds, days } = parseRange(req);
  // Limitar a 365 días
  const cappedDays = Math.min(days, 365);
  const realTo = isoDay(addDays(parseLocal(from), cappedDays - 1));

  const params = [from, realTo];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaIds.length) {
    where += ` AND r.area_id IN (${areaIds.map(() => '?').join(', ')})`;
    params.push(...areaIds);
  }
  if (categoryIds.length) {
    where += ` AND r.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
    params.push(...categoryIds);
  }

  const records = await query(
    `SELECT record_date, SUM(pounds) AS pounds
     FROM waste_records r WHERE ${where}
     GROUP BY record_date ORDER BY record_date`,
    params,
  );

  const headcounts = await query(
    `SELECT record_date, people_count FROM daily_headcount
     WHERE record_date BETWEEN ? AND ? ORDER BY record_date`,
    [from, realTo],
  );

  // Construir serie completa (incluye días sin datos)
  const byDate = new Map();
  for (const r of records) {
    byDate.set(String(r.record_date).slice(0, 10), Number(r.pounds));
  }
  const hcByDate = new Map();
  for (const h of headcounts) {
    hcByDate.set(String(h.record_date).slice(0, 10), Number(h.people_count));
  }

  const series = [];
  const start = parseLocal(from);
  for (let i = 0; i < cappedDays; i++) {
    const d = isoDay(addDays(start, i));
    const pounds = byDate.get(d) || 0;
    const people = hcByDate.get(d) || 0;
    series.push({
      date: d,
      pounds,
      people,
      lb_persona: people > 0 ? pounds / people : 0,
    });
  }

  res.json({ range: { from, to: realTo, days: cappedDays }, series });
});

// ── COVERAGE (quién registró hoy) ──────────────
// GET /api/dashboard/coverage?date=YYYY-MM-DD (por defecto: hoy)
// Devuelve por área si tiene registros en esa fecha.
router.get('/coverage', async (req, res) => {
  const date = req.query.date && dateOnly.test(req.query.date) ? req.query.date : todayLocal();
  const areas = await query(
    `SELECT a.id, a.name, a.color,
            EXISTS(SELECT 1 FROM waste_records r
                   WHERE r.area_id = a.id AND r.record_date = ?) AS has_data
     FROM waste_areas a
     WHERE a.is_active = 1
     ORDER BY a.sort_order ASC, a.name ASC`,
    [date],
  );
  res.json({
    date,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      has_data: Boolean(a.has_data),
    })),
  });
});

// ── BY AREA ────────────────────────────────────
router.get('/by-area', async (req, res) => {
  const { from, to, areaIds } = parseRange(req);
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaIds.length) {
    where += ` AND r.area_id IN (${areaIds.map(() => '?').join(', ')})`;
    params.push(...areaIds);
  }

  const hcTotal = await one(
    'SELECT COALESCE(SUM(people_count), 0) AS people FROM daily_headcount WHERE record_date BETWEEN ? AND ?',
    [from, to],
  );
  const people = Number(hcTotal.people || 0);

  const rows = await query(
    `SELECT a.id, a.name, a.color, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_areas a
     LEFT JOIN waste_records r
       ON r.area_id = a.id AND ${where}
     WHERE a.is_active = 1
     GROUP BY a.id
     ORDER BY pounds DESC`,
    params,
  );

  res.json({
    range: { from, to },
    headcount: people,
    areas: rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      pounds: Number(r.pounds),
      lb_persona: people > 0 ? Number(r.pounds) / people : 0,
    })),
  });
});

// ── BY CATEGORY ────────────────────────────────
router.get('/by-category', async (req, res) => {
  const { from, to, areaIds, categoryIds } = parseRange(req);
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaIds.length) {
    where += ` AND r.area_id IN (${areaIds.map(() => '?').join(', ')})`;
    params.push(...areaIds);
  }
  if (categoryIds.length) {
    where += ` AND r.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
    params.push(...categoryIds);
  }

  const rows = await query(
    `SELECT c.id, c.name, c.color, c.icon, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_categories c
     LEFT JOIN waste_records r
       ON r.category_id = c.id AND ${where}
     WHERE c.is_active = 1
     GROUP BY c.id
     ORDER BY pounds DESC`,
    params,
  );

  const total = rows.reduce((s, r) => s + Number(r.pounds), 0);
  res.json({
    range: { from, to },
    total_pounds: total,
    categories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      pounds: Number(r.pounds),
      pct: total > 0 ? (Number(r.pounds) / total) * 100 : 0,
    })),
  });
});

module.exports = router;
