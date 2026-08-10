// src/shared/BottomNav.jsx
import { NavLink } from 'react-router-dom';
import './BottomNav.css';

export default function BottomNav({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
        >
          <it.icon size={22} strokeWidth={2} />
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
