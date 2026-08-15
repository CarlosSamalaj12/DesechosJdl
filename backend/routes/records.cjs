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

const { isoDay, addDays, parseLocal, asyncHandler } = require('../utils.cjs');

const xmlEsc = (v) => String(v)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const bordersXml = (weight = 1) => ['Top', 'Bottom', 'Left', 'Right']
  .map((pos) => `<Border ss:Position="${pos}" ss:LineStyle="Continuous" ss:Weight="${weight}"/>`)
  .join('');

function styleXml(id, { font = '', interior = '', format = '', align = '' } = {}) {
  return `<Style ss:ID="${id}">
    ${align ? `<Alignment ${align}/>` : ''}
    ${font ? `<Font ss:FontName="Calibri" ${font}/>` : ''}
    ${format ? `<NumberFormat ss:Format="${format}"/>` : ''}
    ${interior ? `<Interior ${interior} ss:Pattern="Solid"/>` : ''}
    <Borders>${bordersXml()}</Borders>
  </Style>`;
}

const STYLES_XML = `<Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  ${styleXml('Title', { font: 'ss:Size="16" ss:Bold="1" ss:Color="#10B981"' })}
  ${styleXml('Sub', { font: 'ss:Size="10" ss:Italic="1" ss:Color="#6B7280"' })}
  ${styleXml('Section', { font: 'ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"', interior: 'ss:Color="#10B981"' })}
  ${styleXml('Header', { font: 'ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"', interior: 'ss:Color="#0E8A6D"', align: 'ss:Horizontal="Center" ss:Vertical="Center"' })}
  ${styleXml('Cell')}
  ${styleXml('CellNum', { format: '0.00' })}
  ${styleXml('CellPct', { format: '0.0&quot;%&quot;' })}
  ${styleXml('CellNum3', { format: '0.000' })}
  ${styleXml('Total', { font: 'ss:Size="11" ss:Bold="1"', interior: 'ss:Color="#E5F5EE"' })}
  ${styleXml('TotalNum', { font: 'ss:Size="11" ss:Bold="1"', interior: 'ss:Color="#E5F5EE"', format: '0.00' })}
  ${styleXml('TotalPct', { font: 'ss:Size="11" ss:Bold="1"', interior: 'ss:Color="#E5F5EE"', format: '0.0&quot;%&quot;' })}
</Styles>`;

function buildXlsReport({ displayRange, totalPounds, recordCount, daysWith, totalDays, people, lbPersona, areaRows, rows }) {
  const cell = (value, styleId) => {
    const isNum = typeof value === 'number' && Number.isFinite(value);
    return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ''}><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEsc(value)}</Data></Cell>`;
  };

  const resumen = [];
  resumen.push(`<Row ss:Height="30">${cell('Reporte de Desperdicios', 'Title')}</Row>`);
  resumen.push(`<Row ss:Height="16">${cell(`Período: ${displayRange}   ·   Generado: ${isoDay(new Date())}`, 'Sub')}</Row>`);
  resumen.push('<Row ss:Height="10"/>');

  resumen.push(`<Row>${cell('RESUMEN GENERAL', 'Section')}</Row>`);
  const general = [
    ['Libras totales', totalPounds, 'CellNum'],
    ['Registros', recordCount, 'Cell'],
    ['Días con datos', `${daysWith}${totalDays ? ` de ${totalDays}` : ''}`, 'Cell'],
    ['Personas en el período', people, 'Cell'],
    ['lb / persona', lbPersona, 'CellNum3'],
  ];
  for (const [label, value, style] of general) {
    resumen.push(`<Row>${cell(label, 'Cell')}${cell(value, style)}</Row>`);
  }
  resumen.push('<Row ss:Height="10"/>');

  resumen.push(`<Row>${cell('RESUMEN POR ÁREA', 'Section')}</Row>`);
  resumen.push(`<Row>${cell('Área', 'Header')}${cell('Libras', 'Header')}${cell('% del total', 'Header')}${cell('lb / persona', 'Header')}</Row>`);
  for (const a of areaRows) {
    resumen.push(
      `<Row>${cell(a.area, 'Cell')}${cell(a.pounds, 'CellNum')}${cell(a.pct, 'CellPct')}${cell(people > 0 ? a.pounds / people : 0, 'CellNum3')}</Row>`,
    );
  }
  resumen.push(
    `<Row>${cell('TOTAL', 'Total')}${cell(totalPounds, 'TotalNum')}${cell(totalPounds > 0 ? 100 : 0, 'TotalPct')}${cell(lbPersona, 'TotalNum')}</Row>`,
  );

  const registros = [];
  registros.push(`<Row>${cell('Fecha', 'Header')}${cell('Área', 'Header')}${cell('Categoría', 'Header')}${cell('Libras', 'Header')}${cell('Notas', 'Header')}${cell('Registrado por', 'Header')}${cell('Creado el', 'Header')}</Row>`);
  for (const r of rows) {
    registros.push(
      `<Row>${cell(String(r.record_date).slice(0, 10), 'Cell')}${cell(r.area, 'Cell')}${cell(r.categoria, 'Cell')}${cell(Number(r.pounds), 'CellNum')}${cell(r.notes || '', 'Cell')}${cell(r.registrado_por || '', 'Cell')}${cell(String(r.created_at).slice(0, 19), 'Cell')}</Row>`,
    );
  }

  const worksheet = (name, widths, rows) =>
    `<Worksheet ss:Name="${xmlEsc(name)}">
  <Table>
    ${widths.map((w) => `<Column ss:Width="${w}"/>`).join('')}
    ${rows.join('\n')}
  </Table>
