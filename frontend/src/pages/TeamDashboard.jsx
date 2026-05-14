import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import api from '../utils/api';
import { formatCurrency, ROLE_LABELS, ROLE_COLORS, TIER_COLORS, monthName, getMonthYear } from '../utils/format';

const MEETING_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtWeekDate(d) {
  if (!d) return '—';
  const dt = new Date(d.split('T')[0] + 'T12:00:00');
  return `${dt.getDate()} ${MEETING_MONTHS[dt.getMonth()]}`;
}

function WeeklyOverview({ members }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/meetings?limit=200')
      .then(r => setMeetings(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const latestByUser = meetings.reduce((acc, m) => {
    if (!acc[m.user_id] || m.week_start > acc[m.user_id].week_start) acc[m.user_id] = m;
    return acc;
  }, {});

  const allWeeks = [...new Set(meetings.map(m => m.week_start))].sort().reverse().slice(0, 6);
  const latestWeek = allWeeks[0];

  if (loading) return <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Weekly Meeting Submissions</h2>
          {latestWeek && <p className="text-xs text-gray-500">Latest week: {fmtWeekDate(latestWeek)}</p>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="text-left py-3 px-4">Member</th>
              <th className="text-left py-3 px-4">Last Submitted</th>
              <th className="text-right py-3 px-4">Current Clients</th>
              <th className="text-right py-3 px-4">Pipeline</th>
              <th className="text-right py-3 px-4">Prospects</th>
              <th className="text-right py-3 px-4">Emails</th>
              <th className="text-right py-3 px-4">Proposals</th>
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map(member => {
              const m = latestByUser[member.id];
              const submittedThisWeek = m && latestWeek && m.week_start === latestWeek;
              const hasSubmitted = !!m;
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900">{member.name}</div>
                    <span className={`badge ${ROLE_COLORS[member.role]} mt-0.5`}>{member.role.toUpperCase()}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{m ? fmtWeekDate(m.week_start) : '—'}</td>
                  <td className="py-3 px-4 text-right font-medium">{m ? m.existing_clients_count : '—'}</td>
                  <td className="py-3 px-4 text-right text-blue-600 font-medium">{m ? m.potential_clients_count : '—'}</td>
                  <td className="py-3 px-4 text-right text-purple-600 font-medium">{m ? (m.prospect_count ?? '—') : '—'}</td>
                  <td className="py-3 px-4 text-right">
                    {m ? (
                      <span className={m.cold_emails_actual >= m.cold_emails_target ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                        {m.cold_emails_actual}/{m.cold_emails_target}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {m ? (
                      <span className={m.proposals_sent_actual >= m.proposals_sent_target ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                        {m.proposals_sent_actual}/{m.proposals_sent_target}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    {!hasSubmitted ? (
                      <span className="badge bg-gray-100 text-gray-500">No submissions</span>
                    ) : submittedThisWeek ? (
                      <span className="badge bg-green-100 text-green-700">This week</span>
                    ) : (
                      <span className="badge bg-amber-100 text-amber-700">Overdue</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Capacity summary */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        {(() => {
          const submitted = members.filter(m => latestByUser[m.id]?.week_start === latestWeek).length;
          const overdue = members.filter(m => latestByUser[m.id] && latestByUser[m.id].week_start !== latestWeek).length;
          const none = members.filter(m => !latestByUser[m.id]).length;
          return [
            { label: 'Submitted this week', val: submitted, color: 'text-green-600' },
            { label: 'Overdue', val: overdue, color: 'text-amber-600' },
            { label: 'Never submitted', val: none, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className="card text-center py-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

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

const GP_MODES = [
  { key: 'monthly',   label: 'This Month',      short: 'Monthly' },
  { key: 'ytd',       label: 'Year-to-Date',     short: 'YTD' },
  { key: 'projected', label: 'Projected Full Yr', short: 'Projected' },
];

function ToggleStat({ label, monthly, ytd, projected, isNP }) {
  const [idx, setIdx] = useState(0);
  const values = { monthly, ytd, projected };
  const v = values[GP_MODES[idx].key];
  const color = isNP ? (v >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900';
  return (
    <div className="card cursor-pointer select-none" onClick={() => setIdx((idx + 1) % GP_MODES.length)}>
      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{formatCurrency(v)}</div>
      <div className="flex gap-1 mt-1.5 flex-wrap">
        {GP_MODES.map((m, i) => (
          <span key={m.key} className={`text-xs px-1.5 py-0.5 rounded ${i === idx ? 'bg-brand-100 text-brand-700 font-medium' : 'text-gray-300'}`}>
            {m.short}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TeamDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { month, year } = getMonthYear();
  const [period, setPeriod] = useState({ month, year });
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('gp');
  const [chartMode, setChartMode] = useState('monthly');
  const [showAvgMonthly, setShowAvgMonthly] = useState(true);
  const [showAvgYtd, setShowAvgYtd] = useState(false);

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
    monthly: m.gp.monthly,
    ytd: m.gp.ytd,
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[{ id: 'gp', label: 'GP Overview' }, { id: 'weekly', label: 'Weekly Meetings' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'weekly' && <WeeklyOverview members={members} />}

      {tab === 'gp' && <>

      {/* Team KPI Summary — toggleable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ToggleStat
          label="Team GP"
          monthly={benchmarks.team_gp}
          ytd={benchmarks.ytd_team_gp}
          projected={benchmarks.projected_team_gp}
        />
        <ToggleStat
          label="Team NP"
          monthly={benchmarks.team_np}
          ytd={benchmarks.ytd_team_np}
          projected={benchmarks.projected_team_np}
          isNP
        />
        <div className="card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Avg Monthly GP</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">{formatCurrency(benchmarks.avg_gp)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Per member (excl. BDM)</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Avg YTD GP</div>
          <div className="text-2xl font-bold mt-1 text-gray-900">{formatCurrency(benchmarks.avg_ytd_gp)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Per member year-to-date</div>
        </div>
      </div>

      {/* GP Bar Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex gap-1">
            {[{ key: 'monthly', label: 'Monthly GP' }, { key: 'ytd', label: 'Overall GP (YTD)' }].map(opt => (
              <button
                key={opt.key}
                onClick={() => setChartMode(opt.key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${chartMode === opt.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showAvgMonthly} onChange={e => setShowAvgMonthly(e.target.checked)} className="rounded" />
              <span className="text-amber-600 font-medium">Avg Monthly</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={showAvgYtd} onChange={e => setShowAvgYtd(e.target.checked)} className="rounded" />
              <span className="text-purple-600 font-medium">Avg YTD</span>
            </label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={gpChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => formatCurrency(v)} />
            {showAvgMonthly && (
              <ReferenceLine y={benchmarks.avg_gp} stroke="#f59e0b" strokeDasharray="4 4"
                label={{ value: 'Avg Mo', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
            )}
            {showAvgYtd && (
              <ReferenceLine y={benchmarks.avg_ytd_gp} stroke="#a855f7" strokeDasharray="4 4"
                label={{ value: 'Avg YTD', fontSize: 10, fill: '#a855f7', position: 'right' }} />
            )}
            <Bar
              dataKey={chartMode}
              fill={chartMode === 'monthly' ? '#0ea5e9' : '#6366f1'}
              radius={[4, 4, 0, 0]}
              name={chartMode === 'monthly' ? 'Monthly GP' : 'YTD GP'}
              onClick={d => {
                const mem = members.find(m => m.name.split(' ')[0] === d.name);
                if (mem) setSelected(mem.id === selected ? null : mem.id);
              }}
            />
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

      </>}
    </div>
  );
}
