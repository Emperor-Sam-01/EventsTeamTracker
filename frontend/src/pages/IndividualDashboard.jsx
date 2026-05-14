import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine, BarChart, Bar,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, ROLE_LABELS, TIER_COLORS, monthName, getMonthYear } from '../utils/format';

const TIER_LABEL = { 0: 'Below T1', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

function ProgressBar({ value, max, color = 'bg-brand-500' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Custom tooltip for the GP trend line chart
function GpTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[140px]">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-medium">{p.value != null ? formatCurrency(p.value) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

// Custom tooltip for the sales effort bar chart
function EffortTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[160px]">
      <div className="font-semibold text-gray-700 mb-1">Week: {label}</div>
      {[
        { label: 'Emails', actual: d.emails, target: d.emails_target },
        { label: 'Calls',  actual: d.calls,  target: d.calls_target },
        { label: 'Proposals', actual: d.proposals, target: d.proposals_target },
      ].filter(r => r.actual != null).map(r => (
        <div key={r.label} className="flex justify-between gap-3">
          <span className="text-gray-500">{r.label}</span>
          <span className={r.actual >= r.target ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
            {r.actual} / {r.target}
          </span>
        </div>
      ))}
    </div>
  );
}

// Flip card: click to toggle between two views
function FlipCard({ labelA, valueA, subA, colorA, labelB, valueB, subB, colorB }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="card cursor-pointer select-none border-2 border-transparent hover:border-brand-300 transition-all relative"
      onClick={() => setFlipped(f => !f)}
    >
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
        {flipped ? labelB : labelA}
      </div>
      <div className={`text-2xl font-bold mt-1 ${(flipped ? colorB : colorA) || 'text-gray-900'}`}>
        {flipped ? valueB : valueA}
      </div>
      {(flipped ? subB : subA) && (
        <div className="text-xs text-gray-500 mt-0.5">{flipped ? subB : subA}</div>
      )}
      <div className="mt-2 text-xs text-brand-500 font-medium flex items-center gap-1">
        <span>↔</span>
        <span>Click to see {flipped ? labelA : labelB}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// Format date string from DB (may be full ISO or date-only) as "4 May"
function fmtMonday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.split('T')[0] + 'T12:00:00');
  return `${d.getDate()} ${d.toLocaleString('en-SG', { month: 'short' })}`;
}

export default function IndividualDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [benchmarkTrend, setBenchmarkTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const { month, year } = getMonthYear();
  const [period, setPeriod] = useState({ month, year });

  // Editable display name stored in localStorage
  const storageKey = `dashboard_name_${user.id}`;
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(storageKey) || user.name);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);

  // Toggle benchmark lines on GP trend chart
  const [showLines, setShowLines] = useState({ avg: true, best: false, worst: false });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/individual/${user.id}?month=${period.month}&year=${period.year}`),
      api.get(`/dashboard/benchmarks?month=${period.month}&year=${period.year}`),
      api.get(`/dashboard/benchmarks-trend?month=${period.month}&year=${period.year}`),
    ])
      .then(([d, b, bt]) => { setData(d.data); setBenchmarks(b.data); setBenchmarkTrend(bt.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id, period]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  if (!data) return <div className="text-red-500">Failed to load dashboard.</div>;

  const { gp, clients, sales_effort, gp_trend } = data;
  const isPE = ['pe', 'spe'].includes(data.user.role);
  const multiplier = data.user.multiplier;
  const targets = gp.targets || {};

  // Tier targets (adjusted for multiplier)
  const t1 = targets.t1 ? targets.t1 * multiplier : null;
  const t2 = targets.t2 ? targets.t2 * multiplier : null;
  const t3 = targets.t3 ? targets.t3 * multiplier : null;
  const yearlyGP = gp.yearly || 0;

  const effortHistory = (sales_effort.history || []).map(e => ({
    week: fmtMonday(e.week_start),
    emails: e.cold_emails_actual,
    emails_target: e.cold_emails_target,
    calls: e.cold_calls_actual,
    calls_target: e.cold_calls_target,
    proposals: e.proposals_sent_actual,
    proposals_target: e.proposals_sent_target,
    meetings: e.new_clients_met_actual,
  })).reverse();

  // Current targets (from dashboard, not from last week's submission)
  const currentTargets = sales_effort.targets || {};
  const effortItems = [
    { key: 'cold_emails', label: 'Cold Emails', actual: sales_effort.latest?.cold_emails_actual ?? 0, target: currentTargets.cold_emails, color: 'bg-blue-500' },
    { key: 'cold_calls', label: 'Cold Calls', actual: sales_effort.latest?.cold_calls_actual ?? 0, target: currentTargets.cold_calls, color: 'bg-indigo-500', hide: isPE },
    { key: 'proposals_sent', label: 'Proposals Sent', actual: sales_effort.latest?.proposals_sent_actual ?? 0, target: currentTargets.proposals_sent, color: 'bg-teal-500' },
    { key: 'new_clients_met', label: 'New Clients Met', actual: sales_effort.latest?.new_clients_met_actual ?? 0, target: currentTargets.new_clients_met, color: 'bg-purple-500', hide: isPE },
  ].filter(i => !i.hide);

  // GP trend chart data (6 months history only — no projection)
  const trendMap = {};
  benchmarkTrend.forEach(b => { trendMap[b.month] = b; });

  const chartData = (gp_trend || []).map(t => ({
    name: monthName(parseInt(t.month.split('-')[1])),
    monthKey: t.month,
    gp: parseFloat(t.gp),
    team_avg:   trendMap[t.month]?.avg_gp ?? null,
    team_best:  trendMap[t.month]?.best_gp ?? null,
    team_worst: trendMap[t.month]?.worst_gp ?? null,
  }));

  const saveName = () => {
    const trimmed = nameDraft.trim() || user.name;
    setDisplayName(trimmed);
    localStorage.setItem(storageKey, trimmed);
    setEditingName(false);
  };

  const toggleLine = (key) => setShowLines(s => ({ ...s, [key]: !s[key] }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                className="input text-xl font-bold py-1 px-2 w-56"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
              />
              <button onClick={saveName} className="btn-primary text-xs px-3 py-1">Save</button>
              <button onClick={() => setEditingName(false)} className="btn-secondary text-xs px-3 py-1">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{displayName}'s Dashboard</h1>
              <button onClick={() => { setNameDraft(displayName); setEditingName(true); }} className="text-gray-400 hover:text-brand-600 text-sm" title="Edit name">✎</button>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-0.5">
            {ROLE_LABELS[data.user.role]}{multiplier < 1 ? ` · ${Math.round(multiplier * 100)}% target multiplier` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto text-xs" value={period.month} onChange={e => setPeriod(p => ({ ...p, month: parseInt(e.target.value) }))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
          <select className="input w-auto text-xs" value={period.year} onChange={e => setPeriod(p => ({ ...p, year: parseInt(e.target.value) }))}>
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isPE ? (
          <FlipCard
            labelA="Quarterly GP"
            valueA={formatCurrency(gp.quarterly)}
            subA={`${TIER_LABEL[gp.tier]} · T1: ${t1 ? formatCurrency(t1) : '—'}`}
            colorA={TIER_COLORS[gp.tier]}
            labelB="Yearly GP"
            valueB={formatCurrency(yearlyGP)}
            subB={`Full year ${period.year}`}
            colorB="text-gray-900"
          />
        ) : (
          <FlipCard
            labelA="Monthly GP"
            valueA={formatCurrency(gp.monthly)}
            subA={`${TIER_LABEL[gp.tier]} · T1: ${t1 ? formatCurrency(t1) : '—'}`}
            colorA={TIER_COLORS[gp.tier]}
            labelB="Yearly GP"
            valueB={formatCurrency(yearlyGP)}
            subB={`Full year ${period.year}`}
            colorB="text-gray-900"
          />
        )}
        {['bdm', 'exec_pa'].includes(user.role) && (
          <StatCard label="Net Profit (You)" value={formatCurrency(gp.np)} sub="GP minus salary & costs" color={gp.np >= 0 ? 'text-green-600' : 'text-red-600'} />
        )}
        <StatCard label="Current Clients" value={clients.current} sub={`${clients.pipeline} in pipeline`} />
        <StatCard label="Prospects" value={clients.prospect} sub="In outreach" />
      </div>

      {/* GP vs Team Benchmarks */}
      {benchmarks && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">GP vs Team (This Month)</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Team Best', value: benchmarks.best_gp, color: 'text-green-600' },
              { label: 'Team Average', value: benchmarks.avg_gp, color: 'text-blue-600' },
              { label: 'Team Lowest', value: benchmarks.worst_gp, color: 'text-red-500' },
            ].map(b => (
              <div key={b.label}>
                <div className={`text-lg font-bold ${b.color}`}>{formatCurrency(b.value)}</div>
                <div className="text-xs text-gray-500">{b.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Your GP vs Team Average</span>
              <span>{formatCurrency(gp.monthly)} / {formatCurrency(benchmarks.avg_gp)}</span>
            </div>
            <ProgressBar
              value={gp.monthly}
              max={Math.max(benchmarks.best_gp, gp.monthly, 1)}
              color={gp.monthly >= benchmarks.avg_gp ? 'bg-green-500' : 'bg-yellow-400'}
            />
          </div>
        </div>
      )}

      {/* GP Trend */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">GP Trend — Last 6 Months</h2>
        </div>
        {/* Benchmark line toggles */}
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { key: 'avg',   label: 'Team Avg',    color: '#3b82f6' },
            { key: 'best',  label: 'Team Best',   color: '#22c55e' },
            { key: 'worst', label: 'Team Lowest', color: '#ef4444' },
          ].map(line => (
            <label key={line.key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showLines[line.key]} onChange={() => toggleLine(line.key)} className="rounded" />
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: line.color }} />
                {line.label}
              </span>
            </label>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
              domain={[0, dataMax => Math.ceil(Math.max(dataMax, t3 || t2 || t1 || 1) * 1.1 / 1000) * 1000]}
            />
            <Tooltip content={<GpTrendTooltip />} />
            <Legend />
            {t1 && <ReferenceLine y={t1} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'T1', fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }} />}
            {t2 && <ReferenceLine y={t2} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: 'T2', fontSize: 10, fill: '#3b82f6', position: 'insideTopRight' }} />}
            {t3 && <ReferenceLine y={t3} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'T3', fontSize: 10, fill: '#22c55e', position: 'insideTopRight' }} />}
            <Line type="monotone" dataKey="gp" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} name="Your GP" connectNulls={false} />
            {showLines.avg   && <Line type="monotone" dataKey="team_avg"   stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Team Avg"    connectNulls={false} />}
            {showLines.best  && <Line type="monotone" dataKey="team_best"  stroke="#22c55e" strokeWidth={1.5} dot={false} name="Team Best"   connectNulls={false} />}
            {showLines.worst && <Line type="monotone" dataKey="team_worst" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Team Lowest" connectNulls={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sales Effort */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Current Sales Targets</h2>
          <p className="text-xs text-gray-400 mb-4">Current targets vs latest submitted actuals</p>
          <div className="space-y-4">
            {effortItems.map(item => (
              <div key={item.key}>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-medium">{item.actual} actual / <span className="text-brand-600">{item.target} target</span></span>
                </div>
                <ProgressBar value={item.actual} max={item.target || 1} color={item.actual >= item.target ? 'bg-green-500' : item.color} />
              </div>
            ))}
          </div>
          {!sales_effort.latest && <p className="text-xs text-gray-400 mt-2">No actuals submitted yet.</p>}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sales Effort History</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={effortHistory}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<EffortTooltip />} />
              <Bar dataKey="emails" fill="#f97316" name="Emails" />
              {!isPE && <Bar dataKey="calls" fill="#6366f1" name="Calls" />}
              <Bar dataKey="proposals" fill="#14b8a6" name="Proposals" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Client Pipeline */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Client Pipeline Summary</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Current Clients', value: clients.current, max: currentTargets.max_existing_clients, color: 'bg-teal-500' },
            { label: 'Pipeline', value: clients.pipeline, max: null, color: 'bg-blue-500' },
            { label: 'Prospects', value: clients.prospect, max: currentTargets.max_potential_clients, color: 'bg-purple-500' },
          ].map(c => (
            <div key={c.label}>
              <div className="text-2xl font-bold text-gray-900">{c.value}</div>
              <div className="text-xs text-gray-500">{c.label}</div>
              {c.max && (
                <div className="mt-1">
                  <ProgressBar value={c.value} max={c.max} color={c.color} />
                  <div className="text-xs text-gray-400 mt-0.5">Max: {c.max}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
