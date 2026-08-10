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

module.exports = { normalizeBigInts, asyncHandler };
