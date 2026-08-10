// src/shared/AppLayout.jsx — top header + outlet
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import BottomNav from './BottomNav.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import './AppLayout.css';

export default function AppLayout({ children, navItems }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  // App.jsx siempre pasa el nav correcto según el rol; no lo duplicamos aquí
  const items = navItems || [];

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-greeting">Hola,</p>
          <h1 className="app-name">{user?.full_name}</h1>
        </div>
        <div className="app-header-actions">
          <button className="icon-btn" onClick={() => setPwOpen(true)} title="Cambiar contraseña" aria-label="Cambiar contraseña">
            <KeyRound size={18} />
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Salir" aria-label="Salir">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="app-main">
        {children}
      </main>

      <BottomNav items={items} />
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
