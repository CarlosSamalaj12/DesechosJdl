import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hidratar sesión desde token guardado
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const token = getToken();
      if (!token) { setLoading(false); return; }
      try {
        const { user } = await api.get('/api/auth/me');
        if (!cancelled) setUser(user);
      } catch {
        setToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api.post('/api/auth/login', { email, password });
    setToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // 401 global (token expirado): cerrar sesión y avisar.
  // RequireAuth detecta user=null y redirige al login automáticamente.
  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setUser(null);
      toast.error('Tu sesión expiró. Volvé a iniciar sesión.');
    };
    window.addEventListener('jdl:unauthorized', onUnauthorized);
    return () => window.removeEventListener('jdl:unauthorized', onUnauthorized);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
