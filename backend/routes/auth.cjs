// backend/routes/auth.cjs
const express = require('express');
const { z } = require('zod');
const { one } = require('../db.cjs');
const { signToken, requireAuth, comparePassword, hashPassword } = require('../auth.cjs');
const { query } = require('../db.cjs');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(4).max(120),
});

const changePwSchema = z.object({
  current_password: z.string().min(1).max(120),
  new_password: z.string().min(4).max(120),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }

  const { email, password } = parsed.data;
  const user = await one(
    'SELECT id, email, full_name, role, area_id, is_active, password_hash FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const ok = await comparePassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      area_id: user.area_id,
    },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await one(
    `SELECT u.id, u.email, u.full_name, u.role, u.area_id, u.is_active, u.created_at,
            a.name AS area_name, a.color AS area_color
     FROM users u
     LEFT JOIN waste_areas a ON a.id = u.area_id
     WHERE u.id = ? LIMIT 1`,
    [req.user.sub],
  );
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
  res.json({ user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const { current_password, new_password } = parsed.data;
  const user = await one(
    'SELECT id, password_hash, is_active FROM users WHERE id = ?',
    [req.user.sub],
  );
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
  const ok = await comparePassword(current_password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
  }
  const hash = await hashPassword(new_password);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
  res.json({ ok: true });
});

module.exports = router;
