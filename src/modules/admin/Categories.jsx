// src/modules/admin/Categories.jsx — CRUD categorías
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost } from '../../shared/Buttons.jsx';
import './AdminLists.css';

const empty = {
  name: '',
  color: '#6366f1',
  icon: 'package',
  is_active: true,
  sort_order: 0,
};

const ICON_OPTIONS = [
  { name: 'leaf',           label: 'Orgánico' },
  { name: 'package',        label: 'Plástico' },
  { name: 'box',            label: 'Cartón' },
  { name: 'wine',           label: 'Vidrio' },
  { name: 'file-text',      label: 'Papel' },
  { name: 'alert-triangle', label: 'Loza' },
  { name: 'alert-octagon',  label: 'Cristalería' },
  { name: 'trash-2',        label: 'General' },
  { name: 'coffee',         label: 'Café' },
  { name: 'flame',          label: 'Calor' },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { categories } = await api.get('/api/categories');
      setCategories(categories);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setForm({ ...empty, sort_order: categories.length + 1 });
    setEditing('new');
  }

  function openEdit(c) {
    setForm({ ...empty, ...c });
    setEditing(c);
  }

  function close() { setEditing(null); setForm(empty); }

  async function save() {
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/api/categories', form);
        toast.success('Categoría creada');
      } else {
        await api.put(`/api/categories/${editing.id}`, form);
        toast.success('Categoría actualizada');
      }
      close();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c) {
    if (!confirm(`¿Eliminar "${c.name}"?`)) return;
    try {
      await api.del(`/api/categories/${c.id}`);
      toast.success('Categoría eliminada');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="admin-list">
      <div className="admin-list-header">
        <h2><Tag size={18} /> Categorías</h2>
        <BtnPrimary onClick={openNew}><Plus size={16} /> Nueva</BtnPrimary>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <ul className="admin-cards">
          {categories.map((c) => (
            <li key={c.id} className="admin-card" style={{ borderLeft: `5px solid ${c.color}` }}>
              <div className="admin-card-main">
                <strong>{c.name}</strong>
                <small className="muted">Icono: {c.icon || 'sin icono'}</small>
                {!c.is_active && <small className="badge-off">inactiva</small>}
              </div>
              <div className="admin-card-actions">
                <button className="icon-btn" onClick={() => openEdit(c)}><Edit2 size={16} /></button>
                <button className="icon-btn icon-btn-danger" onClick={() => remove(c)}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}
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
              placeholder="Ej: Vidrio / Botellas"
              autoFocus
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
                  key={ic.name}
                  type="button"
                  className={`icon-pick${form.icon === ic.name ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, icon: ic.name })}
                >
                  {ic.label}
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
            <span>Activa</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
