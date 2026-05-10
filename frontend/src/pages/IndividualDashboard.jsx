import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, CartesianGrid, Legend } from 'recharts';
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

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function IndividualDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [loading, setLoading] = useState(true);
  const { month, year } = getMonthYear();
  const [period, setPeriod] = useState({ month, year });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/dashboard/individual/${user.id}?month=${period.month}&year=${period.year}`),
      api.get(`/dashboard/benchmarks?month=${period.month}&year=${period.year}`),
    ])
      .then(([d, b]) => { setData(d.data); setBenchmarks(b.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.id, period]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  if (!data) return <div className="text-red-500">Failed to load dashboard.</div>;

  const { gp, clients, sales_effort, gp_trend } = data;
  const gpTarget = gp.targets ? (data.user.role === 'pe' ? gp.targets.t1 * data.user.multiplier : gp.targets.t1 * data.user.multiplier) : 0;
  const gpDisplay = data.user.role === 'pe' ? gp.quarterly : gp.monthly;
  const gpLabel = data.user.role === 'pe' ? 'Quarterly GP' : 'Monthly GP';

  const effortHistory = (sales_effort.history || []).map(e => ({
    week: e.week_start?.slice(5),
    emails: e.cold_emails_actual,
    calls: e.cold_calls_actual,
    proposals: e.proposals_sent_actual,
    meetings: e.new_clients_met_actual,
  })).reverse();

  const effortItems = [
    { key: 'cold_emails', label: 'Cold Emails', actual: sales_effort.latest?.cold_emails_actual ?? 0, target: sales_effort.targets?.cold_emails, color: 'bg-blue-500' },
    { key: 'cold_calls', label: 'Cold Calls', actual: sales_effort.latest?.cold_calls_actual ?? 0, target: sales_effort.targets?.cold_calls, color: 'bg-indigo-500', hide: data.user.role === 'pe' },
    { key: 'proposals_sent', label: 'Proposals Sent', actual: sales_effort.latest?.proposals_sent_actual ?? 0, target: sales_effort.targets?.proposals_sent, color: 'bg-teal-500' },
    { key: 'new_clients_met', label: 'New Clients Met', actual: sales_effort.latest?.new_clients_met_actual ?? 0, target: sales_effort.targets?.new_clients_met, color: 'bg-purple-500', hide: data.user.role === 'pe' },
  ].filter(i => !i.hide);

  const gpTrendData = (gp_trend || []).map(t => ({
    name: monthName(parseInt(t.month.split('-')[1])),
    gp: parseFloat(t.gp),
    target: gpTarget,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-sm text-gray-500">{ROLE_LABELS[data.user.role]} · Tenure: {data.user.tenure_months} months{data.user.multiplier < 1 ? ` · ${Math.round(data.user.multiplier * 100)}% target multiplier` : ''}</p>
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
        <StatCard
          label={gpLabel}
          value={formatCurrency(gpDisplay)}
          sub={`${TIER_LABEL[gp.tier]} · Target: ${formatCurrency(gpTarget)}`}
          color={TIER_COLORS[gp.tier]}
        />
        <StatCard label="Net Profit (You)" value={formatCurrency(gp.np)} sub="GP minus salary & costs" color={gp.np >= 0 ? 'text-green-600' : 'text-red-600'} />
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
        <h2 className="text-sm font-semibold text-gray-700 mb-4">GP Trend (Last 6 Months)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={gpTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend />
            <ReferenceLine y={gpTarget} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Target', fontSize: 11, fill: '#f59e0b' }} />
            <Line type="monotone" dataKey="gp" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 4 }} name="Your GP" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sales Effort */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sales Effort — Latest Week</h2>
          <div className="space-y-4">
            {effortItems.map(item => (
              <div key={item.key}>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-medium">{item.actual} / {item.target} target</span>
                </div>
                <ProgressBar value={item.actual} max={item.target || 1} color={item.actual >= item.target ? 'bg-green-500' : item.color} />
              </div>
            ))}
          </div>
          {!sales_effort.latest && <p className="text-xs text-gray-400 mt-2">No data submitted yet for current week.</p>}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Sales Effort History</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={effortHistory}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="emails" fill="#0ea5e9" name="Emails" />
              {data.user.role !== 'pe' && <Bar dataKey="calls" fill="#6366f1" name="Calls" />}
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
            { label: 'Current Clients', value: clients.current, max: sales_effort.targets?.max_existing_clients, color: 'bg-teal-500' },
            { label: 'Pipeline', value: clients.pipeline, max: null, color: 'bg-blue-500' },
            { label: 'Prospects', value: clients.prospect, max: sales_effort.targets?.max_potential_clients, color: 'bg-purple-500' },
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
