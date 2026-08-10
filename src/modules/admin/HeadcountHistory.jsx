// src/modules/admin/HeadcountHistory.jsx — Calendario mensual + carga en bloque
import { useEffect, useState, useMemo } from 'react';
import {
  Users, ChevronLeft, ChevronRight, CalendarRange, Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import Modal from '../../shared/Modal.jsx';
import { BtnPrimary, BtnGhost, BtnSecondary } from '../../shared/Buttons.jsx';
import { fmtDate, fmtNumber, todayStr } from '../../utils/format.js';
import './HeadcountHistory.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_NAMES_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function buildMonthGrid(year, month) {
  // month es 1-12
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // weekday: 0=Dom, 1=Lun ... 6=Sáb. Queremos Lun=0.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const cells = [];
  // Huecos al inicio
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  // Días del mes
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Huecos al final (múltiplos de 7)
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function HeadcountHistory() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState({}); // { 'YYYY-MM-DD': people_count }
  const [loading, setLoading] = useState(true);
  const [editingDay, setEditingDay] = useState(null); // { date, current }
  const [showBulk, setShowBulk] = useState(false);

  const todayIso = todayStr();

  async function load() {
    setLoading(true);
    try {
      const { headcounts } = await api.get(`/api/headcount/month?year=${year}&month=${month}`);
      const map = {};
      for (const h of headcounts) {
        map[String(h.record_date).slice(0, 10)] = h.people_count;
      }
      setData(map);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  }

  async function saveDay(date, value) {
    try {
      await api.put(`/api/headcount/${date}`, { people_count: Number(value) || 0 });
      toast.success('Guardado');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const total = Object.values(data).reduce((s, v) => s + Number(v || 0), 0);
  const daysWithData = Object.keys(data).length;
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const avg = daysWithData > 0 ? total / daysWithData : 0;
  const coverage = Math.round((daysWithData / totalDaysInMonth) * 100);

  return (
    <div className="hc-cal-page">
      <div className="hc-cal-header">
        <h2><Users size={18} /> Headcount mensual</h2>
        <BtnSecondary onClick={() => setShowBulk(true)}>
          <Layers size={16} /> Carga en bloque
        </BtnSecondary>
      </div>

      <div className="hc-cal-toolbar">
        <button className="cal-nav" onClick={prevMonth} aria-label="Mes anterior">
          <ChevronLeft size={20} />
        </button>
        <div className="cal-title">
          <span className="cal-month">{MONTH_NAMES[month - 1]}</span>
          <span className="cal-year">{year}</span>
        </div>
        <button className="cal-nav" onClick={nextMonth} aria-label="Mes siguiente">
          <ChevronRight size={20} />
        </button>
        <button className="cal-today-btn" onClick={goToday}>Hoy</button>
      </div>

      <div className="hc-cal-summary">
        <span><strong>{fmtNumber(total)}</strong> personas en el mes</span>
        <span>·</span>
        <span><strong>{daysWithData}</strong> / {totalDaysInMonth} días con dato</span>
        <span>·</span>
        <span>Promedio: <strong>{fmtNumber(avg, 0)}</strong>/día</span>
        <span>·</span>
        <span>Cobertura: <strong>{coverage}%</strong></span>
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="hc-cal-grid">
          {DAY_NAMES_SHORT.map((d) => (
            <div key={d} className="hc-cal-head">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="hc-cal-cell empty" />;
            const date = isoDay(year, month, d);
            const value = data[date];
            const isToday = date === todayIso;
            const isFuture = date > todayIso;
            return (
              <button
                key={i}
                className={`hc-cal-cell${value ? ' has' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}`}
                onClick={() => setEditingDay({ date, current: value || '' })}
                disabled={isFuture}
                title={isFuture ? 'Fecha futura — no se puede editar' : `Click para editar`}
              >
                <span className="hc-cal-num">{d}</span>
                {value ? (
                  <span className="hc-cal-value">{value}</span>
                ) : (
                  <span className="hc-cal-empty">—</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editingDay && (
        <DayEditModal
          date={editingDay.date}
          current={editingDay.current}
          onClose={() => setEditingDay(null)}
          onSave={(v) => { saveDay(editingDay.date, v); setEditingDay(null); }}
          onDelete={async () => {
            if (!confirm('¿Borrar el headcount de este día?')) return;
            try {
              await api.del(`/api/headcount/${editingDay.date}`);
              toast.success('Borrado');
              setEditingDay(null);
              load();
            } catch (err) {
              toast.error(err.message);
            }
          }}
        />
      )}

      {showBulk && (
        <BulkModal
          year={year}
          month={month}
          onClose={() => setShowBulk(false)}
          onSaved={() => { setShowBulk(false); load(); }}
        />
      )}
    </div>
  );
}

function DayEditModal({ date, current, onClose, onSave, onDelete }) {
  const [val, setVal] = useState(current ? String(current) : '');

  return (
    <Modal
      open
      onClose={onClose}
      title={fmtDate(date)}
      footer={
        <>
          {current && <BtnSecondary onClick={onDelete}>Borrar</BtnSecondary>}
          <BtnGhost onClick={onClose}>Cancelar</BtnGhost>
          <BtnPrimary onClick={() => onSave(val)} disabled={val === ''}>
            Guardar
          </BtnPrimary>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Cantidad de personas</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </label>
      </div>
    </Modal>
  );
}

function BulkModal({ year, month, onClose, onSaved }) {
  const first = isoDay(year, month, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const last = isoDay(year, month, lastDay);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(last);
  const [value, setValue] = useState('');
  const [skipExisting, setSkipExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function apply() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Cantidad inválida');
      return;
    }
    if (to < from) {
      toast.error('"Hasta" debe ser posterior o igual a "Desde"');
      return;
    }
    setSaving(true);
    try {
      const { saved, skipped, total } = await api.post('/api/headcount/bulk', {
        from, to, people_count: n, skip_existing: skipExisting,
      });
      toast.success(`${saved} días guardados${skipped ? ` (${skipped} ya tenían dato, no se tocaron)` : ''}`);
      onSaved();
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
      title="Carga en bloque"
      footer={
        <>
          <BtnGhost onClick={onClose}>Cancelar</BtnGhost>
          <BtnPrimary onClick={apply} disabled={saving || value === ''}>
            {saving ? 'Guardando…' : 'Aplicar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="form-grid">
        <div className="bulk-help">
          <p>Asigná la misma cantidad de personas a varios días seguidos. Útil para cargar el mes de una sola vez al final.</p>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Desde</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} min={first} max={last} />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={first} max={last} />
          </label>
        </div>
        <label className="field">
          <span>Personas por día</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
          />
          <span>No sobrescribir días que ya tienen dato</span>
        </label>
      </div>
    </Modal>
  );
}
