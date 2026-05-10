import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';

// ─── KPI helpers (mirrored from backend/src/utils/kpi.js) ───────────────────
const BASE_TARGETS = {
  bde:  { cold_emails: 150, cold_calls: 100, new_clients_met: [1,2,3], proposals: [2,3,5], max_existing: 5, max_potential: 10 },
  sbde: { cold_emails: 150, cold_calls: 100, new_clients_met: [1,2,3], proposals: [2,3,5], max_existing: 5, max_potential: 10 },
  pe:   { cold_emails: 250, cold_calls: 0,   new_clients_met: [0,0,0], proposals: [3,5,7], max_existing: 6, max_potential: 8 },
  spe:  { cold_emails: 250, cold_calls: 0,   new_clients_met: [0,0,0], proposals: [3,5,7], max_existing: 6, max_potential: 8 },
  bdm:  { cold_emails: 0,   cold_calls: 0,   new_clients_met: [0,0,0], proposals: [0,0,0], max_existing: null, max_potential: null },
  exec_pa: { cold_emails: 0, cold_calls: 0,  new_clients_met: [0,0,0], proposals: [0,0,0], max_existing: null, max_potential: null },
};

function getMultiplier(role, tenureMonths) {
  if (!['bda', 'pa'].includes(role)) return 1;
  if (tenureMonths <= 6) return 0;
  if (tenureMonths <= 12) return 0.25;
  if (tenureMonths <= 18) return 0.5;
  if (tenureMonths <= 24) return 0.8;
  return 1;
}

