// src/modules/admin/Analytics.jsx — Dashboard con KPIs y gráficas
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Minus, Users, Scale, CalendarDays,
  AlertCircle, BarChart3, Filter, X, Target, ChevronRight, FileSpreadsheet, Save, Check,
  Layers, Tag, UserCog, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend, LabelList, ReferenceLine,
} from 'recharts';
import toast from 'react-hot-toast';
import { api } from '../../api/client.js';
import { getToken } from '../../api/client.js';
import { fmtNumber, fmtDateShort, todayStr, fmtDate } from '../../utils/format.js';
import CheckboxMultiSelect from '../../shared/CheckboxMultiSelect.jsx';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from '../../hooks/useDarkMode.js';
import './Analytics.css';

const RANGES = [
  { id: '7',  label: '7 días',  days: 7 },
  { id: '30', label: '30 días', days: 30 },
  { id: '90', label: '90 días', days: 90 },
];

const sharePct = (part, total) => (total > 0 ? (part / total) * 100 : 0);

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
        {delta !== undefined && (
          <DeltaBadge value={delta} inverse={deltaInverse} />
        )}
      </div>
    </div>
  );
}

// Tooltip personalizado para los charts (mobile-friendly, fondo sólido)
// withPct agrega el porcentaje (p.payload.pct) junto al valor, si existe
function ChartTooltip({ active, payload, label, valueFmt = (v) => v, withPct = false }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p, i) => {
        const pct = withPct ? p.payload?.pct : undefined;
        return (
          <div key={i} className="chart-tooltip-row" style={{ color: p.color || p.fill }}>
            <span className="dot" style={{ background: p.color || p.fill }} />
            <span>{p.name}:</span>
            <strong>{valueFmt(p.value)}{pct != null ? ` · ${fmtNumber(pct, 1)}%` : ''}</strong>
          </div>
        );
      })}
    </div>
  );
}

