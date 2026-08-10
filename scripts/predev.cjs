// scripts/predev.cjs — mata cualquier node que ocupe los puertos del dev
// Antes de levantar backend (5184) y Vite (5174), los libera automáticamente.
const { execSync } = require('child_process');

const PORTS = [5184, 5174];

function killOnPort(port) {
  try {
    // netstat -ano | findstr :PORT -> parsea el PID de la última columna
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      // líneas tipo: "  TCP    0.0.0.0:5184    0.0.0.0:0    LISTENING    12345"
      const m = line.match(/\s(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`   ↳ Puerto ${port}: maté PID ${pid}`);
      } catch {}
    }
  } catch {
    // findstr devuelve 1 si no encuentra coincidencias
  }
}

console.log('🧹 predev: liberando puertos…');
for (const p of PORTS) killOnPort(p);
// pequeña pausa para que Windows libere el socket
const end = Date.now() + 1200;
while (Date.now() < end) {} // busy-wait 1.2s
console.log('✅ Listo, arrancando dev…\n');
