// src/api/client.js
const TOKEN_KEY = 'jdl_waste_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Error de red (backend apagado, sin conexión, etc.)
    const err = new Error('No se pudo conectar con el servidor. Verificá que el sistema esté encendido.');
    err.status = 0;
    err.network = true;
    throw err;
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  // Token inválido o expirado (401) en endpoints protegidos:
  // limpiamos la sesión y avisamos para redirigir al login.
  // NO tocamos /api/auth/* porque ahí el 401 es un error normal
  // (credenciales incorrectas, sesión inexistente) que maneja cada pantalla.
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    setToken(null);
    window.dispatchEvent(new Event('jdl:unauthorized'));
  }

  if (!res.ok) {
    // Para 5xx mostramos un mensaje genérico (evita filtrar detalles técnicos)
    const message = res.status >= 500
      ? 'Error del servidor. Intentá de nuevo en unos segundos.'
      : ((data && data.error) || `Error ${res.status}`);
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:    (path)        => request('GET', path),
  post:   (path, body)  => request('POST', path, body),
  put:    (path, body)  => request('PUT', path, body),
  del:    (path)        => request('DELETE', path),
};