</Worksheet>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${STYLES_XML}
${worksheet('Resumen', [40, 14, 14, 14], resumen)}
${worksheet('Registros', [12, 18, 18, 10, 30, 18, 18], registros)}
</Workbook>`;
}

// GET /api/records/export?from=&to=&days=&area_id=&category_id=
// Devuelve un reporte Excel (SpreadsheetML) con resumen por área + detalle de registros
router.get('/export/report', asyncHandler(async (req, res) => {
  const today = new Date();
  const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
    ? req.query.to
    : isoDay(today);
  const daysParam = Number(req.query.days);
  const bounded = Boolean(req.query.from || req.query.to || daysParam > 0);
  const from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
    ? req.query.from
    : (daysParam > 0 ? isoDay(addDays(today, -(daysParam - 1))) : '1970-01-01');
  const displayRange = bounded ? `${from} al ${to}` : 'todos los registros';

  const areaIds = (Array.isArray(req.query.area_id) ? req.query.area_id : String(req.query.area_id || '').split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  const params = [from, to];
  let where = 'r.record_date BETWEEN ? AND ?';
  if (areaIds.length) {
    where += ` AND r.area_id IN (${areaIds.map(() => '?').join(', ')})`;
    params.push(...areaIds);
  }
  const categoryIds = (Array.isArray(req.query.category_id) ? req.query.category_id : String(req.query.category_id || '').split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (categoryIds.length) {
    where += ` AND r.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
    params.push(...categoryIds);
  }

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

  const hc = await one(
    'SELECT COALESCE(SUM(people_count), 0) AS people FROM daily_headcount WHERE record_date BETWEEN ? AND ?',
    [from, to],
  );
  const people = Number(hc.people || 0);

  // Resumen por área calculado desde los registros (respeta filtros)
  const byAreaMap = new Map();
  const dates = new Set();
  let total = 0;
  for (const r of rows) {
    const pounds = Number(r.pounds) || 0;
    total += pounds;
    dates.add(String(r.record_date).slice(0, 10));
    const key = r.area || 'Sin área';
    const cur = byAreaMap.get(key) || { area: key, pounds: 0 };
    cur.pounds += pounds;
    byAreaMap.set(key, cur);
  }
  const areaRows = [...byAreaMap.values()]
    .map((a) => ({ ...a, pct: total > 0 ? (a.pounds / total) * 100 : 0 }))
    .sort((a, b) => b.pounds - a.pounds);
  const lbPersona = people > 0 ? total / people : 0;
  const totalDays = bounded
    ? Math.round((parseLocal(to) - parseLocal(from)) / 86400000) + 1
    : dates.size;

  const xls = buildXlsReport({
    displayRange,
    totalPounds: total,
    recordCount: rows.length,
    daysWith: dates.size,
    totalDays,
    people,
    lbPersona,
    areaRows,
    rows,
  });

  const filename = bounded ? `reporte_desperdicios_${from}_${to}.xls` : 'reporte_desperdicios.xls';
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xls);
}));

// GET /api/records?date=YYYY-MM-DD | from=&to=&area_id=&category_id=&limit=
router.get('/', asyncHandler(async (req, res) => {
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

  const areaIds = (Array.isArray(req.query.area_id) ? req.query.area_id : String(req.query.area_id || '').split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (areaIds.length) {
    where.push(`r.area_id IN (${areaIds.map(() => '?').join(', ')})`);
    params.push(...areaIds);
  }
  const categoryIds = (Array.isArray(req.query.category_id) ? req.query.category_id : String(req.query.category_id || '').split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (categoryIds.length) {
    where.push(`r.category_id IN (${categoryIds.map(() => '?').join(', ')})`);
    params.push(...categoryIds);
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
}));

// POST /api/records — upsert de un solo registro (compatibilidad)
router.post('/', asyncHandler(async (req, res) => {
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
}));

// POST /api/records/bulk — upsert de varios en una sola llamada
//   body: { record_date, area_id, items: [{category_id, pounds}, ...] }
router.post('/bulk', asyncHandler(async (req, res) => {
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
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM waste_records WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json({ ok: true });
}));

// PUT /api/records/:id — editar libras / notas de un registro existente
// (admin o el mismo operador que lo creó)
router.put('/:id', asyncHandler(async (req, res) => {
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
}));

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
