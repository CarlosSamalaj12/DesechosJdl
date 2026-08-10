// src/modules/admin/PlanFormModal.jsx
import { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost } from '../../shared/Buttons.jsx';
import { todayStr } from '../../utils/format.js';

const empty = {
  title: '',
  description: '',
  area_id: null,
  category_id: null,
  start_date: todayStr(),
  end_date: '',
  target_pct: '',
  target_lb_person: '',
  status: 'active',
  responsible_id: null,
};

export default function PlanFormModal({ plan, onClose, onSaved }) {
  const isEdit = !!plan;
  const [form, setForm] = useState(() => {
    if (!plan) return empty;
    return {
      title: plan.title || '',
      description: plan.description || '',
      area_id: plan.area_id || null,
      category_id: plan.category_id || null,
      start_date: String(plan.start_date).slice(0, 10),
      end_date: String(plan.end_date).slice(0, 10),
      target_pct: plan.target_pct || '',
      target_lb_person: plan.target_lb_person || '',
      status: plan.status || 'active',
      responsible_id: plan.responsible_id || null,
    };
  });
  const [areas, setAreas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState(plan?.steps?.map((s) => s.title) || ['']);
  const [stepInput, setStepInput] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/areas'),
      api.get('/api/categories'),
      api.get('/api/users'),
    ]).then(([a, c, u]) => {
      setAreas(a.areas || []);
      setCategories(c.categories || []);
      setUsers((u.users || []).filter((x) => x.is_active));
    });
  }, []);

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function addStepTitle() {
    const t = stepInput.trim();
    if (!t) return;
    setSteps((s) => [...s.filter((x) => x.trim()), t]);
    setStepInput('');
  }

  function removeStepTitle(i) {
    setSteps((s) => s.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!form.title.trim()) { toast.error('Título requerido'); return; }
    if (!form.start_date || !form.end_date) { toast.error('Fechas requeridas'); return; }
    if (form.end_date < form.start_date) { toast.error('Fecha fin debe ser posterior a inicio'); return; }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        area_id: form.area_id || null,
        category_id: form.category_id || null,
        start_date: form.start_date,
        end_date: form.end_date,
        target_pct: form.target_pct === '' ? null : Number(form.target_pct),
        target_lb_person: form.target_lb_person === '' ? null : Number(form.target_lb_person),
        status: form.status,
        responsible_id: form.responsible_id || null,
      };

      let planId;
      if (isEdit) {
        await api.put(`/api/plans/${plan.id}`, payload);
        planId = plan.id;
      } else {
        const res = await api.post('/api/plans', payload);
        planId = res.plan.id;
        // Crear steps (solo en creación, los del edit se gestionan en detalle)
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].trim()) {
            await api.post(`/api/plans/${planId}/steps`, { title: steps[i].trim(), step_order: i + 1 });
          }
        }
      }
      toast.success(isEdit ? 'Plan actualizado' : 'Plan creado');
      onSaved(planId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Editar plan' : 'Nuevo plan de reducción'}
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancelar</BtnGhost>
          <BtnPrimary onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Título *</span>
          <input
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            placeholder="Reducir plástico 30% en Restaurante"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Descripción</span>
          <textarea
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Acciones concretas, motivación, responsable…"
            rows={3}
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Área objetivo</span>
            <select
              value={form.area_id || ''}
              onChange={(e) => setField('area_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Categoría objetivo</span>
            <select
              value={form.category_id || ''}
              onChange={(e) => setField('category_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Inicio *</span>
            <input type="date" value={form.start_date} onChange={(e) => setField('start_date', e.target.value)} />
          </label>
          <label className="field">
            <span>Fin *</span>
            <input type="date" value={form.end_date} onChange={(e) => setField('end_date', e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Meta: reducción %</span>
            <input
              type="number" min="0" max="100" step="0.1"
              value={form.target_pct}
              onChange={(e) => setField('target_pct', e.target.value)}
              placeholder="ej: 30"
            />
          </label>
          <label className="field">
            <span>Meta: lb/persona</span>
            <input
              type="number" min="0" step="0.01"
              value={form.target_lb_person}
              onChange={(e) => setField('target_lb_person', e.target.value)}
              placeholder="ej: 0.35"
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Responsable</span>
            <select
              value={form.responsible_id || ''}
              onChange={(e) => setField('responsible_id', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin asignar</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Estado</span>
            <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
              <option value="active">Activo</option>
              <option value="completed">Cumplido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>

        {!isEdit && (
          <div className="field">
            <span>Pasos del plan (opcional, podés agregarlos después)</span>
            {steps.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {steps.filter((s) => s.trim()).map((s, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{i + 1}. {s}</span>
                    <button type="button" className="icon-btn" onClick={() => removeStepTitle(i)} aria-label="Quitar">
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
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStepTitle(); } }}
                placeholder="Ej: Cambiar a vasos reutilizables"
              />
              <BtnPrimary type="button" onClick={addStepTitle}>+</BtnPrimary>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
