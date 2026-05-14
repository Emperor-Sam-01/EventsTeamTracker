import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

function getMonday(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff - offsetWeeks * 7);
  return d.toISOString().split('T')[0];
}

function fmtWeekLabel(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const thisMonday = getMonday(0);
  const lastMonday = getMonday(1);
  if (dateStr === thisMonday) return `This week (${dt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })})`;
  if (dateStr === lastMonday) return `Last week (${dt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })})`;
  return `2 weeks ago (${dt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })})`;
}

const EMPTY_FORM = {
  action_items: '',
  cold_emails_target: '', cold_emails_actual: '',
  cold_calls_target: '', cold_calls_actual: '',
  new_clients_met_target: '', new_clients_met_actual: '',
  proposals_sent_target: '', proposals_sent_actual: '',
  existing_clients_count: '', potential_clients_count: '',
};

export default function WeeklyMeeting() {
  const { user } = useAuth();
  const weekOptions = [getMonday(0), getMonday(1), getMonday(2)];
  const [weekStart, setWeekStart] = useState(weekOptions[0]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    setForm(EMPTY_FORM);
    setSuccess(false);
    api.get(`/meetings/week/${weekStart}`).then(r => {
      const d = r.data;
      setForm({
        action_items: d.action_items || '',
        cold_emails_target: d.cold_emails_target ?? '',
        cold_emails_actual: d.cold_emails_actual ?? '',
        cold_calls_target: d.cold_calls_target ?? '',
        cold_calls_actual: d.cold_calls_actual ?? '',
        new_clients_met_target: d.new_clients_met_target ?? '',
        new_clients_met_actual: d.new_clients_met_actual ?? '',
        proposals_sent_target: d.proposals_sent_target ?? '',
        proposals_sent_actual: d.proposals_sent_actual ?? '',
        existing_clients_count: d.existing_clients_count ?? '',
        potential_clients_count: d.potential_clients_count ?? '',
      });
    }).catch(() => {});

    api.get('/meetings?limit=8').then(r => setHistory(r.data)).catch(console.error).finally(() => setLoadingHistory(false));
  }, [weekStart]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await api.post('/meetings', { week_start: weekStart, ...form });
      setSuccess(true);
      api.get('/meetings?limit=8').then(r => setHistory(r.data)).catch(console.error);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const isPE = user.role === 'pe' || user.role === 'spe';

  const f = (key) => ({ value: form[key], onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value })) });

  const EffortRow = ({ label, targetKey, actualKey }) => (
    <tr>
      <td className="py-2 pr-3 text-sm text-gray-700">{label}</td>
      <td className="py-1 px-1"><input type="number" className="input text-xs w-24" placeholder="Target" min="0" {...f(targetKey)} /></td>
      <td className="py-1 px-1"><input type="number" className="input text-xs w-24" placeholder="Actual" min="0" {...f(actualKey)} /></td>
      <td className="py-1 pl-2 text-xs text-gray-400">
        {form[actualKey] !== '' && form[targetKey] !== '' && (
          <span className={parseFloat(form[actualKey]) >= parseFloat(form[targetKey]) ? 'text-green-600' : 'text-red-500'}>
            {Math.round((parseFloat(form[actualKey]) / parseFloat(form[targetKey])) * 100)}%
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Weekly Meeting</h1>
          <p className="text-sm text-gray-500">Submitting for week of {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div>
          <label className="label text-xs text-gray-500 mb-1">Submitting for</label>
          <select className="input w-auto text-sm" value={weekStart} onChange={e => setWeekStart(e.target.value)}>
            {weekOptions.map(w => (
              <option key={w} value={w}>{fmtWeekLabel(w)}</option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Sales Effort Matrix */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Sales Effort Matrix</h2>
          <p className="text-xs text-gray-500 mb-3">Enter last week's actuals and this week's targets.</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left pb-2 pr-3">Metric</th>
                  <th className="pb-2 px-1 text-center">This Week Target</th>
                  <th className="pb-2 px-1 text-center">Last Week Actual</th>
                  <th className="pb-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                <EffortRow label="Cold Emails" targetKey="cold_emails_target" actualKey="cold_emails_actual" />
                {!isPE && <EffortRow label="Cold Calls" targetKey="cold_calls_target" actualKey="cold_calls_actual" />}
                <EffortRow label="Proposals Sent" targetKey="proposals_sent_target" actualKey="proposals_sent_actual" />
                {!isPE && <EffortRow label="New Clients Met" targetKey="new_clients_met_target" actualKey="new_clients_met_actual" />}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
            <div>
              <label className="label">Current Clients Count</label>
              <input type="number" className="input" min="0" placeholder="How many active clients?" {...f('existing_clients_count')} />
            </div>
            <div>
              <label className="label">Potential Clients Count</label>
              <input type="number" className="input" min="0" placeholder="How many in pipeline + prospect?" {...f('potential_clients_count')} />
            </div>
          </div>
        </div>

        {/* Action Items */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Weekly Action Items</h2>
          <p className="text-xs text-gray-500 mb-2">List your planned activities for this week (meetings, proposals to complete, follow-ups, etc.)</p>
          <textarea
            className="input"
            rows={6}
            placeholder={"e.g.\n- Meet ABC Corp on Tuesday to discuss event brief\n- Send proposal to XYZ by Wednesday\n- Follow up with 3 pipeline clients\n- Cold email 30 new F&B companies"}
            {...f('action_items')}
          />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>}
        {success && <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">Meeting data saved successfully!</div>}

        <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Submit Weekly Meeting Data'}</button>
      </form>

      {/* History */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Past Meetings</h2>
        {loadingHistory ? (
          <div className="text-xs text-gray-400">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-xs text-gray-400">No past meetings yet.</div>
        ) : (
          <div className="space-y-3">
            {history.map(m => (
              <div key={m.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">Week of {new Date(m.week_start).toLocaleDateString('en-SG')}</div>
                  {user.role === 'bdm' && <div className="text-xs text-brand-600">{m.member_name}</div>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                  {[
                    { l: 'Emails', a: m.cold_emails_actual, t: m.cold_emails_target },
                    !isPE && { l: 'Calls', a: m.cold_calls_actual, t: m.cold_calls_target },
                    { l: 'Proposals', a: m.proposals_sent_actual, t: m.proposals_sent_target },
                    !isPE && { l: 'New Met', a: m.new_clients_met_actual, t: m.new_clients_met_target },
                  ].filter(Boolean).map(item => (
                    <div key={item.l}>
                      <span className="text-gray-400">{item.l}: </span>
                      <span className={item.a >= item.t ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{item.a}/{item.t}</span>
                    </div>
                  ))}
                </div>
                {m.action_items && <div className="text-xs text-gray-500 mt-2 italic whitespace-pre-line line-clamp-2">{m.action_items}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