// Tooltip del chart de áreas: una sola fila con libras + % del total (según métrica)
function AreaTooltip({ active, payload, label, metric = 'lb' }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div className="chart-tooltip-row" style={{ color: row.color }}>
        <span className="dot" style={{ background: row.color }} />
        <span>{row.name}:</span>
        <strong>
          {metric === 'lb'
            ? `${fmtNumber(row.pounds, 1)} lb · ${fmtNumber(row.pct, 1)}% del total`
            : `${fmtNumber(row.pct, 1)}% del total`}
        </strong>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [rangeId, setRangeId] = useState('30');
  const [metric, setMetric] = useState('lb'); // 'lb' | 'pct'
  const [dailyGoal, setDailyGoal] = useState(() => localStorage.getItem('jdl_daily_goal') || '');
  const [areaIds, setAreaIds] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [areas, setAreas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [byArea, setByArea] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [coverageDate, setCoverageDate] = useState(null);
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
    bar2:   dark ? '#4b5563' : '#cbd5e1',
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

  async function exportReport() {
    const p = new URLSearchParams({ days });
    areaIds.forEach((id) => p.append('area_id', String(id)));
    categoryIds.forEach((id) => p.append('category_id', String(id)));
    const res = await fetch(`/api/records/export/report?${p}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) { toast.error('Error al exportar'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_desperdicios_${new Date().toISOString().slice(0,10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Reporte Excel descargado');
  }

  const days = RANGES.find((r) => r.id === rangeId)?.days || 30;
  // Datos con porcentaje del total para los charts de distribución
  const catData = useMemo(() => byCategory.filter((c) => c.pounds > 0), [byCategory]);
  const areaTotal = useMemo(() => byArea.reduce((s, a) => s + a.pounds, 0), [byArea]);
  const areaData = useMemo(
    () => byArea.map((a) => ({ ...a, pct: areaTotal > 0 ? (a.pounds / areaTotal) * 100 : 0 })),
    [byArea, areaTotal],
  );
  // % del total por día para la tendencia
  const trendTotal = useMemo(() => trend.reduce((s, d) => s + d.pounds, 0), [trend]);
  const trendData = useMemo(
    () => trend.map((d) => ({ ...d, pct_total: trendTotal > 0 ? (d.pounds / trendTotal) * 100 : 0 })),
    [trend, trendTotal],
  );
  const queryStr = useMemo(() => {
    const p = new URLSearchParams({ days });
    areaIds.forEach((id) => p.append('area_id', String(id)));
    categoryIds.forEach((id) => p.append('category_id', String(id)));
    return p.toString();
  }, [days, areaIds.join(','), categoryIds.join(',')]);

  async function load() {
    setLoading(true);
    try {
      const [{ areas: a }, { categories: c }, s, t, ba, bc, ap, { headcount: hc }, cov] = await Promise.all([
        api.get('/api/areas'),
        api.get('/api/categories'),
        api.get(`/api/dashboard/summary?${queryStr}`),
        api.get(`/api/dashboard/trend?${queryStr}`),
        api.get(`/api/dashboard/by-area?${queryStr}`),
        api.get(`/api/dashboard/by-category?${queryStr}`),
        api.get('/api/plans/active').catch(() => ({ plans: [] })),
        api.get('/api/headcount/today').catch(() => ({ headcount: null })),
        api.get(`/api/dashboard/coverage?date=${todayStr()}`).catch(() => ({ date: null, areas: [] })),
      ]);
      setAreas(a);
      setCategories(c);
      setSummary(s);
      setTrend(t.series);
      setByArea(ba.areas);
      setByCategory(bc.categories);
      setCoverage(cov.areas);
      setCoverageDate(cov.date);
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

  const filtersActive = areaIds.length > 0 || categoryIds.length > 0;
  const registeredAreas = coverage.filter((a) => a.has_data).length;

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
          <div className="metric-toggle" role="group" aria-label="Unidad de medida">
            <button
              type="button"
              className={`metric-btn${metric === 'lb' ? ' active' : ''}`}
              onClick={() => setMetric('lb')}
              title="Ver valores en libras"
            >
              <Scale size={13} /> Libras
            </button>
            <button
              type="button"
              className={`metric-btn${metric === 'pct' ? ' active' : ''}`}
              onClick={() => setMetric('pct')}
              title="Ver valores en porcentajes"
            >
              % Porcentaje
            </button>
          </div>
          <CheckboxMultiSelect
            options={areas}
            selected={areaIds}
            onChange={setAreaIds}
            allLabel="Todas las áreas"
          />
          <CheckboxMultiSelect
            options={categories}
            selected={categoryIds}
            onChange={setCategoryIds}
            allLabel="Todas las categorías"
            icon={Tag}
          />
          {filtersActive && (
            <button
              className="filter-clear"
              onClick={() => { setAreaIds([]); setCategoryIds([]); }}
              title="Limpiar filtros"
            >
              <X size={14} /> Limpiar
            </button>
          )}
          <button className="export-btn" onClick={exportReport} title="Descargar reporte Excel">
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Cobertura de hoy: áreas que aún no registraron */}
      {coverage.length > 0 && (
        <div className="coverage-card">
          <div className="coverage-card-header">
            <div>
              <strong>Cobertura de hoy</strong>
              <small className="muted">{coverageDate ? fmtDate(coverageDate) : ''}</small>
            </div>
            <span className={`coverage-count${registeredAreas === coverage.length ? ' ok' : ''}`}>
              {registeredAreas}/{coverage.length} áreas registraron
            </span>
          </div>
          <div className="coverage-chips">
            {coverage.map((a) => (
              <span
                key={a.id}
                className={`coverage-chip${a.has_data ? ' done' : ''}`}
                style={{ '--coverage-color': a.color }}
              >
                <span className="dot" />
                {a.name}
                {a.has_data ? <Check size={12} /> : <AlertCircle size={12} />}
              </span>
            ))}
          </div>
        </div>
      )}

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
              <div>
                <h3>Tendencia diaria</h3>
                <span className="chart-sub">
                  {metric === 'lb' ? 'lb totales y lb/persona por día' : '% del total por día'}
                </span>
              </div>
              {metric === 'lb' && (
                <label className="goal-field">
                  <span>Meta diaria</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="lb/día"
                    value={dailyGoal}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDailyGoal(v);
                      if (v !== '') localStorage.setItem('jdl_daily_goal', v);
                      else localStorage.removeItem('jdl_daily_goal');
                    }}
                  />
                </label>
              )}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              {metric === 'lb' ? (
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
                    name="Libras totales"
                    stroke={chartTheme.line}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    yAxisId="ratio"
                    type="monotone"
                    dataKey="lb_persona"
                    name="Libras por persona"
                    stroke={chartTheme.line2}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                  {Number(dailyGoal) > 0 && (
                    <ReferenceLine
                      yAxisId="lb"
                      y={Number(dailyGoal)}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                      label={{
                        value: `Meta ${fmtNumber(dailyGoal, 0)} lb`,
                        position: 'insideTopRight',
                        fontSize: 11,
                        fill: chartTheme.text,
                      }}
                    />
                  )}
                </LineChart>
              ) : (
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtDateShort(d).slice(0, 5)}
                    tick={{ fontSize: 11, fill: chartTheme.text }}
                    stroke={chartTheme.text}
                  />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: chartTheme.text }}
                    stroke={chartTheme.text}
                  />
                  <Tooltip content={<ChartTooltip valueFmt={(v) => `${fmtNumber(v, 2)}% del total`} />} />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="pct_total"
                    name="% del total"
                    stroke={chartTheme.line}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              )}
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
                    data={catData}
                    dataKey={metric === 'lb' ? 'pounds' : 'pct'}
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {catData.map((c) => (
                      <Cell key={c.id} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={metric === 'lb'
                      ? <ChartTooltip valueFmt={(v) => `${fmtNumber(v, 1)} lb`} withPct />
                      : <ChartTooltip valueFmt={(v) => `${fmtNumber(v, 1)}%`} />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value, entry) => `${value} · ${fmtNumber(entry.payload?.pct ?? 0, 1)}%`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Principales áreas</h3>
                <span className="chart-sub">
                  {metric === 'lb' ? 'libras y % del total' : '% del total'}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={areaData}
                  layout="vertical"
                  margin={{ top: metric === 'lb' ? 16 : 4, right: 16, left: 0, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                  {metric === 'lb' && (
                    <XAxis type="number" xAxisId="lb" tick={{ fontSize: 11, fill: chartTheme.text }} stroke={chartTheme.text} />
                  )}
                  <XAxis
                    type="number"
                    xAxisId="pct"
                    orientation={metric === 'lb' ? 'top' : 'bottom'}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: chartTheme.text }}
                    stroke={chartTheme.text}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11, fill: chartTheme.text }}
                    stroke={chartTheme.text}
                  />
                  <Tooltip content={<AreaTooltip metric={metric} />} />
                  {metric === 'lb' && (
                    <Bar dataKey="pounds" xAxisId="lb" name="Libras" radius={[0, 6, 6, 0]}>
                      {areaData.map((a) => (
                        <Cell key={a.id} fill={a.color} />
                      ))}
                    </Bar>
                  )}
                  <Bar
                    dataKey="pct"
                    xAxisId="pct"
                    name={metric === 'lb' ? '% del total' : 'Porcentaje'}
                    radius={[0, 6, 6, 0]}
                    fill={chartTheme.bar2}
                  >
                    <LabelList
                      dataKey="pct"
                      position="right"
                      formatter={(v) => (v > 0 ? `${fmtNumber(v, 1)}%` : '')}
                      style={{ fontSize: 11, fill: chartTheme.text }}
                    />
                  </Bar>
                  {metric === 'lb' && (
                    <Legend
                      verticalAlign="top"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  )}
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
                  <small>
                    {fmtNumber(summary.kpis.top_area.pounds)} lb · {fmtNumber(sharePct(summary.kpis.top_area.pounds, summary.kpis.total_pounds), 1)}% del total
                  </small>
                </div>
              )}
              {summary.kpis.top_category && (
                <div className="highlight-card" style={{ borderLeft: `5px solid ${summary.kpis.top_category.color}` }}>
                  <span>Categoría que más pesa</span>
                  <strong>{summary.kpis.top_category.name}</strong>
                  <small>
                    {fmtNumber(summary.kpis.top_category.pounds)} lb · {fmtNumber(sharePct(summary.kpis.top_category.pounds, summary.kpis.total_pounds), 1)}% del total
                  </small>
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
