// backend/routes/dashboard.cjs — KPIs y analítica
const express = require('express');
const { query, one } = require('../db.cjs');
const { requireAuth } = require('../auth.cjs');

const router = express.Router();
router.use(requireAuth);

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

function parseRange(req) {
  const today = new Date();
  const to = req.query.to && dateOnly.test(req.query.to) ? req.query.to : isoDay(today);
  // Soporta ?days=N como atajo
  const daysParam = req.query.days ? Number(req.query.days) : null;
  const defaultFrom = daysParam
    ? isoDay(addDays(today, -(daysParam - 1)))
    : isoDay(addDays(today, -29));
  const from = req.query.from && dateOnly.test(req.query.from) ? req.query.from : defaultFrom;
  const areaId = req.query.area_id ? Number(req.query.area_id) : null;
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  return { from, to, areaId, categoryId, days: daysBetween(from, to) };
}

function recordWhere({ areaId, categoryId }) {
  const parts = ['r.record_date BETWEEN ? AND ?'];
  const params = [];
  if (areaId) { parts.push('r.area_id = ?'); }
  if (categoryId) { parts.push('r.category_id = ?'); }
  return { sql: parts.join(' AND '), params };
}

// ── SUMMARY (KPIs) ─────────────────────────────
router.get('/summary', async (req, res) => {
  const { from, to, areaId, categoryId, days } = parseRange(req);
  const { sql: filtSql, params: filtParams } = recordWhere({ areaId, categoryId });

  // Rango anterior equivalente (mismo largo, hacia atrás)
  const prevFrom = isoDay(addDays(new Date(from), -days));
  const prevTo = isoDay(addDays(new Date(to), -days));

  // Total pounds en rango actual
  const total = await one(
    `SELECT COALESCE(SUM(pounds), 0) AS pounds, COUNT(DISTINCT record_date) AS days
     FROM waste_records r WHERE ${filtSql}`,
    [from, to, ...filtParams],
  );

  // Total pounds en rango anterior
  const prevTotal = await one(
    `SELECT COALESCE(SUM(pounds), 0) AS pounds
     FROM waste_records r WHERE r.record_date BETWEEN ? AND ? ${areaId ? 'AND r.area_id = ?' : ''} ${categoryId ? 'AND r.category_id = ?' : ''}`,
    [prevFrom, prevTo, ...(areaId ? [areaId] : []), ...(categoryId ? [categoryId] : [])],
  );

  // Headcount del rango
  const hc = await one(
    `SELECT COALESCE(SUM(people_count), 0) AS people, COUNT(*) AS days
     FROM daily_headcount WHERE record_date BETWEEN ? AND ?`,
    [from, to],
  );

  // Top área
  const topArea = await one(
    `SELECT a.id, a.name, a.color, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_areas a
     LEFT JOIN waste_records r
       ON r.area_id = a.id AND r.record_date BETWEEN ? AND ?
     ${areaId ? 'WHERE a.id = ?' : ''}
     GROUP BY a.id ORDER BY pounds DESC LIMIT 1`,
    [from, to, ...(areaId ? [areaId] : [])],
  );

  // Top categoría
  const topCat = await one(
    `SELECT c.id, c.name, c.color, COALESCE(SUM(r.pounds), 0) AS pounds
     FROM waste_categories c
     LEFT JOIN waste_records r
       ON r.category_id = c.id AND r.record_date BETWEEN ? AND ?
     ${categoryId ? 'WHERE c.id = ?' : ''}
     GROUP BY c.id ORDER BY pounds DESC LIMIT 1`,
    [from, to, ...(categoryId ? [categoryId] : [])],
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
  const { from, to, areaId, categoryId, days } = parseRange(req);
  // Limitar a 365 días
  const cappedDays = Math.min(days, 365);
  const realTo = isoDay(addDays(new Date(from), cappedDays - 1));

  const params = [from, realTo];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaId)     { where += ' AND r.area_id = ?';     params.push(areaId); }
  if (categoryId) { where += ' AND r.category_id = ?'; params.push(categoryId); }

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
  const start = new Date(from);
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

// ── BY AREA ────────────────────────────────────
router.get('/by-area', async (req, res) => {
  const { from, to, areaId } = parseRange(req);
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaId) { where += ' AND r.area_id = ?'; params.push(areaId); }

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
  const { from, to, areaId, categoryId } = parseRange(req);
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaId)     { where += ' AND r.area_id = ?';     params.push(areaId); }
  if (categoryId) { where += ' AND r.category_id = ?'; params.push(categoryId); }

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
