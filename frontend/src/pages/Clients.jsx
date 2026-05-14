import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';
import { EVENT_TYPES } from '../utils/constants';

// ─── KPI helpers ──────────────────────────────────────────────────────────────
const BASE_TARGETS = {
  bde:  { cold_emails:150, cold_calls:100, new_clients_met:[1,2,3], proposals:[2,3,5], max_existing:5, max_potential:10 },
  sbde: { cold_emails:150, cold_calls:100, new_clients_met:[1,2,3], proposals:[2,3,5], max_existing:5, max_potential:10 },
  pe:   { cold_emails:250, cold_calls:0,   new_clients_met:[0,0,0], proposals:[3,5,7], max_existing:6, max_potential:8 },
  spe:  { cold_emails:250, cold_calls:0,   new_clients_met:[0,0,0], proposals:[3,5,7], max_existing:6, max_potential:8 },
  bdm:  { cold_emails:0, cold_calls:0, new_clients_met:[0,0,0], proposals:[0,0,0], max_existing:null, max_potential:null },
  exec_pa: { cold_emails:0, cold_calls:0, new_clients_met:[0,0,0], proposals:[0,0,0], max_existing:null, max_potential:null },
};
function getMultiplier(role, tenureMonths) {
  if (!['bda','pa'].includes(role)) return 1;
  if (tenureMonths<=6) return 0; if (tenureMonths<=12) return 0.25;
  if (tenureMonths<=18) return 0.5; if (tenureMonths<=24) return 0.8; return 1;
}
function calcTargets(role, tier, tenureMonths, existingCount, potentialCount) {
  const base = BASE_TARGETS[role] || BASE_TARGETS.bde;
  const multiplier = getMultiplier(role, tenureMonths);
  const tierIdx = Math.max(0, Math.min(2, (tier||1)-1));
  const maxE = base.max_existing||5, maxP = base.max_potential||10;
  const load = Math.min(1,(existingCount/maxE)*0.7+(potentialCount/maxP)*0.3);
  const reduction = Math.max(0.25, 1-load*0.75);
  return {
    cold_emails:     Math.round(base.cold_emails*reduction*multiplier),
    cold_calls:      Math.round(base.cold_calls*reduction*multiplier),
    new_clients_met: Math.round((base.new_clients_met[tierIdx]||0)*multiplier),
    proposals_sent:  Math.round((base.proposals[tierIdx]||0)*multiplier),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LIST_TYPES  = ['current','pipeline','prospect','lost','completed'];
const LIST_LABELS = { current:'Current Clients', pipeline:'Pipeline', prospect:'Prospects', lost:'Lost', completed:'Completed' };
const LIST_COLORS = {
  current:   'bg-teal-50 border-teal-200',
  pipeline:  'bg-brand-50 border-brand-200',
  prospect:  'bg-purple-50 border-purple-200',
  lost:      'bg-gray-50 border-gray-300',
  completed: 'bg-green-50 border-green-200',
};
const LIST_BADGE  = {
  current:   'bg-teal-100 text-teal-700',
  pipeline:  'bg-brand-100 text-brand-700',
  prospect:  'bg-purple-100 text-purple-700',
  lost:      'bg-gray-200 text-gray-600',
  completed: 'bg-green-100 text-green-700',
};

const EMPTY_CLIENT = {
  company_name:'', project_name:'', project_type:'',
  contact_name:'', contact_details:'',
  list_type:'prospect', event_date:'',
  estimated_revenue:'', estimated_gp:'', google_link:'', notes:'',
};

function getLastMonday() {
  const d = new Date();
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() + toMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  return lastMonday.toISOString().split('T')[0];
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.split('T')[0] + 'T12:00:00');
  return `${d.getDate()} ${d.toLocaleString('en-SG', { month: 'short' })}`;
}

// ─── MetricRow: defined OUTSIDE parent to prevent focus loss on re-render ─────
function MetricRow({ label, targetVal, actualVal, onChange }) {
  const hit = targetVal > 0 && parseInt(actualVal || 0) >= targetVal;
  const pct = targetVal > 0 ? Math.min(100, Math.round(((parseInt(actualVal || 0)) / targetVal) * 100)) : 0;
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <div className="w-36 text-sm text-gray-700 shrink-0">{label}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-500">Target: <span className="font-semibold text-gray-700">{targetVal ?? '—'}</span></span>
          {targetVal > 0 && <span className={`text-xs font-medium ${hit ? 'text-green-600' : 'text-red-500'}`}>({pct}%)</span>}
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full transition-all ${hit ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="w-28 shrink-0">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="input text-sm text-center"
          placeholder="Actual"
          value={actualVal}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Client modal ─────────────────────────────────────────────────────────────
function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState(client
    ? { ...EMPTY_CLIENT, ...client, event_date: client.event_date?.split('T')[0]||'', google_link: client.google_link||'' }
    : EMPTY_CLIENT
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        estimated_revenue: form.estimated_revenue ? parseFloat(form.estimated_revenue) : null,
        estimated_gp:      form.estimated_gp      ? parseFloat(form.estimated_gp)      : null,
      };
      client?.id ? await api.put(`/clients/${client.id}`, payload) : await api.post('/clients', payload);
      onSave();
    } catch(err) { setError(err.response?.data?.error||'Failed to save'); }
    finally { setSaving(false); }
  };

  const f = key => ({ value: form[key]||'', onChange: e => setForm(p=>({...p,[key]:e.target.value})) });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">{client?.id ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Company Name <span className="text-red-500">*</span></label>
            <input className="input" {...f('company_name')} required />
          </div>
          <div>
            <label className="label">Project Name <span className="text-red-500">*</span></label>
            <input className="input" placeholder="e.g. ABC Corp Annual D&D 2026" {...f('project_name')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">List Type <span className="text-red-500">*</span></label>
              <select className="input" value={form.list_type} onChange={e=>setForm(p=>({...p,list_type:e.target.value}))}>
                <option value="prospect">Prospect</option>
                <option value="pipeline">Pipeline</option>
              </select>
            </div>
            <div>
              <label className="label">Project Type <span className="text-red-500">*</span></label>
              <select className="input" {...f('project_type')} required>
                <option value="">Select type...</option>
                {EVENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Person Name <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Full name" {...f('contact_name')} required />
            </div>
            <div>
              <label className="label">Contact Details <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Email or phone" {...f('contact_details')} required />
            </div>
          </div>
          <div>
            <label className="label">Event Date (if known)</label>
            <input type="date" className="input" {...f('event_date')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estimated Revenue ($) <span className="text-red-500">*</span></label>
              <input type="number" className="input" min="0" step="0.01" {...f('estimated_revenue')} required />
            </div>
            <div>
              <label className="label">Estimated Cost ($) <span className="text-red-500">*</span></label>
              <input type="number" className="input" min="0" step="0.01" {...f('estimated_gp')} required />
            </div>
          </div>
          {form.list_type === 'pipeline' && (
            <div>
              <label className="label">Project Google Drive Link / Xero Quote No.</label>
              <input className="input" placeholder="https://drive.google.com/... or Xero quote number" {...f('google_link')} />
            </div>
          )}
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} {...f('notes')} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving?'Saving...':'Save'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Convert Prospect to Pipeline modal ──────────────────────────────────────
function ConvertToPipelineModal({ client, onSave, onClose }) {
  const [googleLink, setGoogleLink] = useState(client.google_link || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.put(`/clients/${client.id}`, { list_type: 'pipeline', google_link: googleLink });
      onSave();
    } catch(err) { setError(err.response?.data?.error||'Failed to update'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-900">Move to Pipeline</h2>
          <p className="text-xs text-gray-500 mt-0.5">Moving <strong>{client.company_name}</strong> from Prospects to Pipeline.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Project Google Drive Link / Xero Quote No.</label>
            <input
              className="input"
              placeholder="https://drive.google.com/... or Xero quote number"
              value={googleLink}
              onChange={e => setGoogleLink(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving?'Moving...':'Move to Pipeline'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Convert Pipeline to Lost modal ──────────────────────────────────────────
function ConvertToLostModal({ client, onSave, onClose }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Please provide a reason for the loss.'); return; }
    setSaving(true); setError('');
    try {
      await api.put(`/clients/${client.id}`, { list_type: 'lost', loss_reason: reason.trim() });
      onSave();
    } catch(err) { setError(err.response?.data?.error||'Failed to update'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-900">Mark as Lost</h2>
          <p className="text-xs text-gray-500 mt-0.5">Moving <strong>{client.company_name}</strong> to Lost.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Reason for Loss <span className="text-red-500">*</span></label>
            <textarea
              className="input"
              rows={4}
              placeholder="e.g. Client chose a competitor, budget constraints, event cancelled..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 bg-red-600 hover:bg-red-700">{saving?'Saving...':'Mark as Lost'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Convert Pipeline to Current Client modal ─────────────────────────────────
function ConvertModal({ client, onSave, onClose }) {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [form, setForm] = useState({
    title: client.project_name || `${client.company_name} — ${client.project_type||'Event'}`,
    client_name: client.company_name,
    project_type: client.project_type || '',
    event_date: client.event_date?.split('T')[0] || '',
    confirmation_date: '',
    revenue: client.estimated_revenue || '',
    cost: client.estimated_gp || '',
    status: 'confirmed',
    project_google_link: client.google_link || '',
    notes: client.notes || '',
    crew: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/users').then(r => setAllUsers(r.data.filter(u => u.is_active !== false && u.role !== 'exec_pa'))).catch(console.error);
  }, []);

  const gp = (parseFloat(form.revenue)||0) - (parseFloat(form.cost)||0);
  const allocatedGP = form.crew.reduce((s,c)=>s+parseFloat(c.gp_allocated||0),0);

  const addCrewMember = () => setForm(f=>({...f, crew:[...f.crew,{user_id:'',gp_allocated:'',is_lead:false}]}));
  const updateCrew = (i, key, val) => setForm(f=>{
    const crew=[...f.crew]; crew[i]={...crew[i],[key]:val}; return {...f,crew};
  });
  const removeCrew = (i) => setForm(f=>({...f,crew:f.crew.filter((_,idx)=>idx!==i)}));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const validCrew = form.crew.filter(c=>c.user_id);
      const payload = {
        ...form,
        revenue: parseFloat(form.revenue),
        cost:    parseFloat(form.cost),
        crew: validCrew.length > 0 ? validCrew.map(c=>({
          user_id: parseInt(c.user_id),
          gp_allocated: parseFloat(c.gp_allocated)||0,
          is_lead: c.is_lead,
        })) : [],
      };
      await api.post('/projects', payload);
      await api.put(`/clients/${client.id}`, { list_type: 'current' });
      onSave();
    } catch(err) { setError(err.response?.data?.error||'Failed to convert'); }
    finally { setSaving(false); }
  };

  const f = key => ({ value: form[key]||'', onChange: e=>setForm(p=>({...p,[key]:e.target.value})) });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-900">Convert to Current Client</h2>
          <p className="text-xs text-gray-500 mt-0.5">Confirm project details to move <strong>{client.company_name}</strong> to Current Clients.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Project Title</label>
            <input className="input" {...f('title')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Project Type</label>
              <select className="input" {...f('project_type')}>
                <option value="">Select type...</option>
                {EVENT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date of Confirmation</label>
              <input type="date" className="input" {...f('confirmation_date')} />
            </div>
            <div>
              <label className="label">Event Date</label>
              <input type="date" className="input" {...f('event_date')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Revenue ($)</label>
              <input type="number" className="input" min="0" step="0.01" {...f('revenue')} required />
            </div>
            <div>
              <label className="label">Cost ($)</label>
              <input type="number" className="input" min="0" step="0.01" {...f('cost')} required />
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-2 flex justify-between items-center">
            <span className="text-sm text-gray-600">Gross Profit</span>
            <span className={`text-lg font-bold ${gp>=0?'text-green-600':'text-red-600'}`}>{formatCurrency(gp)}</span>
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-800">GP Distribution — if any</div>
                <div className="text-xs text-gray-400">You are the Project Lead. Optionally split GP with Event Crew.</div>
              </div>
              <button type="button" onClick={addCrewMember} className="text-xs text-brand-600 hover:underline">+ Add Crew</button>
            </div>
            <div className="space-y-2">
              {form.crew.map((member, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="input flex-1 text-xs"
                    value={member.user_id}
                    onChange={e=>updateCrew(i,'user_id',e.target.value)}
                  >
                    <option value="">Select member...</option>
                    {allUsers.filter(u=>u.id!==user.id).map(u=>(
                      <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>
                    ))}
                  </select>
                  <input
                    type="text" inputMode="numeric"
                    placeholder="GP $"
                    className="input w-28 text-xs"
                    value={member.gp_allocated}
                    onChange={e=>updateCrew(i,'gp_allocated',e.target.value)}
                  />
                  <button type="button" onClick={()=>removeCrew(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              ))}
            </div>
            {form.crew.length > 0 && (
              <div className={`text-xs mt-2 ${allocatedGP>gp?'text-red-600':'text-gray-500'}`}>
                Allocated: {formatCurrency(allocatedGP)} / {formatCurrency(gp)} total GP
                {allocatedGP > gp && ' — over-allocated!'}
              </div>
            )}
          </div>

          <div>
            <label className="label">Project Google Drive Link / Xero Quote No.</label>
            <input className="input" placeholder="https://drive.google.com/... or Xero quote number" {...f('project_google_link')} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} {...f('notes')} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving?'Converting...':'Convert to Current Client'}</button>
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
  const weekStart = getLastMonday();
  const [dashData, setDashData] = useState(null);
  const [actuals, setActuals] = useState({ cold_emails: '', cold_calls: '', new_clients_met: '', proposals_sent: '' });
  const [actionItems, setActionItems] = useState('');
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get(`/dashboard/individual/${user.id}`).then(r=>setDashData(r.data)).catch(console.error);
    api.get(`/meetings/week/${weekStart}`).then(r=>{
      const d = r.data;
      setActionItems(d.action_items || '');
      setActuals({
        cold_emails:     d.cold_emails_actual     ?? '',
        cold_calls:      d.cold_calls_actual      ?? '',
        new_clients_met: d.new_clients_met_actual  ?? '',
        proposals_sent:  d.proposals_sent_actual  ?? '',
      });
    }).catch(()=>{});
    api.get('/meetings?limit=8').then(r=>setHistory(r.data)).catch(console.error);
  }, [user.id, weekStart]);

  const targets = dashData ? calcTargets(user.role, dashData.gp?.tier||0, dashData.user?.tenure_months||0, clientCounts.current, clientCounts.pipeline+clientCounts.prospect) : null;
  const isPE = ['pe','spe'].includes(user.role);
  const isAssistant = ['bda','pa'].includes(user.role);
  const hasNoTargets = ['bdm','exec_pa'].includes(user.role);

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess(false);
    try {
      await api.post('/meetings', {
        week_start: weekStart, action_items: actionItems,
        cold_emails_target: targets?.cold_emails||0,       cold_emails_actual: parseInt(actuals.cold_emails)||0,
        cold_calls_target: targets?.cold_calls||0,         cold_calls_actual: parseInt(actuals.cold_calls)||0,
        new_clients_met_target: targets?.new_clients_met||0, new_clients_met_actual: parseInt(actuals.new_clients_met)||0,
        proposals_sent_target: targets?.proposals_sent||0,   proposals_sent_actual: parseInt(actuals.proposals_sent)||0,
        existing_clients_count: clientCounts.current,
        potential_clients_count: clientCounts.pipeline,
        prospect_count: clientCounts.prospect,
      });
      setSuccess(true);
      api.get('/meetings?limit=8').then(r=>setHistory(r.data)).catch(console.error);
    } catch(err) { setError(err.response?.data?.error||'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Weekly Meeting</h2>
        <p className="text-xs text-gray-500 mt-0.5">Reporting actuals for week of {fmtDate(weekStart)}</p>
      </div>
      {hasNoTargets ? (
        <div className="card text-sm text-gray-500 text-center py-6">Weekly effort tracking is for BD and Project team members.</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Client Load This Week</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[{label:'Current',val:clientCounts.current,color:'text-teal-700'},{label:'Pipeline',val:clientCounts.pipeline,color:'text-brand-600'},{label:'Prospects',val:clientCounts.prospect,color:'text-purple-700'}].map(c=>(
                <div key={c.label}><div className={`text-2xl font-bold ${c.color}`}>{c.val}</div><div className="text-xs text-gray-500">{c.label}</div></div>
              ))}
            </div>
            {isAssistant && dashData && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded px-3 py-1.5">
                Targets adjusted with {Math.round(dashData.user.multiplier*100)}% multiplier (tenure: {dashData.user.tenure_months} months)
              </p>
            )}
          </div>
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Sales Effort — Actuals</h3>
            <p className="text-xs text-gray-400 mb-3">Enter what you achieved for the week of {fmtDate(weekStart)}.</p>
            {!targets ? <div className="text-xs text-gray-400">Loading targets...</div> : (
              <div>
                <MetricRow label="Cold Emails"     targetVal={targets.cold_emails}     actualVal={actuals.cold_emails}     onChange={v => setActuals(a => ({...a, cold_emails: v}))} />
                {!isPE && <MetricRow label="Cold Calls"  targetVal={targets.cold_calls}  actualVal={actuals.cold_calls}  onChange={v => setActuals(a => ({...a, cold_calls: v}))} />}
                <MetricRow label="Proposals Sent"  targetVal={targets.proposals_sent}  actualVal={actuals.proposals_sent}  onChange={v => setActuals(a => ({...a, proposals_sent: v}))} />
                {!isPE && <MetricRow label="New Clients Met" targetVal={targets.new_clients_met} actualVal={actuals.new_clients_met} onChange={v => setActuals(a => ({...a, new_clients_met: v}))} />}
              </div>
            )}
          </div>
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">This Week's Action Items</h3>
            <p className="text-xs text-gray-400 mb-2">What are your key actions and commitments for the coming week?</p>
            <textarea
              className="input"
              rows={6}
              placeholder={"e.g.\n- Meet ABC Corp on Tuesday to discuss event brief\n- Send proposal to XYZ by Wednesday\n- Follow up with 3 pipeline clients"}
              value={actionItems}
              onChange={e => setActionItems(e.target.value)}
            />
          </div>
          {error   && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>}
          {success && <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">Meeting data saved successfully!</div>}
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving?'Saving...':'Submit Weekly Meeting Data'}</button>
        </form>
      )}

      {history.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Past Submissions</h3>
          <div className="space-y-3">
            {history.map(m=>(
              <details key={m.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer bg-gray-50 hover:bg-gray-100 list-none">
                  <span className="text-sm font-medium text-gray-800">Week of {fmtShort(m.week_start)}</span>
                  <span className="text-xs text-gray-400">▼</span>
                </summary>
                <div className="px-4 pb-4 pt-3 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sales Effort</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        {l:'Cold Emails',a:m.cold_emails_actual,t:m.cold_emails_target},
                        !isPE&&{l:'Cold Calls',a:m.cold_calls_actual,t:m.cold_calls_target},
                        {l:'Proposals',a:m.proposals_sent_actual,t:m.proposals_sent_target},
                        !isPE&&{l:'New Clients Met',a:m.new_clients_met_actual,t:m.new_clients_met_target},
                      ].filter(Boolean).map(item=>(
                        <div key={item.l} className="bg-gray-50 rounded-lg p-2 text-center">
                          <div className={`text-base font-bold ${item.a>=item.t?'text-green-600':'text-red-500'}`}>{item.a}<span className="text-xs text-gray-400">/{item.t}</span></div>
                          <div className="text-xs text-gray-500 mt-0.5">{item.l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Client Pipeline</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-teal-50 rounded-lg p-2 text-center">
                        <div className="text-base font-bold text-teal-700">{m.existing_clients_count||0}</div>
                        <div className="text-xs text-gray-500">Current</div>
                      </div>
                      <div className="bg-brand-50 rounded-lg p-2 text-center">
                        <div className="text-base font-bold text-brand-600">{m.potential_clients_count||0}</div>
                        <div className="text-xs text-gray-500">Pipeline</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-2 text-center">
                        <div className="text-base font-bold text-purple-700">{m.prospect_count||0}</div>
                        <div className="text-xs text-gray-500">Prospects</div>
                      </div>
                    </div>
                  </div>
                  {m.action_items && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Action Items</div>
                      <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{m.action_items}</div>
                    </div>
                  )}
                </div>
              </details>
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
  const isBDM = ['bdm', 'exec_pa'].includes(user.role);
  const [tab, setTab]           = useState('clients');
  const [clients, setClients]   = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal]             = useState(false);
  const [showConvert, setShowConvert]         = useState(false);
  const [showConvertPipeline, setShowConvertPipeline] = useState(false);
  const [showConvertLost, setShowConvertLost] = useState(false);
  const [editing, setEditing]                 = useState(null);
  const [converting, setConverting]           = useState(null);
  const [userFilter, setUserFilter]           = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = userFilter ? `?user_id=${userFilter}` : '';
    api.get(`/clients${params}`)
      .then(r => setClients(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userFilter]);

  useEffect(load, [load]);

  useEffect(() => {
    api.get('/users')
      .then(r => setTeamUsers(r.data.filter(u => u.is_active !== false && u.role !== 'exec_pa')))
      .catch(console.error);
  }, []);

  const grouped = LIST_TYPES.reduce((acc,t) => { acc[t]=clients.filter(c=>c.list_type===t); return acc; }, {});

  // Client counts for weekly meeting based on OWN clients only
  const ownClients = clients.filter(c => c.user_id === user.id);
  const clientCounts = {
    current:  ownClients.filter(c => c.list_type === 'current').length,
    pipeline: ownClients.filter(c => c.list_type === 'pipeline').length,
    prospect: ownClients.filter(c => c.list_type === 'prospect').length,
  };

  const renderColumn = (type) => {
    const cols = grouped[type] || [];
    return (
      <div key={type} className={`border rounded-xl p-4 ${LIST_COLORS[type]}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">{LIST_LABELS[type]}</h2>
          <span className={`badge ${LIST_BADGE[type]}`}>{cols.length}</span>
        </div>
        <div className="space-y-2">
          {cols.length===0 && <div className="text-xs text-gray-400 text-center py-4">No entries</div>}
          {cols.map(c => {
            const canInteract = isBDM || c.user_id === user.id;
            return (
              <div key={c.id} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.company_name}</div>
                    {c.project_name && <div className="text-xs text-brand-600 truncate">{c.project_name}</div>}
                    {c.project_type && <div className="text-xs text-gray-400">{c.project_type}</div>}
                  </div>
                  {canInteract && ['prospect','pipeline'].includes(type) && (
                    <button onClick={()=>{setEditing(c);setShowModal(true);}} className="text-xs text-brand-600 hover:underline shrink-0">Edit</button>
                  )}
                </div>
                {c.contact_name && <div className="text-xs text-gray-600 mt-1">👤 {c.contact_name}{c.contact_details && ` · ${c.contact_details}`}</div>}
                {c.event_date && <div className="text-xs text-gray-500 mt-0.5">📅 {fmtDate(c.event_date)}</div>}
                {(c.estimated_revenue||c.estimated_gp) && (
                  <div className="text-xs mt-0.5">
                    {c.estimated_revenue && <span className="text-gray-500">Rev: {formatCurrency(c.estimated_revenue)} </span>}
                    {c.estimated_gp && <span className="text-gray-600">Cost: {formatCurrency(c.estimated_gp)}</span>}
                  </div>
                )}
                {c.google_link && (
                  <div className="text-xs mt-0.5">
                    {/^https?:\/\//i.test(c.google_link)
                      ? <a href={c.google_link} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">📎 Drive Link ↗</a>
                      : <span className="text-gray-500">📎 {c.google_link}</span>
                    }
                  </div>
                )}
                {c.loss_reason && <div className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1">Reason: {c.loss_reason}</div>}
                {c.notes && <div className="text-xs text-gray-400 mt-1 italic line-clamp-2">{c.notes}</div>}
                {c.member_name && (
                  <div className="text-xs text-brand-600 mt-1 font-medium">{c.member_name}</div>
                )}
                {canInteract && type === 'prospect' && (
                  <button
                    onClick={()=>{setConverting(c);setShowConvertPipeline(true);}}
                    className="mt-2 w-full text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md py-1.5 font-medium transition-colors"
                  >
                    → Move to Pipeline
                  </button>
                )}
                {canInteract && type === 'pipeline' && (
                  <div className="mt-2 space-y-1.5">
                    <button
                      onClick={()=>{setConverting(c);setShowConvert(true);}}
                      className="w-full text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-md py-1.5 font-medium transition-colors"
                    >
                      ✓ Convert to Current Client
                    </button>
                    <button
                      onClick={()=>{setConverting(c);setShowConvertLost(true);}}
                      className="w-full text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-md py-1.5 font-medium transition-colors"
                    >
                      ✕ Mark as Lost
                    </button>
                  </div>
                )}
                {type === 'current' && (
                  <div className="mt-2 text-xs text-gray-400 text-center italic">Manage in Projects tab</div>
                )}
                {type === 'completed' && (
                  <div className="mt-2 text-xs text-green-600 text-center font-medium">✓ Project completed</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Clients & Activity</h1>
        {tab==='clients' && (
          <button onClick={()=>{setEditing(null);setShowModal(true);}} className="btn-primary text-sm">+ Add Client</button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[{key:'clients',label:'👥 Client Pipeline'},{key:'meeting',label:'📅 Weekly Meeting'}].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===t.key?'bg-white shadow text-brand-700':'text-gray-600 hover:text-gray-900'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='clients' && (
        <>
          {/* User filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">Filter by member:</label>
            <select
              className="input w-auto text-sm"
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
            >
              <option value="">All Members ({clients.length})</option>
              {teamUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
          ) : (
            <div className="space-y-4">
              {/* Row 1: Current, Pipeline, Prospect */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['current','pipeline','prospect'].map(type => renderColumn(type))}
              </div>
              {/* Row 2: Completed, Lost */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['completed','lost'].map(type => renderColumn(type))}
              </div>
            </div>
          )}
        </>
      )}

      {tab==='meeting' && <WeeklyMeetingSection clientCounts={clientCounts} />}

      {showModal && (
        <ClientModal client={editing} onSave={()=>{setShowModal(false);load();}} onClose={()=>setShowModal(false)} />
      )}
      {showConvert && converting && (
        <ConvertModal client={converting} onSave={()=>{setShowConvert(false);setConverting(null);load();}} onClose={()=>{setShowConvert(false);setConverting(null);}} />
      )}
      {showConvertPipeline && converting && (
        <ConvertToPipelineModal client={converting} onSave={()=>{setShowConvertPipeline(false);setConverting(null);load();}} onClose={()=>{setShowConvertPipeline(false);setConverting(null);}} />
      )}
      {showConvertLost && converting && (
        <ConvertToLostModal client={converting} onSave={()=>{setShowConvertLost(false);setConverting(null);load();}} onClose={()=>{setShowConvertLost(false);setConverting(null);}} />
      )}
    </div>
  );
}
