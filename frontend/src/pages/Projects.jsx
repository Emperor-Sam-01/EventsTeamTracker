import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, STATUS_COLORS, getMonthYear, monthName } from '../utils/format';
import { EVENT_TYPES } from '../utils/constants';

const EMPTY = {
  title: '', client_name: '', project_type: EVENT_TYPES[0],
  confirmation_date: '', event_date: '', revenue: '', cost: '',
  status: 'confirmed', project_google_link: '', notes: '', cancellation_reason: '',
};

function CrewRow({ member, users, onUpdate, onRemove, disabledIds }) {
  return (
    <div className="flex items-center gap-2">
      <select
        className="input flex-1 text-sm"
        value={member.user_id || ''}
        onChange={e => onUpdate({ ...member, user_id: parseInt(e.target.value) })}
      >
        <option value="">Select member...</option>
        {users.map(u => (
          <option key={u.id} value={u.id} disabled={disabledIds.includes(u.id) && u.id !== member.user_id}>
            {u.name} ({u.role.toUpperCase()})
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">GP $</span>
        <input
          type="number"
          className="input w-28 text-sm"
          placeholder="0"
          min="0"
          step="0.01"
          value={member.gp_allocated || ''}
          onChange={e => onUpdate({ ...member, gp_allocated: e.target.value })}
        />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 px-1">✕</button>
    </div>
  );
}

function ProjectModal({ project, onSave, onClose }) {
  const { user } = useAuth();
  const isBDM = ['bdm', 'exec_pa'].includes(user.role);

  const [form, setForm] = useState(project ? {
    ...project,
    confirmation_date: project.confirmation_date?.split('T')[0] || '',
    event_date: project.event_date?.split('T')[0] || '',
    project_google_link: project.project_google_link || '',
    cancellation_reason: project.cancellation_reason || '',
  } : EMPTY);
  const [users, setUsers] = useState([]);
  const [crew, setCrew] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users').then(r => {
      const list = r.data;
      setUsers(list);

      if (project?.crew && project.crew.length > 0) {
        setCrew(project.crew.map(c => ({
          user_id: c.user_id,
          is_lead: c.is_lead,
          gp_allocated: c.gp_allocated || '',
        })));
      } else if (!project?.id) {
        // New project: pre-fill lead
        const leadId = isBDM ? (project?.assigned_to || null) : user.id;
        if (leadId) {
          setCrew([{ user_id: leadId, is_lead: true, gp_allocated: '' }]);
        }
      }
    }).catch(console.error);
  }, []);

  // When assignee changes (BDM), update lead in crew
  const handleAssigneeChange = (newId) => {
    setForm(f => ({ ...f, assigned_to: parseInt(newId) }));
    setCrew(prev => {
      const leadIdx = prev.findIndex(c => c.is_lead);
      if (leadIdx === -1) return [{ user_id: parseInt(newId), is_lead: true, gp_allocated: '' }, ...prev];
      const updated = [...prev];
      updated[leadIdx] = { ...updated[leadIdx], user_id: parseInt(newId) };
      return updated;
    });
  };

  const addCrewMember = () => {
    setCrew(prev => [...prev, { user_id: '', is_lead: false, gp_allocated: '' }]);
  };

  const updateCrewMember = (idx, updated) => {
    setCrew(prev => prev.map((c, i) => i === idx ? updated : c));
  };

  const removeCrewMember = (idx) => {
    setCrew(prev => prev.filter((_, i) => i !== idx));
  };

  const gp = (parseFloat(form.revenue) || 0) - (parseFloat(form.cost) || 0);
  const allocatedGP = crew.reduce((s, c) => s + (parseFloat(c.gp_allocated) || 0), 0);
  const remainingGP = gp - allocatedGP;
  const crewIds = crew.filter(c => c.user_id).map(c => c.user_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const validCrew = crew.filter(c => c.user_id);
      const payload = {
        ...form,
        revenue: parseFloat(form.revenue),
        cost: parseFloat(form.cost),
        crew: validCrew.length > 0 ? validCrew.map(c => ({
          user_id: c.user_id,
          is_lead: !!c.is_lead,
          gp_allocated: parseFloat(c.gp_allocated) || 0,
        })) : [],
      };
      if (project?.id) {
        await api.put(`/projects/${project.id}`, payload);
      } else {
        await api.post('/projects', payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const leadEntry = crew.find(c => c.is_lead);
  const nonLeadCrew = crew.filter(c => !c.is_lead);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">{project?.id ? 'Edit Project' : 'Add Project'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Project Title</label>
              <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="col-span-2">
              <label className="label">Client Name</label>
              <input className="input" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.project_type} onChange={e => setForm(f => ({ ...f, project_type: e.target.value }))}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Date of Confirmation</label>
              <input type="date" className="input" value={form.confirmation_date} onChange={e => setForm(f => ({ ...f, confirmation_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Event Date</label>
              <input type="date" className="input" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Revenue ($)</label>
              <input type="number" className="input" value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} required min="0" step="0.01" />
            </div>
            <div>
              <label className="label">Cost ($)</label>
              <input type="number" className="input" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} required min="0" step="0.01" />
            </div>
            <div className="col-span-2 bg-gray-50 rounded-lg px-4 py-2 flex items-center justify-between">
              <span className="text-sm text-gray-600">Gross Profit</span>
              <span className={`text-lg font-bold ${gp >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(gp)}</span>
            </div>
          </div>

          {/* GP Distribution */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">GP Distribution</h3>
              {allocatedGP > 0 && (
                <span className={`text-xs font-medium ${remainingGP < -0.01 ? 'text-red-600' : 'text-gray-500'}`}>
                  Allocated {formatCurrency(allocatedGP)} / Remaining {formatCurrency(remainingGP)}
                </span>
              )}
            </div>

            {isBDM && users.length > 0 && (
              <div>
                <label className="label text-xs">Project Lead (Assign To)</label>
                <select
                  className="input text-sm"
                  value={form.assigned_to || ''}
                  onChange={e => handleAssigneeChange(e.target.value)}
                >
                  <option value="">Select project lead...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>)}
                </select>
              </div>
            )}

            {/* Lead GP allocation */}
            <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-orange-700 flex-1">
                {leadEntry
                  ? (users.find(u => u.id === leadEntry.user_id)?.name || (isBDM ? 'Project Lead' : user.name)) + ' (Lead)'
                  : isBDM ? 'Select a project lead above' : user.name + ' (Lead)'}
              </span>
              <span className="text-xs text-gray-500">GP $</span>
              <input
                type="number"
                className="input w-28 text-sm"
                placeholder="0"
                min="0"
                step="0.01"
                value={leadEntry?.gp_allocated || ''}
                onChange={e => {
                  setCrew(prev => {
                    const idx = prev.findIndex(c => c.is_lead);
                    if (idx === -1) {
                      const leadId = isBDM ? (form.assigned_to || null) : user.id;
                      return [...prev, { user_id: leadId, is_lead: true, gp_allocated: e.target.value }];
                    }
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], gp_allocated: e.target.value };
                    return updated;
                  });
                }}
              />
            </div>

            {/* Non-lead crew */}
            {nonLeadCrew.map((member, i) => {
              const actualIdx = crew.findIndex((c, ci) => !c.is_lead && crew.filter(x => !x.is_lead).indexOf(c) === i);
              const crewIdx = crew.indexOf(member);
              return (
                <CrewRow
                  key={crewIdx}
                  member={member}
                  users={users}
                  onUpdate={updated => updateCrewMember(crewIdx, updated)}
                  onRemove={() => removeCrewMember(crewIdx)}
                  disabledIds={crewIds}
                />
              );
            })}

            <button
              type="button"
              onClick={addCrewMember}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
            >
              + Add Event Crew Member
            </button>

            {allocatedGP > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>GP Allocated</span>
                  <span>{formatCurrency(allocatedGP)} of {formatCurrency(gp)}</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${allocatedGP > gp ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, gp > 0 ? (allocatedGP / gp) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Project Google Drive Link / Xero Quote No.</label>
            <input
              className="input"
              placeholder="https://drive.google.com/... or Xero quote number"
              value={form.project_google_link}
              onChange={e => setForm(f => ({ ...f, project_google_link: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {form.status === 'cancelled' && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4">
              <label className="label text-red-700">Reason for Cancellation <span className="text-red-500">*</span></label>
              <textarea
                className="input border-red-300 focus:border-red-500 focus:ring-red-500"
                rows={3}
                placeholder="e.g. Client pulled out due to budget constraints..."
                value={form.cancellation_reason}
                onChange={e => setForm(f => ({ ...f, cancellation_reason: e.target.value }))}
                required
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Project'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { month, year } = getMonthYear();
  const [filter, setFilter] = useState({ month, year, status: '' });

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ month: filter.month, year: filter.year });
    if (filter.status) params.append('status', filter.status);
    api.get(`/projects?${params}`)
      .then(r => setProjects(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const totalGP = projects
    .filter(p => ['confirmed', 'completed'].includes(p.status))
    .reduce((s, p) => s + parseFloat(p.gp || 0), 0);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary text-sm">+ Add Project</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="input w-auto text-xs" value={filter.month} onChange={e => setFilter(f => ({ ...f, month: parseInt(e.target.value) }))}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
        </select>
        <select className="input w-auto text-xs" value={filter.year} onChange={e => setFilter(f => ({ ...f, year: parseInt(e.target.value) }))}>
          {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
        </select>
        <select className="input w-auto text-xs" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="ml-auto text-sm font-semibold text-gray-700">
          Total GP: <span className="text-green-600">{formatCurrency(totalGP)}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : projects.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No projects found for this period.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="text-left py-3 px-4">Project</th>
                <th className="text-left py-3 px-4">Client</th>
                <th className="text-left py-3 px-4">Type</th>
                <th className="text-left py-3 px-4">Confirmed</th>
                <th className="text-left py-3 px-4">Event Date</th>
                <th className="text-right py-3 px-4">Revenue</th>
                <th className="text-right py-3 px-4">Cost</th>
                <th className="text-right py-3 px-4">GP</th>
                <th className="text-left py-3 px-4">Status</th>
                {['bdm', 'exec_pa'].includes(user.role) && <th className="text-left py-3 px-4">Assigned</th>}
                <th className="py-3 px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    <div>{p.title}</div>
                    {p.crew && p.crew.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Crew: {p.crew.map(c => c.name).join(', ')}
                      </div>
                    )}
                    {p.project_google_link && /^https?:\/\//i.test(p.project_google_link) && (
                      <a href={p.project_google_link} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline mt-0.5 block">
                        Google Drive ↗
                      </a>
                    )}
                    {p.project_google_link && !/^https?:\/\//i.test(p.project_google_link) && (
                      <div className="text-xs text-gray-400 mt-0.5">📎 {p.project_google_link}</div>
                    )}
                    {p.cancellation_reason && (
                      <div className="text-xs text-red-600 mt-0.5 italic">Cancelled: {p.cancellation_reason}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">{p.client_name}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{p.project_type}</td>
                  <td className="py-3 px-4 text-gray-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-3 px-4 text-gray-500">{formatDate(p.event_date)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(p.revenue)}</td>
                  <td className="py-3 px-4 text-right text-red-600">{formatCurrency(p.cost)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-green-700">{formatCurrency(p.gp)}</td>
                  <td className="py-3 px-4"><span className={`badge ${STATUS_COLORS[p.status]}`}>{p.status}</span></td>
                  {['bdm', 'exec_pa'].includes(user.role) && <td className="py-3 px-4 text-gray-500 text-xs">{p.assigned_name}</td>}
                  <td className="py-3 px-4">
                    {(['bdm', 'exec_pa'].includes(user.role) || p.assigned_to === user.id) && (
                      <button onClick={() => { setEditing(p); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProjectModal
          project={editing}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
