// backend/db_init.cjs — crea la base y carga el schema
const fs = require('fs');
const path = require('path');
const mariadb = require('mariadb');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'init.sql'),
    'utf8',
  );

  // Conexión SIN database: init.sql hace CREATE DATABASE + USE.
  const conn = await mariadb.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('✅ Base de datos inicializada:', process.env.DB_NAME);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('❌ Error inicializando DB:', err.message);
  process.exit(1);
});
