// src/modules/admin/Users.jsx — CRUD usuarios + asignar área
import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Users as UsersIcon, KeyRound, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost, BtnSecondary, BtnDanger } from '../../shared/Buttons.jsx';
import './AdminLists.css';

const empty = {
  email: '',
  full_name: '',
  password: '',
  role: 'operator',
  area_id: null,
};

export default function Users() {
  const [items, setItems] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // user | 'new' | null
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [{ users }, { areas: a }, { user }] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/areas'),
        api.get('/api/auth/me'),
      ]);
      setItems(users);
      setAreas(a);
      setMe(user);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setForm({ ...empty, area_id: areas[0]?.id || null });
    setEditing('new');
  }

  function openEdit(u) {
    setForm({
      email: u.email,
      full_name: u.full_name,
      password: '',
      role: u.role,
      area_id: u.area_id,
    });
    setEditing(u);
  }

  function close() { setEditing(null); setForm(empty); }

  async function save() {
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/api/users', form);
        toast.success('Usuario creado');
      } else {
        const payload = {
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          area_id: form.role === 'operator' ? form.area_id : null,
          is_active: true,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/api/users/${editing.id}`, payload);
        toast.success('Usuario actualizado');
      }
      close();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    try {
      await api.put(`/api/users/${u.id}`, { is_active: !u.is_active });
      toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario reactivado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove(u) {
    if (!confirm(`¿Eliminar a "${u.full_name}"? No tiene registros, así que se borra definitivamente.`)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      toast.success('Usuario eliminado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="admin-list">
      <div className="admin-list-header">
        <h2><UsersIcon size={18} /> Usuarios</h2>
        <BtnPrimary onClick={openNew}><Plus size={16} /> Nuevo</BtnPrimary>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <UsersIcon size={40} />
          <h2>Sin usuarios</h2>
          <p>Creá el primer operador y asignale un área.</p>
        </div>
      ) : (
        <ul className="admin-cards">
          {items.map((u) => (
            <li
              key={u.id}
              className="admin-card"
              style={{ borderLeft: `5px solid ${u.area_color || (u.role === 'admin' ? '#6366f1' : '#94a3b8')}` }}
            >
              <div className="admin-card-main">
                <strong>
                  {u.full_name}
                  {u.id === me?.id && <span className="badge-self"> vos</span>}
                </strong>
                <small className="muted">{u.email}</small>
                <small className="muted">
                  <span className={`role-pill role-${u.role}`}>
                    {u.role === 'admin' ? 'Administrador' : 'Operador'}
                  </span>
                  {u.role === 'operator' && (
                    u.area_name
                      ? <> → <strong style={{ color: 'var(--text)' }}>{u.area_name}</strong></>
                      : <> → sin área</>
                  )}
                  {!u.is_active && <span className="badge-off"> · inactivo</span>}
                </small>
              </div>
              <div className="admin-card-actions">
                <button className="icon-btn" onClick={() => toggleActive(u)} title={u.is_active ? 'Desactivar' : 'Reactivar'}>
                  <Power size={16} />
                </button>
                <button className="icon-btn" onClick={() => openEdit(u)} title="Editar"><Edit2 size={16} /></button>
                {u.id !== me?.id && !u.record_count && (
                  <button className="icon-btn icon-btn-danger" onClick={() => remove(u)} title="Eliminar (sin historial)"><Trash2 size={16} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'}
        footer={
          <>
            <BtnGhost onClick={close}>Cancelar</BtnGhost>
            <BtnPrimary onClick={save} disabled={saving || !form.email.trim() || !form.full_name.trim() || (editing === 'new' && !form.password)}>
              {saving ? 'Guardando…' : 'Guardar'}
            </BtnPrimary>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Nombre completo *</span>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Juan Pérez"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Email *</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="usuario@jardinesdellago.com"
            />
          </label>
          <label className="field">
            <span>
              {editing === 'new' ? 'Contraseña *' : 'Nueva contraseña (opcional)'}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing === 'new' ? 'Mínimo 4 caracteres' : 'Dejar vacío para no cambiar'}
            />
          </label>
          <label className="field">
            <span>Rol</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="operator">Operador (registra desechos)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </label>
          {form.role === 'operator' && (
            <label className="field">
              <span>Área asignada *</span>
              <select
                value={form.area_id || ''}
                onChange={(e) => setForm({ ...form, area_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— sin área —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
