// backend/migrate_user_area.cjs — agrega area_id a users (idempotente)
const { query, one } = require('./db.cjs');

async function main() {
  console.log('🔧 Migración: agregar area_id a users…');

  // 1) Columna (idempotente en MariaDB)
  try {
    await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS area_id INT NULL');
    console.log('   ✓ columna area_id lista');
  } catch (err) {
    console.log('   (columna ya existe o error:', err.code, ')');
  }

  // 2) FK (chequeamos antes para que sea idempotente)
  const fk = await one(
    `SELECT 1 AS x FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND CONSTRAINT_NAME = 'fk_user_area'
     LIMIT 1`,
  );
  if (!fk) {
    await query(
      'ALTER TABLE users ADD CONSTRAINT fk_user_area FOREIGN KEY (area_id) REFERENCES waste_areas(id)',
    );
    console.log('   ✓ FK fk_user_area creada');
  } else {
    console.log('   (FK fk_user_area ya existe)');
  }

  console.log('✅ Migración completa');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
  });
