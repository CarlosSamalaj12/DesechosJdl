// src/modules/admin/Analytics.jsx — Dashboard con KPIs y gráficas
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Minus, Users, Scale, CalendarDays,
  AlertCircle, BarChart3, Filter, X, Target, ChevronRight, Download, Save, Check,
  Layers, Tag, UserCog, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import { getToken } from '../../api/client.js';
import { fmtNumber, fmtDateShort, todayStr, fmtDate } from '../../utils/format.js';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from '../../hooks/useDarkMode.js';
import './Analytics.css';

const RANGES = [
  { id: '7',  label: '7 días',  days: 7 },
  { id: '30', label: '30 días', days: 30 },
  { id: '90', label: '90 días', days: 90 },
];

function DeltaBadge({ value, suffix = '%', inverse = false }) {
  if (value == null || isNaN(value) || value === 0) {
    return <span className="delta neutral"><Minus size={12} /> 0{suffix}</span>;
  }
  const isUp = value > 0;
  // Para desechos, "más" es MALO (inverse). Para headcount, "más" es NEUTRAL.
  const isGood = inverse ? !isUp : isUp;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`delta ${isGood ? 'good' : 'bad'}`}>
      <Icon size={12} /> {isUp ? '+' : ''}{fmtNumber(value, 1)}{suffix}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, delta, deltaInverse, accent }) {
  return (
    <div className="kpi-card" style={accent ? { '--accent': accent } : undefined}>
      <div className="kpi-icon"><Icon size={18} /></div>
      <div className="kpi-text">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {sub && <small className="kpi-sub">{sub}</small>}
      </div>
      {delta !== undefined && (
        <DeltaBadge value={delta} inverse={deltaInverse} />
      )}
    </div>
  );
}

