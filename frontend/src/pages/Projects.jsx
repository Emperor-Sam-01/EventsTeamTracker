import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, STATUS_COLORS, getMonthYear, monthName } from '../utils/format';

const EMPTY = {
  title: '', client_name: '', project_type: 'events',
  confirmation_date: '', event_date: '', revenue: '', cost: '',
  status: 'pending', notes: '',
};

function ProjectModal({ project, onSave, onClose }) {
  const { user } = useAuth();
  const [form, setForm] = useState(project ? {
    ...project,
    confirmation_date: project.confirmation_date?.split('T')[0] || '',
    event_date: project.event_date?.split('T')[0] || '',
  } : EMPTY);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (['bdm', 'exec_pa'].includes(user.role)) {
      api.get('/users').then(r => setUsers(r.data)).catch(console.error);
    }
  }, [user.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, revenue: parseFloat(form.revenue), cost: parseFloat(form.cost) };
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

  const gp = (parseFloat(form.revenue) || 0) - (parseFloat(form.cost) || 0);

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
                <option value="events">Events</option>
                <option value="non_events">Non-Events</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Date of Confirmation</label>
              <input type="date" className="input" value={form.confirmation_date} onChange={e => setForm(f => ({ ...f, confirmation_date: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-0.5">Sets the GP reporting period</p>
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
            {['bdm', 'exec_pa'].includes(user.role) && users.length > 0 && (
              <div className="col-span-2">
                <label className="label">Assign To</label>
                <select className="input" value={form.assigned_to || ''} onChange={e => setForm(f => ({ ...f, assigned_to: parseInt(e.target.value) }))}>
                  <option value="">Select member...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
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
          <option value="pending">Pending</option>
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
                  <td className="py-3 px-4 font-medium text-gray-900">{p.title}</td>
                  <td className="py-3 px-4 text-gray-600">{p.client_name}</td>
                  <td className="py-3 px-4 text-gray-500 capitalize">{p.project_type.replace('_', ' ')}</td>
                  <td className="py-3 px-4 text-gray-500">{formatDate(p.confirmation_date)}</td>
                  <td className="py-3 px-4 text-gray-500">{formatDate(p.event_date)}</td>
                  <td className="py-3 px-4 text-right">{formatCurrency(p.revenue)}</td>
                  <td className="py-3 px-4 text-right text-red-600">{formatCurrency(p.cost)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-green-700">{formatCurrency(p.gp)}</td>
                  <td className="py-3 px-4"><span className={`badge ${STATUS_COLORS[p.status]}`}>{p.status}</span></td>
                  {['bdm', 'exec_pa'].includes(user.role) && <td className="py-3 px-4 text-gray-500 text-xs">{p.assigned_name}</td>}
                  <td className="py-3 px-4">
                    <button onClick={() => { setEditing(p); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
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
