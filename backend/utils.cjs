// backend/utils.cjs — helpers
// Convierte BigInt (de MariaDB) a Number para que JSON.stringify no explote.
// Para ids de este sistema entran cómodos en Number.MAX_SAFE_INTEGER.
function normalizeBigInts(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(normalizeBigInts);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = normalizeBigInts(value[k]);
    return out;
  }
  return value;
}

// Wrapper para handlers async de Express: captura cualquier rechazo
// y lo pasa al error handler global. Sin esto, los errores se vuelven
// "unhandled promise rejection" y tiran el proceso en Node 22+.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Fechas en horario LOCAL del servidor ────────────────────────────
// El sistema opera con la fecha del hotel (no UTC): si el backend usara
// toISOString() (UTC), en zonas GMT-5/-6 a partir de las 18-19h locales
// "hoy" se convertiría en "mañana" y los rangos se correrían un día.
// Estas helpers siempre usan el reloj local de la máquina.

// Date -> 'YYYY-MM-DD' en horario local
function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' -> Date local (medianoche local, NO UTC)
function parseLocal(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Fecha de hoy en horario local
function todayLocal() {
  return isoDay(new Date());
}

module.exports = { normalizeBigInts, asyncHandler, isoDay, parseLocal, addDays, todayLocal };
