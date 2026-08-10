import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles/index.css';

// Endpoint de reset: limpia SW y todos los caches si entrás con ?reset=1
if (window.location.search.includes('reset=1')) {
  (async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations() || [];
      for (const r of regs) await r.unregister();
      const keys = await caches?.keys() || [];
      for (const k of keys) await caches.delete(k);
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) { /* ignore */ }
    window.location.replace('/');
  })();
}

// Limpiar cualquier SW viejo (cache-first agresivo) que rompa el HMR de Vite
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) {
      // Solo desregistramos en dev (donde PROD=false); en prod sí los queremos
      if (!import.meta.env.PROD) {
        r.unregister().catch(() => {});
      }
    }
  });
  if (typeof caches !== 'undefined' && !import.meta.env.PROD) {
    caches.keys().then((keys) => {
      for (const k of keys) {
        if (k.startsWith('jdl-waste-')) caches.delete(k);
      }
    });
  }
}

// Registrar Service Worker solo en PRODUCCIÓN (en dev estorba más que ayuda)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: { fontSize: '14px', borderRadius: '10px' },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
