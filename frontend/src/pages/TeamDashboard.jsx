import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import api from '../utils/api';
import { formatCurrency, ROLE_LABELS, ROLE_COLORS, TIER_COLORS, monthName, getMonthYear } from '../utils/format';

const TIER_LABEL = { 0: 'Below T1', 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };

function GapBadge({ gap }) {
  return (
    <div className="text-xs bg-red-50 border border-red-100 text-red-700 rounded px-2 py-1">
      <span className="font-medium">{gap.metric}:</span> {typeof gap.actual === 'number' && typeof gap.target === 'number'
        ? `${gap.actual} / ${gap.target}`
        : gap.note || ''}
    </div>
  );
}

export default function TeamDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { month, year } = getMonthYear();
  const [period, setPeriod] = useState({ month, year });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/dashboard/team?month=${period.month}&year=${period.year}`)
      .then(res => { setData(res.data); setSelected(null); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  if (!data) return <div className="text-red-500">Failed to load team data.</div>;

  const { members, benchmarks } = data;

  const gpChartData = members.map(m => ({
    name: m.name.split(' ')[0],
    gp: m.gp.monthly,
    role: m.role,
  }));

  const selectedMember = selected ? members.find(m => m.id === selected) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team Overview</h1>
          <p className="text-sm text-gray-500">Unrestricted team lead view</p>
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

      {/* Team KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Team GP (Month)', value: formatCurrency(benchmarks.team_gp) },
          { label: 'Team NP (Month)', value: formatCurrency(benchmarks.team_np), color: benchmarks.team_np >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Team Average GP', value: formatCurrency(benchmarks.avg_gp) },
          { label: 'Quarterly NP Target', value: formatCurrency(25000), sub: 'Team target' },
        ].map(k => (
          <div key={k.label} className="card">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">{k.label}</div>
            <div className={`text-2xl font-bold mt-1 ${k.color || 'text-gray-900'}`}>{k.value}</div>
            {k.sub && <div className="text-xs text-gray-400">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* GP Bar Chart */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Monthly GP by Member</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={gpChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => formatCurrency(v)} />
            <ReferenceLine y={benchmarks.avg_gp} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Avg', fontSize: 10, fill: '#f59e0b' }} />
            <Bar dataKey="gp" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="GP" onClick={d => {
              const m = members.find(m => m.name.split(' ')[0] === d.name);
              if (m) setSelected(m.id === selected ? null : m.id);
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Member Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {members.map(member => (
          <div
            key={member.id}
            className={`card cursor-pointer transition-all ${selected === member.id ? 'ring-2 ring-brand-500' : 'hover:shadow-md'}`}
            onClick={() => setSelected(member.id === selected ? null : member.id)}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-gray-900">{member.name}</div>
                <span className={`badge ${ROLE_COLORS[member.role]} mt-1`}>{ROLE_LABELS[member.role]}</span>
                {member.multiplier < 1 && (
                  <span className="badge bg-amber-100 text-amber-700 ml-1 mt-1">{Math.round(member.multiplier * 100)}% multiplier</span>
                )}
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${TIER_COLORS[member.gp.tier]}`}>{formatCurrency(member.gp.monthly)}</div>
                <div className="text-xs text-gray-500">{TIER_LABEL[member.gp.tier]}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
              <div><span className="font-semibold text-teal-700">{member.clients.current}</span><div className="text-gray-500">Current</div></div>
              <div><span className="font-semibold text-blue-700">{member.clients.pipeline}</span><div className="text-gray-500">Pipeline</div></div>
              <div><span className="font-semibold text-purple-700">{member.clients.prospect}</span><div className="text-gray-500">Prospects</div></div>
            </div>

            {member.gaps.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-red-600 mb-1">Key Gaps</div>
                <div className="flex flex-wrap gap-1">
                  {member.gaps.map((g, i) => <GapBadge key={i} gap={g} />)}
                </div>
              </div>
            )}

            {member.gaps.length === 0 && (
              <div className="mt-3 text-xs text-green-600 bg-green-50 rounded px-2 py-1">On track — no gaps identified</div>
            )}
          </div>
        ))}
      </div>

      {/* Detailed member view */}
      {selectedMember && (
        <div className="card border-brand-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Detailed View — {selectedMember.name}</h2>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">Close ✕</button>
          </div>

          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">GP Performance</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-gray-600">Monthly GP</span><span className="font-semibold">{formatCurrency(selectedMember.gp.monthly)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Quarterly GP</span><span className="font-semibold">{formatCurrency(selectedMember.gp.quarterly)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Net Profit</span><span className={`font-semibold ${selectedMember.gp.np >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(selectedMember.gp.np)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Tier</span><span className={`font-semibold ${TIER_COLORS[selectedMember.gp.tier]}`}>{TIER_LABEL[selectedMember.gp.tier]}</span></div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Sales Effort (Latest Week)</div>
              {selectedMember.latest_effort ? (
                <div className="space-y-1">
                  {[
                    { label: 'Cold Emails', a: selectedMember.latest_effort.cold_emails_actual, t: selectedMember.adjusted_targets.cold_emails },
                    { label: 'Cold Calls', a: selectedMember.latest_effort.cold_calls_actual, t: selectedMember.adjusted_targets.cold_calls, hide: selectedMember.role === 'pe' },
                    { label: 'Proposals', a: selectedMember.latest_effort.proposals_sent_actual, t: selectedMember.adjusted_targets.proposals_sent },
                    { label: 'New Clients Met', a: selectedMember.latest_effort.new_clients_met_actual, t: selectedMember.adjusted_targets.new_clients_met, hide: selectedMember.role === 'pe' },
                  ].filter(i => !i.hide).map(i => (
                    <div key={i.label} className="flex justify-between">
                      <span className="text-gray-600">{i.label}</span>
                      <span className={`font-semibold ${i.a >= i.t ? 'text-green-600' : 'text-red-500'}`}>{i.a} / {i.t}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-gray-400">No weekly data submitted</div>}
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Gaps & Action Points</div>
              {selectedMember.gaps.length > 0 ? (
                <div className="space-y-1">
                  {selectedMember.gaps.map((g, i) => (
                    <div key={i} className="text-xs bg-red-50 border border-red-100 rounded px-2 py-1.5">
                      <div className="font-semibold text-red-700">{g.metric}</div>
                      <div className="text-red-600">
                        {typeof g.actual === 'number' ? `${typeof g.actual === 'number' && g.metric === 'GP Target' ? formatCurrency(g.actual) : g.actual} vs target ${g.metric === 'GP Target' ? formatCurrency(g.target) : g.target}` : g.note}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-green-600">All metrics on track</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