function calcTargets(role, tier, tenureMonths, existingCount, potentialCount) {
  const base = BASE_TARGETS[role] || BASE_TARGETS.bde;
  const multiplier = getMultiplier(role, tenureMonths);
  const tierIdx = Math.max(0, Math.min(2, (tier || 1) - 1));

  // More clients on hand = less cold outreach needed (inverse relationship)
  const maxExisting = base.max_existing || 5;
  const maxPotential = base.max_potential || 10;
  const loadFactor = Math.min(1,
    (existingCount / maxExisting) * 0.7 + (potentialCount / maxPotential) * 0.3
  );
  const reduction = Math.max(0.25, 1 - loadFactor * 0.75);

  return {
    cold_emails:     Math.round(base.cold_emails * reduction * multiplier),
    cold_calls:      Math.round(base.cold_calls  * reduction * multiplier),
    new_clients_met: Math.round((base.new_clients_met[tierIdx] || 0) * multiplier),
    proposals_sent:  Math.round((base.proposals[tierIdx]       || 0) * multiplier),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LIST_TYPES  = ['current', 'pipeline', 'prospect'];
const LIST_LABELS = { current: 'Current Clients', pipeline: 'Pipeline', prospect: 'Prospects' };
const LIST_COLORS = { current: 'bg-teal-50 border-teal-200', pipeline: 'bg-brand-50 border-brand-200', prospect: 'bg-purple-50 border-purple-200' };
const LIST_BADGE  = { current: 'bg-teal-100 text-teal-700', pipeline: 'bg-brand-100 text-brand-700', prospect: 'bg-purple-100 text-purple-700' };

const EMPTY_CLIENT = { company_name: '', contact_person: '', list_type: 'prospect', event_date: '', estimated_value: '', notes: '' };

function getThisMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

// ─── Client modal ─────────────────────────────────────────────────────────────
function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState(client ? { ...client, event_date: client.event_date?.split('T')[0] || '' } : EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null };
      client?.id ? await api.put(`/clients/${client.id}`, payload) : await api.post('/clients', payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">{client?.id ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Company Name</label>
            <input className="input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input className="input" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
          </div>
          <div>
            <label className="label">List Type</label>
            <select className="input" value={form.list_type} onChange={e => setForm(f => ({ ...f, list_type: e.target.value }))}>
              {LIST_TYPES.map(t => <option key={t} value={t}>{LIST_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Event Date (if applicable)</label>
            <input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </div>
          <div>
            <label className="label">Estimated Value ($)</label>
            <input type="number" className="input" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: e.target.value }))} min="0" step="0.01" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Weekly meeting section ───────────────────────────────────────────────────
function WeeklyMeetingSection({ clientCounts }) {
  const { user } = useAuth();
  const weekStart = getThisMonday();
  const [dashData, setDashData] = useState(null);
  const [form, setForm] = useState({ action_items: '', cold_emails_actual: '', cold_calls_actual: '', new_clients_met_actual: '', proposals_sent_actual: '' });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/dashboard/individual/${user.id}`).then(r => setDashData(r.data)).catch(console.error);
    api.get(`/meetings/week/${weekStart}`).then(r => {
      const d = r.data;
      setForm(f => ({
        ...f,
        action_items: d.action_items || '',
        cold_emails_actual: d.cold_emails_actual ?? '',
        cold_calls_actual: d.cold_calls_actual ?? '',
        new_clients_met_actual: d.new_clients_met_actual ?? '',
        proposals_sent_actual: d.proposals_sent_actual ?? '',
      }));
    }).catch(() => {});
    api.get('/meetings?limit=8').then(r => setHistory(r.data)).catch(console.error);
  }, [user.id, weekStart]);

  const targets = dashData ? calcTargets(
    user.role,
    dashData.gp?.tier || 0,
    dashData.user?.tenure_months || 0,
    clientCounts.current,
    clientCounts.pipeline + clientCounts.prospect,
  ) : null;

  const isPE = ['pe', 'spe'].includes(user.role);
  const isAssistant = ['bda', 'pa'].includes(user.role);
  const hasNoTargets = ['bdm', 'exec_pa'].includes(user.role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await api.post('/meetings', {
        week_start: weekStart,
        action_items: form.action_items,
        cold_emails_target:     targets?.cold_emails || 0,
        cold_emails_actual:     parseInt(form.cold_emails_actual) || 0,
        cold_calls_target:      targets?.cold_calls || 0,
        cold_calls_actual:      parseInt(form.cold_calls_actual) || 0,
        new_clients_met_target: targets?.new_clients_met || 0,
        new_clients_met_actual: parseInt(form.new_clients_met_actual) || 0,
        proposals_sent_target:  targets?.proposals_sent || 0,
        proposals_sent_actual:  parseInt(form.proposals_sent_actual) || 0,
        existing_clients_count:  clientCounts.current,
        potential_clients_count: clientCounts.pipeline + clientCounts.prospect,
      });
      setSuccess(true);
      api.get('/meetings?limit=8').then(r => setHistory(r.data)).catch(console.error);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) });

  const MetricRow = ({ label, targetVal, actualKey }) => {
    const actual = parseInt(form[actualKey]) || 0;
    const hit = targetVal > 0 && actual >= targetVal;
    const pct = targetVal > 0 ? Math.min(100, Math.round((actual / targetVal) * 100)) : 0;
    return (
      <div className="flex items-center gap-4 py-3 border-b last:border-0">
        <div className="w-36 text-sm text-gray-700">{label}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">Target: <span className="font-semibold text-gray-700">{targetVal ?? '—'}</span></span>
            {targetVal > 0 && <span className={`text-xs font-medium ${hit ? 'text-green-600' : 'text-red-500'}`}>({pct}%)</span>}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${hit ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="w-28">
          <input
            type="number"
            min="0"
            className="input text-sm text-center"
            placeholder="Actual"
            {...f(actualKey)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Weekly Meeting</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Week of {new Date(weekStart).toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {hasNoTargets ? (
        <div className="card text-sm text-gray-500 text-center py-6">Weekly effort tracking is for BD and Project team members.</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Client snapshot */}
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Current Client Load (from your lists)</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Current Clients', val: clientCounts.current, color: 'text-teal-700' },
                { label: 'Pipeline',        val: clientCounts.pipeline, color: 'text-brand-600' },
                { label: 'Prospects',       val: clientCounts.prospect, color: 'text-purple-700' },
              ].map(c => (
                <div key={c.label}>
                  <div className={`text-2xl font-bold ${c.color}`}>{c.val}</div>
                  <div className="text-xs text-gray-500">{c.label}</div>
                </div>
              ))}
            </div>
            {isAssistant && dashData && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded px-3 py-1.5">
                Targets adjusted with {Math.round(dashData.user.multiplier * 100)}% multiplier based on your tenure ({dashData.user.tenure_months} months)
              </p>
            )}
          </div>

          {/* Sales Effort Matrix */}
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sales Effort — Last Week Actuals</h3>
            <p className="text-xs text-gray-400 mb-3">Targets are auto-set based on your role and current client load. Enter what you actually achieved last week.</p>
            {!targets ? (
              <div className="text-xs text-gray-400">Loading targets...</div>
            ) : (
              <div>
                <MetricRow label="Cold Emails"    targetVal={targets.cold_emails}     actualKey="cold_emails_actual" />
                {!isPE && <MetricRow label="Cold Calls"     targetVal={targets.cold_calls}      actualKey="cold_calls_actual" />}
                <MetricRow label="Proposals Sent" targetVal={targets.proposals_sent}  actualKey="proposals_sent_actual" />
                {!isPE && <MetricRow label="New Clients Met" targetVal={targets.new_clients_met} actualKey="new_clients_met_actual" />}
              </div>
            )}
          </div>

          {/* Action Items */}
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">This Week's Action Items</h3>
            <textarea
              className="input"
              rows={5}
              placeholder={"e.g.\n- Meet ABC Corp on Tuesday to discuss event brief\n- Send proposal to XYZ by Wednesday\n- Follow up with 3 pipeline clients\n- Cold email 30 new F&B companies"}
              {...f('action_items')}
            />
          </div>

          {error   && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>}
          {success && <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">Meeting data saved successfully!</div>}
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Submit Weekly Meeting Data'}</button>
        </form>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Past Submissions</h3>
          <div className="space-y-2">
            {history.map(m => (
              <div key={m.id} className="border border-gray-100 rounded-lg p-3 text-xs">
                <div className="font-semibold text-gray-700 mb-1">Week of {new Date(m.week_start).toLocaleDateString('en-SG')}</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-gray-600">
                  {[
                    { l: 'Emails',    a: m.cold_emails_actual,     t: m.cold_emails_target },
                    !isPE && { l: 'Calls',     a: m.cold_calls_actual,      t: m.cold_calls_target },
                    { l: 'Proposals', a: m.proposals_sent_actual,  t: m.proposals_sent_target },
                    !isPE && { l: 'New Met',   a: m.new_clients_met_actual, t: m.new_clients_met_target },
                  ].filter(Boolean).map(item => (
                    <div key={item.l}>
                      <span className="text-gray-400">{item.l}: </span>
                      <span className={item.a >= item.t ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{item.a}/{item.t}</span>
                    </div>
                  ))}
                </div>
                {m.action_items && <div className="text-gray-400 mt-1 italic line-clamp-1">{m.action_items}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Clients() {
  const { user } = useAuth();
  const [tab, setTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [listFilter, setListFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = listFilter ? `?list_type=${listFilter}` : '';
    api.get(`/clients${params}`)
      .then(r => setClients(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [listFilter]);

  useEffect(load, [load]);

  const grouped = LIST_TYPES.reduce((acc, t) => {
    acc[t] = clients.filter(c => c.list_type === t);
    return acc;
  }, {});

  const clientCounts = {
    current:  grouped.current.length,
    pipeline: grouped.pipeline.length,
    prospect: grouped.prospect.length,
  };

  const remove = async (id) => {
    if (!confirm('Remove this client?')) return;
    try { await api.delete(`/clients/${id}`); load(); } catch {}
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Clients & Activity</h1>
        {tab === 'clients' && (
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary text-sm">+ Add Client</button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: 'clients', label: '👥 Client Pipeline' },
          { key: 'meeting', label: '📅 Weekly Meeting' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-brand-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'clients' && (
        <>
          {/* List type filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setListFilter('')} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!listFilter ? 'bg-brand-600 text-white border-brand-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              All ({clients.length})
            </button>
            {LIST_TYPES.map(t => (
              <button key={t} onClick={() => setListFilter(t)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${listFilter === t ? 'bg-brand-600 text-white border-brand-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {LIST_LABELS[t]} ({grouped[t]?.length || 0})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {LIST_TYPES.filter(t => !listFilter || listFilter === t).map(type => (
                <div key={type} className={`border rounded-xl p-4 ${LIST_COLORS[type]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-800">{LIST_LABELS[type]}</h2>
                    <span className={`badge ${LIST_BADGE[type]}`}>{grouped[type].length}</span>
                  </div>
                  <div className="space-y-2">
                    {grouped[type].length === 0 && <div className="text-xs text-gray-400 text-center py-4">No entries</div>}
                    {grouped[type].map(c => (
                      <div key={c.id} className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{c.company_name}</div>
                            {c.contact_person && <div className="text-xs text-gray-500">{c.contact_person}</div>}
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            <button onClick={() => { setEditing(c); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">✕</button>
                          </div>
                        </div>
                        {c.event_date && (
                          <div className="text-xs text-gray-500 mt-1">
                            Event: {new Date(c.event_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                        {c.estimated_value && <div className="text-xs text-green-700 mt-0.5">Est. {formatCurrency(c.estimated_value)}</div>}
                        {c.notes && <div className="text-xs text-gray-400 mt-1 italic line-clamp-2">{c.notes}</div>}
                        {['bdm', 'exec_pa'].includes(user.role) && c.member_name && (
                          <div className="text-xs text-brand-600 mt-1 font-medium">{c.member_name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'meeting' && (
        <WeeklyMeetingSection clientCounts={clientCounts} />
      )}

      {showModal && (
        <ClientModal
          client={editing}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