// Tooltip personalizado para los charts (mobile-friendly, fondo sólido)
function ChartTooltip({ active, payload, label, valueFmt = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row" style={{ color: p.color || p.fill }}>
          <span className="dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}:</span>
          <strong>{valueFmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [rangeId, setRangeId] = useState('30');
  const [areaId, setAreaId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [areas, setAreas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [byArea, setByArea] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [activePlans, setActivePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [headcountToday, setHeadcountToday] = useState(null);
  const [hcInput, setHcInput] = useState('');
  const [hcSaving, setHcSaving] = useState(false);
  const navigate = useNavigate();
  const dark = useDarkMode();

  const chartTheme = {
    grid:   dark ? 'rgba(160,160,180,0.15)' : 'rgba(0,0,0,0.08)',
    text:   dark ? '#9ca3af' : '#6b7280',
    line:   '#10b981',
    line2:  '#3b82f6',
  };

  async function loadHeadcount() {
    try {
      const { headcount: hc } = await api.get('/api/headcount/today');
      setHeadcountToday(hc);
      setHcInput(hc ? String(hc.people_count) : '');
    } catch (err) {
      console.error('headcount load', err);
    }
  }

  async function saveHeadcount() {
    setHcSaving(true);
    try {
      await api.put(`/api/headcount/${todayStr()}`, { people_count: Number(hcInput) || 0 });
      toast.success('Headcount guardado');
      loadHeadcount();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setHcSaving(false);
    }
  }

  async function exportCsv() {
    const p = new URLSearchParams({ days });
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
    a.download = `desperdicios_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV descargado');
  }

  const days = RANGES.find((r) => r.id === rangeId)?.days || 30;
  const queryStr = useMemo(() => {
    const p = new URLSearchParams({ days });
    if (areaId) p.set('area_id', areaId);
    if (categoryId) p.set('category_id', categoryId);
    return p.toString();
  }, [days, areaId, categoryId]);

  async function load() {
    setLoading(true);
    try {
      const [{ areas: a }, { categories: c }, s, t, ba, bc, ap, { headcount: hc }] = await Promise.all([
        api.get('/api/areas'),
        api.get('/api/categories'),
        api.get(`/api/dashboard/summary?${queryStr}`),
        api.get(`/api/dashboard/trend?${queryStr}`),
        api.get(`/api/dashboard/by-area?${queryStr}`),
        api.get(`/api/dashboard/by-category?${queryStr}`),
        api.get('/api/plans/active').catch(() => ({ plans: [] })),
        api.get('/api/headcount/today').catch(() => ({ headcount: null })),
      ]);
      setAreas(a);
      setCategories(c);
      setSummary(s);
      setTrend(t.series);
      setByArea(ba.areas);
      setByCategory(bc.categories);
      setActivePlans(ap.plans || []);
      setHeadcountToday(hc);
      setHcInput(hc ? String(hc.people_count) : '');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [queryStr]);

  const filtersActive = areaId || categoryId;

  return (
    <div className="analytics">
      {/* Widget de headcount - primera cosa que ve el admin */}
      <div className="hc-widget">
        <div className="hc-widget-icon"><Users size={20} /></div>
        <div className="hc-widget-body">
          <div className="hc-widget-text">
            <strong>Personas en el hotel hoy</strong>
            <small>{fmtDate(todayStr())}</small>
          </div>
          <div className="hc-widget-status">
            {headcountToday ? (
              <span className="hc-ok">
                <Check size={14} /> Registrado: <strong>{headcountToday.people_count}</strong>
              </span>
            ) : (
              <span className="hc-pending">Sin registrar</span>
            )}
          </div>
        </div>
        <div className="hc-widget-form">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={hcInput}
            onChange={(e) => setHcInput(e.target.value)}
            placeholder="0"
            aria-label="Personas hoy"
          />
          <button
            className="hc-save-btn"
            onClick={saveHeadcount}
            disabled={hcSaving || !hcInput}
            title="Guardar headcount"
          >
            <Save size={16} />
            <span>{hcSaving ? 'Guardando…' : (headcountToday ? 'Actualizar' : 'Guardar')}</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="range-bar">
        <div className="range-chips">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={`range-chip${rangeId === r.id ? ' active' : ''}`}
              onClick={() => setRangeId(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="filter-toggles">
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            aria-label="Filtrar por área"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {filtersActive && (
            <button
              className="filter-clear"
              onClick={() => { setAreaId(''); setCategoryId(''); }}
              title="Limpiar filtros"
            >
              <X size={14} /> Limpiar
            </button>
          )}
          <button className="export-btn" onClick={exportCsv} title="Descargar CSV">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {loading || !summary ? (
        <p className="muted">Cargando…</p>
      ) : summary.kpis.total_pounds === 0 ? (
        <div className="empty-state">
          <BarChart3 size={48} />
          <h2>Sin datos en este período</h2>
          <p>Esperá a que los operadores registren desechos o cambiá el rango.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="kpi-grid">
            <KpiCard
              icon={Scale}
              label="Total"
              value={`${fmtNumber(summary.kpis.total_pounds)} lb`}
              sub={`${summary.kpis.days_with_records} de ${summary.kpis.total_days} días`}
              delta={summary.kpis.variation_pct}
              deltaInverse
              accent="#10b981"
            />
            <KpiCard
              icon={Users}
              label="Personas"
              value={fmtNumber(summary.kpis.headcount)}
              sub="total del período"
            />
            <KpiCard
              icon={Scale}
              label="lb / persona"
              value={fmtNumber(summary.kpis.lb_persona, 3)}
              sub={summary.kpis.lb_persona_prev > 0
                ? `antes ${fmtNumber(summary.kpis.lb_persona_prev, 3)}`
                : 'sin período anterior'}
              delta={summary.kpis.lb_persona_prev > 0
                ? ((summary.kpis.lb_persona - summary.kpis.lb_persona_prev) / summary.kpis.lb_persona_prev) * 100
                : 0}
              deltaInverse
              accent="#3b82f6"
            />
            <KpiCard
              icon={CalendarDays}
              label="Cobertura"
              value={`${fmtNumber(summary.kpis.coverage_pct, 0)}%`}
              sub="días con registro"
              accent="#0891b2"
            />
          </div>

          {/* Tendencia */}
          <div className="chart-card">
            <div className="chart-header">
              <h3>Tendencia diaria</h3>
              <span className="chart-sub">lb totales y lb/persona por día</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => fmtDateShort(d).slice(0, 5)}
                  tick={{ fontSize: 11, fill: chartTheme.text }}
                  stroke={chartTheme.text}
                />
                <YAxis yAxisId="lb" tick={{ fontSize: 11, fill: chartTheme.text }} stroke={chartTheme.text} />
                <YAxis yAxisId="ratio" orientation="right" tick={{ fontSize: 11, fill: chartTheme.text }} stroke={chartTheme.text} />
                <Tooltip content={<ChartTooltip valueFmt={(v) => fmtNumber(v, 2)} />} />
                <Line
                  yAxisId="lb"
                  type="monotone"
                  dataKey="pounds"
                  name="lb total"
                  stroke={chartTheme.line}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="ratio"
                  type="monotone"
                  dataKey="lb_persona"
                  name="lb/persona"
                  stroke={chartTheme.line2}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Mix por categoría + Top áreas */}
          <div className="chart-row">
            <div className="chart-card">
              <div className="chart-header">
                <h3>Mix por categoría</h3>
                <span className="chart-sub">% del total</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={byCategory.filter((c) => c.pounds > 0)}
                    dataKey="pounds"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {byCategory.filter((c) => c.pounds > 0).map((c) => (
                      <Cell key={c.id} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip valueFmt={(v) => `${fmtNumber(v, 1)} lb`} />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Top áreas</h3>
                <span className="chart-sub">libras acumuladas</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={byArea}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: chartTheme.text }} stroke={chartTheme.text} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11, fill: chartTheme.text }}
                    stroke={chartTheme.text}
                  />
                  <Tooltip content={<ChartTooltip valueFmt={(v) => `${fmtNumber(v, 1)} lb`} />} />
                  <Bar dataKey="pounds" radius={[0, 6, 6, 0]}>
                    {byArea.map((a) => (
                      <Cell key={a.id} fill={a.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Highlights */}
          {(summary.kpis.top_area || summary.kpis.top_category) && (
            <div className="highlights">
              {summary.kpis.top_area && (
                <div className="highlight-card" style={{ borderLeft: `5px solid ${summary.kpis.top_area.color}` }}>
                  <span>Área con más desechos</span>
                  <strong>{summary.kpis.top_area.name}</strong>
                  <small>{fmtNumber(summary.kpis.top_area.pounds)} lb</small>
                </div>
              )}
              {summary.kpis.top_category && (
                <div className="highlight-card" style={{ borderLeft: `5px solid ${summary.kpis.top_category.color}` }}>
                  <span>Categoría que más pesa</span>
                  <strong>{summary.kpis.top_category.name}</strong>
                  <small>{fmtNumber(summary.kpis.top_category.pounds)} lb</small>
                </div>
              )}
            </div>
          )}

          {summary.kpis.coverage_pct < 50 && (
            <div className="alert-card">
              <AlertCircle size={18} />
              <div>
                <strong>Cobertura baja: {fmtNumber(summary.kpis.coverage_pct, 0)}%</strong>
                <p>Los operadores están registrando pocos días. Revisá que cada área cargue datos diariamente.</p>
              </div>
            </div>
          )}

          {activePlans.length > 0 && (
            <div className="active-plans">
              <h3><Target size={16} /> Planes activos</h3>
              {activePlans.map((p) => {
                const pct = p.steps_total > 0 ? Math.round((p.steps_done / p.steps_total) * 100) : 0;
                return (
                  <button
                    key={p.id}
                    className="active-plan-card"
                    style={{ '--plan-color': p.area_color || '#10b981' }}
                    onClick={() => navigate('/admin/plans')}
                  >
                    <div className="active-plan-main">
                      <strong>{p.title}</strong>
                      <small className="muted">
                        {p.area_name || 'Todas'} · {fmtDateShort(p.start_date)} → {fmtDateShort(p.end_date)}
                      </small>
                    </div>
                    <div className="active-plan-progress">
                      <div className="plan-progress-bar">
                        <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <small>{pct}% · {p.steps_done}/{p.steps_total}</small>
                    </div>
                    <ChevronRight size={18} className="plan-chevron" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Accesos a configuración (áreas, categorías, usuarios) */}
          <div className="config-section">
            <h3><UserCog size={16} /> Configuración</h3>
            <Link to="/admin/areas" className="config-tile" style={{ '--tile-color': '#10b981' }}>
              <div className="config-tile-icon"><Layers size={20} /></div>
              <div className="config-tile-text">
                <strong>Áreas</strong>
                <span>Crear y editar áreas del hotel</span>
              </div>
              <ArrowRight size={18} className="config-tile-arrow" />
            </Link>
            <Link to="/admin/categories" className="config-tile" style={{ '--tile-color': '#6366f1' }}>
              <div className="config-tile-icon"><Tag size={20} /></div>
              <div className="config-tile-text">
                <strong>Categorías</strong>
                <span>Tipos de desecho que se miden</span>
              </div>
              <ArrowRight size={18} className="config-tile-arrow" />
            </Link>
            <Link to="/admin/users" className="config-tile" style={{ '--tile-color': '#f59e0b' }}>
              <div className="config-tile-icon"><Users size={20} /></div>
              <div className="config-tile-text">
                <strong>Usuarios</strong>
                <span>Operadores y administradores</span>
              </div>
              <ArrowRight size={18} className="config-tile-arrow" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
