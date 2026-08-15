// backend/seed_demo.cjs — popula los últimos 14 días con datos realistas
// (solo para demo; no usar en producción)
const { query, one, pool } = require('./db.cjs');
const { ensureSeedAdmin } = require('./seed.cjs');

const CATS = [
  { id: 1, name: 'Orgánico',          baseMin: 8,  baseMax: 25, weight: 0.9 },
  { id: 2, name: 'Plástico',          baseMin: 2,  baseMax: 8,  weight: 0.7 },
  { id: 3, name: 'Cartón',            baseMin: 3,  baseMax: 12, weight: 0.8 },
  { id: 4, name: 'Vidrio / Botellas', baseMin: 0,  baseMax: 6,  weight: 0.4 },
  { id: 5, name: 'Papel',             baseMin: 1,  baseMax: 4,  weight: 0.5 },
  { id: 6, name: 'Loza quebrada',     baseMin: 0,  baseMax: 2,  weight: 0.2 },
  { id: 7, name: 'Cristalería rota',  baseMin: 0,  baseMax: 1,  weight: 0.1 },
];

const AREAS = [
  { id: 1, mult: 1.0,  name: 'Restaurante' }, // más grande
  { id: 2, mult: 0.7,  name: 'Cocina' },
  { id: 3, mult: 0.4,  name: 'Bar' },
];

const DAYS = 30;
const { isoDay, addDays } = require('./utils.cjs');

const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  await ensureSeedAdmin();
  console.log('🌱 Generando datos demo…');

  // Limpiar registros demo previos (solo los del operador 1 = admin) para no duplicar
  await query('DELETE FROM waste_records WHERE recorded_by = 1');
  await query('DELETE FROM daily_headcount WHERE recorded_by = 1');

  const today = new Date();
  const admin = await one('SELECT id FROM users WHERE email = ?', ['admin@jardinesdellago.com']);

  let totalRecords = 0;
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = isoDay(addDays(today, -i));
    // Headcount varía 80-150, con tendencia creciente leve
    const people = Math.round(rand(85, 145) + (DAYS - i) * 0.4);
    await query(
      `INSERT INTO daily_headcount (record_date, people_count, recorded_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE people_count = VALUES(people_count), recorded_by = VALUES(recorded_by)`,
      [date, people, admin.id],
    );

    for (const area of AREAS) {
      // Algunos días el área no registra (saltamos)
      if (Math.random() < 0.1) continue;

      for (const cat of CATS) {
        // Probabilidad de registrar la categoría
        if (Math.random() > cat.weight) continue;
        const pounds = Math.round(rand(cat.baseMin, cat.baseMax) * area.mult * 100) / 100;
        if (pounds <= 0) continue;
        await query(
          `INSERT INTO waste_records (record_date, area_id, category_id, pounds, recorded_by)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE pounds = VALUES(pounds), recorded_by = VALUES(recorded_by)`,
          [date, area.id, cat.id, pounds, admin.id],
        );
        totalRecords++;
      }
    }
  }

  console.log(`✅ Demo listo: ${totalRecords} registros en ${DAYS} días`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
