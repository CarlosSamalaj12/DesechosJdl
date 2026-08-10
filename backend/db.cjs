// backend/db.js — pool de conexiones MariaDB
const mariadb = require('mariadb');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'desperdicios_jdl',
  connectionLimit: 10,
  dateStrings: true,
  charset: 'utf8mb4',
});

async function query(sql, params = []) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(sql, params);
    return rows;
  } finally {
    if (conn) conn.release();
  }
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { pool, query, one };
