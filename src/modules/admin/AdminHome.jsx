// src/modules/admin/AdminHome.jsx — menú principal admin
import { useEffect, useState } from 'react';
import { Layers, Tag, Users, BarChart3, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import './AdminHome.css';

const TILES = [
  { to: '/admin/areas', icon: Layers, title: 'Áreas', desc: 'Restaurante, Cocina, Bar…', color: '#10b981' },
  { to: '/admin/categories', icon: Tag, title: 'Categorías', desc: 'Tipos de desecho a medir', color: '#6366f1' },
  { to: '/admin/headcount', icon: Users, title: 'Headcount histórico', desc: 'Personas por día', color: '#0891b2' },
];

export default function AdminHome() {
  const [counts, setCounts] = useState({ areas: 0, categories: 0, headcount: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/api/areas').catch(() => ({ areas: [] })),
      api.get('/api/categories').catch(() => ({ categories: [] })),
      api.get('/api/headcount?limit=365').catch(() => ({ headcounts: [] })),
    ]).then(([a, c, h]) => {
      setCounts({
        areas: (a.areas || []).filter((x) => x.is_active).length,
        categories: (c.categories || []).filter((x) => x.is_active).length,
        headcount: (h.headcounts || []).length,
      });
    });
  }, []);

  return (
    <div className="admin-home">
      <div className="admin-home-hero">
        <BarChart3 size={32} />
        <h1>Panel de administración</h1>
        <p>Configurá el sistema y revisá los datos.</p>
      </div>

      <div className="admin-home-tiles">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="admin-tile" style={{ '--tile-color': t.color }}>
            <div className="admin-tile-icon"><t.icon size={22} /></div>
            <div className="admin-tile-text">
              <strong>{t.title}</strong>
              <span>{t.desc}</span>
            </div>
            <ArrowRight size={18} className="admin-tile-arrow" />
          </Link>
        ))}
      </div>

      <div className="admin-home-stats">
        <div className="stat-card">
          <span>Áreas activas</span>
          <strong>{counts.areas}</strong>
        </div>
        <div className="stat-card">
          <span>Categorías activas</span>
          <strong>{counts.categories}</strong>
        </div>
        <div className="stat-card">
          <span>Días con headcount</span>
          <strong>{counts.headcount}</strong>
        </div>
      </div>
    </div>
  );
}
