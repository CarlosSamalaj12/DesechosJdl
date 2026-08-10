// backend/seed.cjs — asegura que exista el admin inicial
const { one, query } = require('./db.cjs');
const { hashPassword } = require('./auth.cjs');

async function ensureSeedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@jardinesdellago.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234';
  const fullName = process.env.SEED_ADMIN_NAME || 'Administrador';

  const existing = await one('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing) {
    console.log('👤 Admin seed ya existe:', email);
    return;
  }

  const hash = await hashPassword(password);
  await query(
    'INSERT INTO users (email, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [email, fullName, hash, 'admin'],
  );
  console.log('✅ Admin seed creado:', email, '(cambia la contraseña después de entrar)');
}

module.exports = { ensureSeedAdmin };
