// backend/routes/records.cjs — registros de libras (UPSERT)
const express = require('express');
const { z } = require('zod');
const { query, one } = require('../db.cjs');
const { requireAuth, requireRole } = require('../auth.cjs');

const router = express.Router();
router.use(requireAuth);

const recordSchema = z.object({
  record_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area_id: z.number().int().positive(),
  category_id: z.number().int().positive(),
  pounds: z.number().min(0).max(99999),
  notes: z.string().max(255).optional().nullable(),
});

const bulkUpsertSchema = z.object({
  record_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  area_id: z.number().int().positive(),
  items: z.array(z.object({
    category_id: z.number().int().positive(),
    pounds: z.number().min(0).max(99999),
  })).max(50),
});

const today = () => new Date().toISOString().slice(0, 10);

// GET /api/records/export?from=&to=&area_id=&category_id=
// Devuelve CSV descargable
router.get('/export/csv', async (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to   = req.query.to   || '2999-12-31';
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (req.query.area_id)     { where += ' AND r.area_id = ?';     params.push(Number(req.query.area_id)); }
  if (req.query.category_id) { where += ' AND r.category_id = ?'; params.push(Number(req.query.category_id)); }

  const rows = await query(
    `SELECT r.record_date, a.name AS area, c.name AS categoria, r.pounds, r.notes,
            u.full_name AS registrado_por, r.created_at
     FROM waste_records r
     JOIN waste_areas a ON a.id = r.area_id
     JOIN waste_categories c ON c.id = r.category_id
     LEFT JOIN users u ON u.id = r.recorded_by
     WHERE ${where}
     ORDER BY r.record_date DESC, a.name, c.name`,
    params,
  );

  // CSV escaping
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = ['fecha', 'area', 'categoria', 'libras', 'notas', 'registrado_por', 'created_at'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      String(r.record_date).slice(0, 10),
      r.area,
      r.categoria,
      Number(r.pounds).toFixed(2),
      r.notes,
      r.registrado_por,
      String(r.created_at).slice(0, 19),
    ].map(esc).join(','));
  }

  // BOM para que Excel reconozca UTF-8 con acentos
  const csv = '\uFEFF' + lines.join('\r\n');
  const filename = `desperdicios_${from}_${to}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// GET /api/records?date=YYYY-MM-DD | from=&to=&area_id=&category_id=&limit=
router.get('/', async (req, res) => {
  const params = [];
  const where = [];

  // date exacto (compatibilidad hacia atrás)
  if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    where.push('r.record_date = ?');
    params.push(req.query.date);
  } else {
    // rango
    if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      where.push('r.record_date >= ?');
      params.push(req.query.from);
    }
    if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      where.push('r.record_date <= ?');
      params.push(req.query.to);
    }
  }

  if (req.query.area_id) {
    where.push('r.area_id = ?');
    params.push(Number(req.query.area_id));
  }
  if (req.query.category_id) {
    where.push('r.category_id = ?');
    params.push(Number(req.query.category_id));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Number(req.query.limit) || 500, 5000);

  const rows = await query(
    `SELECT r.*, a.name AS area_name, a.color AS area_color,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
            u.full_name AS recorded_by_name
     FROM waste_records r
     JOIN waste_areas a        ON a.id = r.area_id
     JOIN waste_categories c   ON c.id = r.category_id
     LEFT JOIN users u         ON u.id = r.recorded_by
     ${whereSql}
     ORDER BY r.record_date DESC, r.id DESC
     LIMIT ${limit}`,
    params,
  );
  res.json({ records: rows });
});

// POST /api/records — upsert de un solo registro (compatibilidad)
router.post('/', async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const r = parsed.data;
  await upsertOne(r, req.user.sub);
  const saved = await one(
    `SELECT * FROM waste_records
     WHERE record_date=? AND area_id=? AND category_id=?`,
    [r.record_date, r.area_id, r.category_id],
  );
  res.json({ record: saved });
});

// POST /api/records/bulk — upsert de varios en una sola llamada
//   body: { record_date, area_id, items: [{category_id, pounds}, ...] }
router.post('/bulk', async (req, res) => {
  const parsed = bulkUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const { record_date, area_id, items } = parsed.data;

  for (const it of items) {
    if (it.pounds <= 0) continue;
    await upsertOne(
      { record_date, area_id, category_id: it.category_id, pounds: it.pounds },
      req.user.sub,
    );
  }

  const records = await query(
    `SELECT * FROM waste_records
     WHERE record_date=? AND area_id=?`,
    [record_date, area_id],
  );
  res.json({ records, saved: items.filter(i => i.pounds > 0).length });
});

router.delete('/:id', async (req, res) => {
  const result = await query('DELETE FROM waste_records WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json({ ok: true });
});

// PUT /api/records/:id — editar libras / notas de un registro existente
// (admin o el mismo operador que lo creó)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id inválido' });
  }
  const schema = z.object({
    pounds: z.number().min(0).max(99999),
    notes: z.string().max(255).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const exists = await one('SELECT * FROM waste_records WHERE id = ?', [id]);
  if (!exists) return res.status(404).json({ error: 'Registro no encontrado' });

  // solo admin o el autor original puede editar
  if (req.user.role !== 'admin' && exists.recorded_by !== req.user.sub) {
    return res.status(403).json({ error: 'Sin permiso para editar este registro' });
  }

  const { pounds, notes } = parsed.data;
  await query(
    `UPDATE waste_records
        SET pounds = ?, notes = ?, recorded_by = ?
      WHERE id = ?`,
    [pounds, notes || null, req.user.sub, id],
  );
  const updated = await one(
    `SELECT r.*, a.name AS area_name, a.color AS area_color,
            c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
            u.full_name AS recorded_by_name
       FROM waste_records r
       JOIN waste_areas a        ON a.id = r.area_id
       JOIN waste_categories c   ON c.id = r.category_id
       LEFT JOIN users u         ON u.id = r.recorded_by
      WHERE r.id = ?`,
    [id],
  );
  res.json({ record: updated });
});

async function upsertOne(r, userId) {
  await query(
    `INSERT INTO waste_records (record_date, area_id, category_id, pounds, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pounds = VALUES(pounds),
       notes = VALUES(notes),
       recorded_by = VALUES(recorded_by)`,
    [r.record_date, r.area_id, r.category_id, r.pounds, r.notes || null, userId],
  );
}

module.exports = router;
