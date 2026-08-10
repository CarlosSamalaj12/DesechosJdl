// backend/server.cjs — entrypoint
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { normalizeBigInts } = require('./utils.cjs');

const authRoutes = require('./routes/auth.cjs');
const areasRoutes = require('./routes/areas.cjs');
const categoriesRoutes = require('./routes/categories.cjs');
const recordsRoutes = require('./routes/records.cjs');
const headcountRoutes = require('./routes/headcount.cjs');
const usersRoutes = require('./routes/users.cjs');
const dashboardRoutes = require('./routes/dashboard.cjs');
const plansRoutes = require('./routes/plans.cjs');
const { ensureSeedAdmin } = require('./seed.cjs');

const app = express();
const PORT = Number(process.env.PORT) || 5184;

// --- middleware global ---
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Normaliza BigInt -> Number en TODAS las respuestas JSON
// (MariaDB devuelve BIGINT como BigInt; JSON.stringify no los maneja).
app.use((req, res, next) => {
  const original = res.json.bind(res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return original(normalizeBigInts(data));
  };
  next();
});

// --- healthcheck ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'desperdicios-jdl', time: new Date().toISOString() });
});

// --- rutas ---
app.use('/api/auth', authRoutes);
app.use('/api/areas', areasRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/headcount', headcountRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/plans', plansRoutes);

// --- 404 + error handler ---
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada', path: req.path });
});

app.use((err, _req, res, _next) => {
  console.error('🔥 Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

// --- arranque con seed ---
async function start() {
  try {
    await ensureSeedAdmin();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🟢 Backend escuchando en http://127.0.0.1:${PORT}`);
      console.log(`   Health: http://127.0.0.1:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('❌ No se pudo arrancar el backend:', err.message);
    process.exit(1);
  }
}

start();
