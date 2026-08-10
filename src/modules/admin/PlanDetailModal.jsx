// src/modules/admin/PlanDetailModal.jsx
import { useEffect, useState } from 'react';
import { Check, X, Plus, Edit2, Trash2, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnDanger, BtnPrimary, BtnGhost, BtnSecondary } from '../../shared/Buttons.jsx';
import { fmtDate, fmtDateShort } from '../../utils/format.js';
import PlanFormModal from './PlanFormModal.jsx';

const STATUS_META = {
  active:    { label: 'Activo',    color: '#10b981' },
  completed: { label: 'Cumplido',  color: '#3b82f6' },
  expired:   { label: 'Vencido',   color: '#f59e0b' },
  cancelled: { label: 'Cancelado', color: '#94a3b8' },
};

export default function PlanDetailModal({ planId, onClose, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [stepInput, setStepInput] = useState('');
  const [addingStep, setAddingStep] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { plan: p } = await api.get(`/api/plans/${planId}`);
      setPlan(p);
    } catch (err) {
      toast.error(err.message);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [planId]);

  async function toggleStep(step) {
    try {
      const { step: updated } = await api.put(`/api/plans/steps/${step.id}`, { is_done: !step.is_done });
      setPlan((p) => ({
        ...p,
        steps: p.steps.map((s) => (s.id === updated.id ? updated : s)),
      }));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addStep() {
    const t = stepInput.trim();
    if (!t) return;
    setAddingStep(true);
    try {
      const { step } = await api.post(`/api/plans/${planId}/steps`, { title: t });
      setPlan((p) => ({ ...p, steps: [...p.steps, step] }));
      setStepInput('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAddingStep(false);
    }
  }

  async function removeStep(step) {
    if (!confirm(`¿Quitar el paso "${step.title}"?`)) return;
    try {
      await api.del(`/api/plans/steps/${step.id}`);
      setPlan((p) => ({ ...p, steps: p.steps.filter((s) => s.id !== step.id) }));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removePlan() {
    if (!confirm(`¿Eliminar el plan "${plan.title}"?`)) return;
    try {
      await api.del(`/api/plans/${planId}`);
      toast.success('Plan eliminado');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading || !plan) {
    return (
      <Modal open onClose={onClose} title="Cargando…">
        <p className="muted">Cargando…</p>
      </Modal>
    );
  }

  const meta = STATUS_META[plan.status] || STATUS_META.active;
  const done = plan.steps.filter((s) => s.is_done).length;
  const total = plan.steps.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={plan.title}
        footer={
          <>
            <BtnDanger onClick={removePlan}><Trash2 size={16} /> Eliminar</BtnDanger>
            <BtnSecondary onClick={() => setEditing(true)}><Edit2 size={16} /> Editar</BtnSecondary>
            <BtnPrimary onClick={onClose}>Listo</BtnPrimary>
          </>
        }
      >
        <div className="plan-detail" style={{ '--plan-color': plan.area_color || meta.color }}>
          <div className="plan-detail-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="plan-status" style={{ color: meta.color }}>{meta.label}</span>
              {plan.target_pct && <span className="plan-target">-{plan.target_pct}% meta</span>}
              {plan.target_lb_person && <span className="plan-target">≤ {plan.target_lb_person} lb/pers</span>}
            </div>
            <div className="plan-detail-meta">
              <span>📍 <strong>{plan.area_name || 'Todas las áreas'}</strong></span>
              {plan.category_name && <span>· {plan.category_name}</span>}
              {plan.responsible_name && <span>· 👤 {plan.responsible_name}</span>}
            </div>
            <div className="plan-detail-meta">
              <span>📅 {fmtDate(plan.start_date)} → {fmtDate(plan.end_date)}</span>
            </div>
          </div>

          {plan.description && <div className="plan-detail-desc">{plan.description}</div>}

          {total > 0 && (
            <div className="plan-detail-progress">
              <div className="plan-progress-bar">
                <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <strong>{pct}%</strong>
              <span className="muted">({done}/{total})</span>
            </div>
          )}

          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '8px 0' }}>
              Pasos
            </h3>
            {total === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Sin pasos todavía. Agregá el primero abajo.</p>
            ) : (
              <ul className="checklist">
                {plan.steps.map((s) => (
                  <li key={s.id} className="checklist-row" style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className={`checklist-item${s.is_done ? ' done' : ''}`}
                      onClick={() => toggleStep(s)}
                    >
                      <span className="checklist-box">
                        {s.is_done && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span style={{ flex: 1 }}>
                        <div className="checklist-text">{s.title}</div>
                        {s.is_done && s.done_by_name && (
                          <div className="checklist-meta">completado por {s.done_by_name}</div>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => removeStep(s)}
                      style={{ alignSelf: 'center' }}
                      title="Quitar paso"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="checklist-add" style={{ marginTop: 8 }}>
              <input
                value={stepInput}
                onChange={(e) => setStepInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
                placeholder="Nuevo paso…"
              />
              <BtnPrimary onClick={addStep} disabled={addingStep || !stepInput.trim()}>
                <Plus size={16} />
              </BtnPrimary>
            </div>
          </div>
        </div>
      </Modal>

      {editing && (
        <PlanFormModal
          plan={plan}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </>
  );
}
