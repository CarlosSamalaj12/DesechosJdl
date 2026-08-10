// src/modules/admin/Plans.jsx — lista de planes de reducción
import { useEffect, useState } from 'react';
import {
  Plus, Target, ChevronRight, CheckCircle2, Clock, XCircle, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost, BtnDanger } from '../../shared/Buttons.jsx';
import { fmtDate, fmtDateShort } from '../../utils/format.js';
import PlanFormModal from './PlanFormModal.jsx';
import PlanDetailModal from './PlanDetailModal.jsx';
import './Plans.css';

const STATUS_META = {
  active:    { icon: Clock,        label: 'Activo',     color: '#10b981' },
  completed: { icon: CheckCircle2, label: 'Cumplido',   color: '#3b82f6' },
  expired:   { icon: AlertCircle,  label: 'Vencido',    color: '#f59e0b' },
  cancelled: { icon: XCircle,      label: 'Cancelado',  color: '#94a3b8' },
};

const FILTERS = [
  { id: '',         label: 'Todos' },
  { id: 'active',   label: 'Activos' },
  { id: 'completed',label: 'Cumplidos' },
  { id: 'expired',  label: 'Vencidos' },
];

export default function Plans() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : '';
      const { plans } = await api.get(`/api/plans${qs}`);
      setItems(plans);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <div className="plans-page">
      <div className="plans-header">
        <h2><Target size={18} /> Planes de reducción</h2>
        <BtnPrimary onClick={() => setCreating(true)}><Plus size={16} /> Nuevo</BtnPrimary>
      </div>

      <div className="range-chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`range-chip${filter === f.id ? ' active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Target size={48} />
          <h2>Sin planes</h2>
          <p>Creá el primer plan de reducción y definí los pasos para cumplirlo.</p>
          <BtnPrimary onClick={() => setCreating(true)}><Plus size={16} /> Crear primer plan</BtnPrimary>
        </div>
      ) : (
        <ul className="plan-list">
          {items.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.active;
            const Icon = meta.icon;
            const pct = p.steps_total > 0 ? Math.round((p.steps_done / p.steps_total) * 100) : 0;
            return (
              <li
                key={p.id}
                className="plan-card"
                style={{ '--plan-color': p.area_color || meta.color }}
                onClick={() => setSelected(p.id)}
              >
                <div className="plan-card-top">
                  <span className="plan-status" style={{ color: meta.color }}>
                    <Icon size={12} /> {meta.label}
                  </span>
                  {p.target_pct && (
                    <span className="plan-target">-{p.target_pct}% meta</span>
                  )}
                </div>
                <h3>{p.title}</h3>
                <p className="muted plan-meta">
                  {p.area_name || 'Todas las áreas'}
                  {p.category_name ? ` · ${p.category_name}` : ''}
                </p>
                <p className="muted plan-dates">
                  {fmtDateShort(p.start_date)} → {fmtDateShort(p.end_date)}
                  {p.responsible_name ? ` · ${p.responsible_name}` : ''}
                </p>
                {p.steps_total > 0 && (
                  <div className="plan-progress">
                    <div className="plan-progress-bar">
                      <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <small>{p.steps_done} / {p.steps_total} pasos</small>
                  </div>
                )}
                <ChevronRight size={18} className="plan-chevron" />
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <PlanFormModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {selected && (
        <PlanDetailModal
          planId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
