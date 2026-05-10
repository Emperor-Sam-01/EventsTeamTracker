import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';

const LIST_TYPES = ['current', 'pipeline', 'prospect'];
const LIST_LABELS = { current: 'Current Clients', pipeline: 'Pipeline', prospect: 'Prospects' };
const LIST_COLORS = { current: 'bg-teal-50 border-teal-200', pipeline: 'bg-blue-50 border-blue-200', prospect: 'bg-purple-50 border-purple-200' };
const LIST_BADGE = { current: 'bg-teal-100 text-teal-700', pipeline: 'bg-blue-100 text-blue-700', prospect: 'bg-purple-100 text-purple-700' };

const EMPTY = { company_name: '', contact_person: '', list_type: 'prospect', event_date: '', estimated_value: '', notes: '' };

function ClientModal({ client, onSave, onClose }) {
  const [form, setForm] = useState(client || EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null };
      if (client?.id) {
        await api.put(`/clients/${client.id}`, payload);
      } else {
        await api.post('/clients', payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
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

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = filter ? `?list_type=${filter}` : '';
    api.get(`/clients${params}`)
      .then(r => setClients(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const grouped = LIST_TYPES.reduce((acc, t) => {
    acc[t] = clients.filter(c => c.list_type === t);
    return acc;
  }, {});

  const remove = async (id) => {
    if (!confirm('Remove this client from the list?')) return;
    try { await api.delete(`/clients/${id}`); load(); } catch { }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Clients</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary text-sm">+ Add Client</button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter('')} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!filter ? 'bg-brand-600 text-white border-brand-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>All</button>
        {LIST_TYPES.map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === t ? 'bg-brand-600 text-white border-brand-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {LIST_LABELS[t]} ({grouped[t]?.length || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {LIST_TYPES.filter(t => !filter || filter === t).map(type => (
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
                      <div>
                        <div className="text-sm font-medium text-gray-900">{c.company_name}</div>
                        {c.contact_person && <div className="text-xs text-gray-500">{c.contact_person}</div>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(c); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
                        <span className="text-gray-300">·</span>
                        <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                      </div>
                    </div>
                    {c.event_date && (
                      <div className="text-xs text-gray-500 mt-1">Event: {new Date(c.event_date).toLocaleDateString('en-SG')}</div>
                    )}
                    {c.estimated_value && (
                      <div className="text-xs text-green-700 mt-0.5">Est. {formatCurrency(c.estimated_value)}</div>
                    )}
                    {c.notes && <div className="text-xs text-gray-400 mt-1 italic">{c.notes}</div>}
                    {user.role === 'bdm' && c.member_name && (
                      <div className="text-xs text-brand-600 mt-1 font-medium">{c.member_name}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
