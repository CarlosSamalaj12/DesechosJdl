// src/modules/operator/OperatorHome.jsx — pantalla del operador con área asignada
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users as UsersIcon, ChevronRight, Check, Sprout, AlertTriangle, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { todayStr, fmtDate, fmtNumber } from '../../utils/format.js';
import { BtnPrimary } from '../../shared/Buttons.jsx';
import CategoryRecordModal from './CategoryRecordModal.jsx';
import './OperatorHome.css';

export default function OperatorHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);              // /me con area info
  const [categories, setCategories] = useState([]); // activas
  const [records, setRecords] = useState([]);       // registros del día en su área
  const [headcount, setHeadcount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hcInput, setHcInput] = useState('');
  const [hcSaving, setHcSaving] = useState(false);
  const [openCat, setOpenCat] = useState(null);     // categoría abierta en modal

  const today = todayStr();

  async function load() {
    setLoading(true);
    try {
      const [{ user: u }, { categories: cats }, { records: recs }, { headcount: hc }] =
        await Promise.all([
          api.get('/api/auth/me'),
          api.get('/api/categories'),
          api.get(`/api/records?date=${today}${user?.area_id ? `&area_id=${user.area_id}` : ''}`),
          api.get('/api/headcount/today'),
        ]);
      setMe(u);
      setCategories(cats.filter((c) => c.is_active));
      setRecords(recs);
      setHeadcount(hc);
      setHcInput(hc ? String(hc.people_count) : '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function saveHeadcount() {
    setHcSaving(true);
    try {
      await api.put(`/api/headcount/${today}`, { people_count: Number(hcInput) || 0 });
      toast.success('Headcount guardado');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setHcSaving(false);
    }
  }

  async function handleSaved() {
    setOpenCat(null);
    load();
  }

  if (loading || !me) {
    return <p className="muted" style={{ padding: 20 }}>Cargando…</p>;
  }

  // Operador sin área asignada
  if (me.role === 'operator' && !me.area_id) {
    return (
      <div className="op-home">
        <div className="op-area-card" style={{ '--area-color': '#94a3b8' }}>
          <h1>Hola, {me.full_name.split(' ')[0]}</h1>
        </div>
        <div className="empty-state">
          <AlertTriangle size={48} color="#f59e0b" />
          <h2>Sin área asignada</h2>
          <p>Pedile al administrador que te asigne un área para empezar a registrar desechos.</p>
        </div>
      </div>
    );
  }

  // Admin sin área: pantalla simple (no le aplica el flujo del operador)
  if (me.role === 'admin' && !me.area_id) {
    return (
      <div className="op-home">
        <div className="op-area-card" style={{ '--area-color': '#6366f1' }}>
          <h1>Hola, {me.full_name.split(' ')[0]}</h1>
          <p className="op-date">{fmtDate(today)}</p>
        </div>
        <div className="empty-state">
          <Sprout size={48} />
          <h2>Sos administrador</h2>
          <p>Para registrar desechos como operador, primero creá un usuario operador y asignale un área en <strong>Admin → Usuarios</strong>.</p>
          <BtnPrimary onClick={() => navigate('/admin')}>
            <BarChart3 size={16} /> Ir al Panel Admin
          </BtnPrimary>
        </div>
      </div>
    );
  }

  const area = { id: me.area_id, name: me.area_name, color: me.area_color || '#10b981' };
  const recordByCat = Object.fromEntries(records.map((r) => [r.category_id, r]));
  const totalToday = records.reduce((s, r) => s + Number(r.pounds || 0), 0);
  const doneCount = categories.filter((c) => Number(recordByCat[c.id]?.pounds) > 0).length;
  const allDone = doneCount === categories.length;
  const hcDone = headcount && headcount.people_count > 0;
  const lbPersona = hcDone && headcount.people_count > 0 ? totalToday / headcount.people_count : 0;

  return (
    <div className="op-home">
      <div className="op-area-card" style={{ '--area-color': area.color }}>
        <small className="op-area-label">Tu área</small>
        <h1>{area.name}</h1>
        <p className="op-date">{fmtDate(today)}</p>
      </div>

      <div className="hc-card">
        <div className="hc-card-icon"><UsersIcon size={20} /></div>
        <div className="hc-card-text">
          <strong>Personas en el hotel hoy</strong>
          {hcDone ? (
            <small>Registrado: <strong>{headcount.people_count}</strong></small>
          ) : me.role === 'admin' ? (
            <small className="muted">Sin registrar — llenalo para ver lb/persona</small>
          ) : (
            <small className="muted">Sin registrar — pedile al admin que lo cargue</small>
          )}
        </div>
        {me.role === 'admin' && (
          <div className="hc-card-input">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={hcInput}
              onChange={(e) => setHcInput(e.target.value)}
              placeholder="0"
            />
            <BtnPrimary onClick={saveHeadcount} disabled={hcSaving || !hcInput}>
              {hcDone ? 'Actualizar' : 'Guardar'}
            </BtnPrimary>
          </div>
        )}
      </div>

      <div className="op-section-header">
        <h2 className="op-section-title">Desechos del día</h2>
        <span className="op-progress">
          {doneCount} / {categories.length}
          {allDone && <Check size={14} />}
        </span>
      </div>

      <div className="cat-tap-list">
        {categories.map((c) => {
          const rec = recordByCat[c.id];
          const pounds = rec ? Number(rec.pounds) : 0;
          const done = pounds > 0;
          return (
            <button
              key={c.id}
              className={`cat-tap-card${done ? ' done' : ''}`}
              style={{ '--cat-color': c.color }}
              onClick={() => setOpenCat({ ...c, existing: rec })}
            >
              <div className="cat-tap-left">
                <span className="cat-tap-dot" />
                <span className="cat-tap-name">{c.name}</span>
              </div>
              <div className="cat-tap-right">
                {done ? (
                  <span className="cat-tap-value">{fmtNumber(pounds)} <small>lb</small></span>
                ) : (
                  <span className="cat-tap-empty">Tocar para registrar</span>
                )}
                <ChevronRight size={18} />
              </div>
            </button>
          );
        })}
      </div>

      {totalToday > 0 && (
        <div className="op-summary">
          <div>
            <span>Total {area.name} hoy</span>
            <strong>{fmtNumber(totalToday)} lb</strong>
          </div>
          {hcDone && (
            <div>
              <span>Equivale a</span>
              <strong>{fmtNumber(lbPersona, 3)} lb / persona</strong>
            </div>
          )}
        </div>
      )}

      {openCat && (
        <CategoryRecordModal
          area={area}
          category={openCat}
          date={today}
          existing={openCat.existing}
          onClose={() => setOpenCat(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
