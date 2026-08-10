// src/modules/admin/Areas.jsx — CRUD áreas
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnSecondary, BtnDanger, BtnGhost } from '../../shared/Buttons.jsx';
import './AdminLists.css';

const ICON_OPTIONS = ['utensils', 'chef-hat', 'wine', 'coffee', 'hotel', 'trash-2', 'package', 'droplets', 'flame', 'sandwich'];

const empty = {
  name: '',
  description: '',
  color: '#10b981',
  icon: 'trash-2',
  is_active: true,
  sort_order: 0,
};

export default function Areas() {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // area object or 'new' or null
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { areas } = await api.get('/api/areas');
      setAreas(areas);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setForm({ ...empty, sort_order: areas.length + 1 });
    setEditing('new');
  }

  function openEdit(area) {
    setForm({ ...empty, ...area });
    setEditing(area);
  }

  function close() {
    setEditing(null);
    setForm(empty);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/api/areas', form);
        toast.success('Área creada');
      } else {
        await api.put(`/api/areas/${editing.id}`, form);
        toast.success('Área actualizada');
      }
      close();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(area) {
    if (!confirm(`¿Eliminar "${area.name}"?`)) return;
    try {
      await api.del(`/api/areas/${area.id}`);
      toast.success('Área eliminada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="admin-list">
      <div className="admin-list-header">
        <h2><Layers size={18} /> Áreas</h2>
        <BtnPrimary onClick={openNew}><Plus size={16} /> Nueva</BtnPrimary>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : areas.length === 0 ? (
        <div className="empty-state">
          <Layers size={40} />
          <h2>Sin áreas todavía</h2>
          <p>Creá la primera (ej. Restaurante, Cocina, Bar).</p>
          <BtnPrimary onClick={openNew}><Plus size={16} /> Crear primera área</BtnPrimary>
        </div>
      ) : (
        <ul className="admin-cards">
          {areas.map((a) => (
            <li key={a.id} className="admin-card" style={{ borderLeft: `5px solid ${a.color}` }}>
              <div className="admin-card-main">
                <strong>{a.name}</strong>
                {a.description && <small className="muted">{a.description}</small>}
                {!a.is_active && <small className="badge-off">inactiva</small>}
              </div>
              <div className="admin-card-actions">
                <button className="icon-btn" onClick={() => openEdit(a)} title="Editar"><Edit2 size={16} /></button>
                <button className="icon-btn icon-btn-danger" onClick={() => remove(a)} title="Eliminar"><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nueva área' : 'Editar área'}
        footer={
          <>
            <BtnGhost onClick={close}>Cancelar</BtnGhost>
            <BtnPrimary onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </BtnPrimary>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Nombre *</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Restaurante, Cocina, Bar…"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Descripción</span>
            <input
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Opcional"
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Color</span>
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="color-input"
              />
            </label>
            <label className="field">
              <span>Orden</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="field">
            <span>Icono</span>
            <div className="icon-grid">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={`icon-pick${form.icon === ic ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, icon: ic })}
                >
                  {ic}
                </button>
              ))}
            </div>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Activa (visible para los operadores)</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
