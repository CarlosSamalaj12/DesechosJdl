// src/modules/admin/Records.jsx — tabla completa de registros con filtros
import { useEffect, useState, useMemo } from 'react';
import { ClipboardList, X, Download, Trash2, Pencil, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getToken } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost, BtnDanger } from '../../shared/Buttons.jsx';
import { fmtDate, fmtDateShort, fmtNumber } from '../../utils/format.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import './Records.css';

const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export default function Records() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [areas, setAreas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  // filtros
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [areaId, setAreaId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const filtersActive = from || to || areaId || categoryId;

  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (areaId) p.set('area_id', areaId);
    if (categoryId) p.set('category_id', categoryId);
    p.set('limit', '500');
    return p.toString();
  }, [from, to, areaId, categoryId]);

  async function load() {
    setLoading(true);
    try {
      const [{ areas: a }, { categories: c }, { records: r }] = await Promise.all([
        api.get('/api/areas'),
        api.get('/api/categories'),
        api.get(`/api/records?${queryStr}`),
      ]);
      setAreas(a);
      setCategories(c);
      setRecords(r);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [queryStr]);

  function clearFilters() {
    setFrom(''); setTo(''); setAreaId(''); setCategoryId('');
  }

  function setToday() {
    const t = isoDay(new Date());
    setFrom(t); setTo(t);
  }
  function setThisWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunes
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setFrom(isoDay(monday));
    setTo(isoDay(sunday));
  }
  function setThisMonth() {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setFrom(isoDay(first));
    setTo(isoDay(last));
  }

  async function exportCsv() {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (areaId) p.set('area_id', areaId);
    if (categoryId) p.set('category_id', categoryId);
    const res = await fetch(`/api/records/export/csv?${p}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) { toast.error('Error al exportar'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `desperdicios_${from || 'todo'}_${to || 'todo'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV descargado');
  }

  async function removeRecord(rec) {
    if (!confirm(`¿Borrar registro de ${rec.category_name} (${rec.pounds} lb) del ${fmtDate(rec.record_date)}?`)) return;
    try {
      await api.del(`/api/records/${rec.id}`);
      toast.success('Eliminado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function canEdit(rec) {
    if (!user) return false;
    return user.role === 'admin' || rec.recorded_by === user.id || rec.recorded_by === user.sub;
  }

  // totales filtrados
  const totalPounds = records.reduce((s, r) => s + Number(r.pounds || 0), 0);
  const totalDays = new Set(records.map((r) => String(r.record_date).slice(0, 10))).size;

  return (
    <div className="records-page">
      <div className="records-header">
        <h2><ClipboardList size={18} /> Registros</h2>
        <BtnExport onClick={exportCsv} />
      </div>

      {/* filtros */}
      <div className="records-filters">
        <div className="filter-row">
          <label className="filter-field">
            <span>Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="filter-field">
            <span>Área</span>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Todas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Categoría</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        <div className="filter-presets">
          <button className="preset-btn" onClick={setToday}>
            <Calendar size={12} /> Hoy
          </button>
          <button className="preset-btn" onClick={setThisWeek}>
            Esta semana
          </button>
          <button className="preset-btn" onClick={setThisMonth}>
            Este mes
          </button>
          {filtersActive && (
            <button className="preset-btn clear" onClick={clearFilters}>
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* resumen */}
      {!loading && records.length > 0 && (
        <div className="records-summary">
          <span><strong>{records.length}</strong> registros</span>
          <span>·</span>
          <span><strong>{fmtNumber(totalPounds, 1)}</strong> lb total</span>
          <span>·</span>
          <span><strong>{totalDays}</strong> días</span>
          {totalDays > 0 && (
            <>
              <span>·</span>
              <span><strong>{fmtNumber(totalPounds / totalDays, 2)}</strong> lb/día</span>
            </>
          )}
        </div>
      )}

      {/* tabla */}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <h2>Sin registros</h2>
          <p>No hay datos con los filtros aplicados. Ajustá las fechas o limpia los filtros.</p>
        </div>
      ) : (
        <div className="records-table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Área</th>
                <th>Categoría</th>
                <th className="num">Libras</th>
                <th>Registrado por</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="date-cell" title={fmtDate(r.record_date)}>
                    {fmtDateShort(r.record_date)}
                  </td>
                  <td>
                    <span className="area-tag" style={{ '--tag-color': r.area_color }}>
                      <span className="dot" /> {r.area_name}
                    </span>
                  </td>
                  <td>
                    <span className="cat-tag" style={{ '--tag-color': r.category_color }}>
                      {r.category_name}
                    </span>
                  </td>
                  <td className="num pounds-cell">{fmtNumber(r.pounds)}</td>
                  <td className="muted-cell">{r.recorded_by_name || '—'}</td>
                  <td className="notes-cell">{r.notes || ''}</td>
                  <td className="actions-cell">
                    <div className="row-actions">
                      {canEdit(r) && (
                        <button
                          className="icon-btn"
                          onClick={() => setEditing(r)}
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        className="icon-btn icon-btn-danger"
                        onClick={() => removeRecord(r)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RecordEditModal
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          onDeleted={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function RecordEditModal({ record, onClose, onSaved, onDeleted }) {
  const [pounds, setPounds] = useState(String(record.pounds ?? ''));
  const [notes, setNotes] = useState(record.notes || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const num = Number(pounds);
  const valid = Number.isFinite(num) && num >= 0;

  async function save() {
    if (!valid) { toast.error('Cantidad inválida'); return; }
    setSaving(true);
    try {
      await api.put(`/api/records/${record.id}`, { pounds: num, notes: notes.trim() || null });
      toast.success('Registro actualizado');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Borrar este registro de ${record.category_name} (${record.pounds} lb)?`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/records/${record.id}`);
      toast.success('Eliminado');
      onDeleted();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar registro"
      footer={
        <>
          <BtnDanger onClick={remove} disabled={saving || deleting}>
            <Trash2 size={14} /> Eliminar
          </BtnDanger>
          <BtnGhost onClick={onClose} disabled={saving || deleting}>Cancelar</BtnGhost>
          <BtnPrimary onClick={save} disabled={!valid || saving || deleting}>
            {saving ? 'Guardando…' : 'Guardar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="edit-meta">
        <div className="meta-row">
          <span className="meta-label">Fecha</span>
          <strong>{fmtDate(record.record_date)}</strong>
        </div>
        <div className="meta-row">
          <span className="meta-label">Área</span>
          <span className="area-tag" style={{ '--tag-color': record.area_color }}>
            <span className="dot" /> {record.area_name}
          </span>
        </div>
        <div className="meta-row">
          <span className="meta-label">Categoría</span>
          <span className="cat-tag" style={{ '--tag-color': record.category_color }}>
            {record.category_name}
          </span>
        </div>
        {record.recorded_by_name && (
          <div className="meta-row">
            <span className="meta-label">Registrado por</span>
            <span className="meta-value">{record.recorded_by_name}</span>
          </div>
        )}
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Libras</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={pounds}
            onChange={(e) => setPounds(e.target.value)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Notas</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            maxLength={255}
          />
        </label>
      </div>
    </Modal>
  );
}

function BtnExport({ onClick }) {
  return (
    <button className="export-btn" onClick={onClick} title="Descargar CSV">
      <Download size={14} /> CSV
    </button>
  );
}
