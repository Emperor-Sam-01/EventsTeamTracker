import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { ROLE_LABELS, ROLE_COLORS } from '../utils/format';

const EMPTY = { name: '', email: '', password: '', role: 'bde', join_date: '', salary: '', cpf_type: 'local', cpf_rate: '0.17', permit_cost: '0' };

function UserModal({ user, onSave, onClose }) {
  const [form, setForm] = useState(user ? { ...user, password: '' } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, salary: parseFloat(form.salary), cpf_rate: parseFloat(form.cpf_rate), permit_cost: parseFloat(form.permit_cost) };
      if (!payload.password) delete payload.password;
      if (user?.id) {
        await api.put(`/users/${user.id}`, payload);
      } else {
        await api.post('/users', payload);
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
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-900">{user?.id ? 'Edit Member' : 'Add Member'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Full Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">{user?.id ? 'New Password (leave blank to keep)' : 'Password'}</label>
              <input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} {...(!user?.id && { required: true, minLength: 8 })} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Join Date</label>
              <input type="date" className="input" value={form.join_date} onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Monthly Salary ($)</label>
              <input type="number" className="input" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} required min="0" step="0.01" />
            </div>
            <div>
              <label className="label">CPF / Permit Type</label>
              <select className="input" value={form.cpf_type} onChange={e => setForm(f => ({ ...f, cpf_type: e.target.value }))}>
                <option value="local">Local (CPF)</option>
                <option value="pr">PR (CPF)</option>
                <option value="foreign">Foreign (Work Pass)</option>
              </select>
            </div>
            {form.cpf_type !== 'foreign' ? (
              <div>
                <label className="label">CPF Employer Rate</label>
                <input type="number" className="input" value={form.cpf_rate} onChange={e => setForm(f => ({ ...f, cpf_rate: e.target.value }))} step="0.01" min="0" max="1" placeholder="e.g. 0.17 for 17%" />
              </div>
            ) : (
              <div>
                <label className="label">Monthly Permit Cost ($)</label>
                <input type="number" className="input" value={form.permit_cost} onChange={e => setForm(f => ({ ...f, permit_cost: e.target.value }))} min="0" step="0.01" />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Member'}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/users').then(r => setUsers(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleActive = async (u) => {
    if (!confirm(`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.name}?`)) return;
    try { await api.put(`/users/${u.id}`, { is_active: !u.is_active }); load(); } catch { }
  };

  const resetPassword = async (u) => {
    const pw = prompt(`New password for ${u.name} (min 8 chars):`);
    if (!pw || pw.length < 8) return alert('Password too short.');
    try { await api.post(`/users/${u.id}/reset-password`, { new_password: pw }); alert('Password reset.'); } catch { alert('Failed.'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Team Management</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary text-sm">+ Add Member</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3">Role</th>
                <th className="text-left py-2 px-3">Join Date</th>
                <th className="text-right py-2 px-3">Tenure</th>
                <th className="text-right py-2 px-3">Multiplier</th>
                <th className="text-right py-2 px-3">Salary</th>
                <th className="text-left py-2 px-3">CPF Type</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="py-2.5 px-3 font-medium text-gray-900">{u.name}</td>
                  <td className="py-2.5 px-3"><span className={`badge ${ROLE_COLORS[u.role]}`}>{u.role.toUpperCase()}</span></td>
                  <td className="py-2.5 px-3 text-gray-500">{new Date(u.join_date).toLocaleDateString('en-SG')}</td>
                  <td className="py-2.5 px-3 text-right text-gray-600">{u.tenure_months}m</td>
                  <td className="py-2.5 px-3 text-right text-gray-600">{u.multiplier < 1 ? `${Math.round(u.multiplier * 100)}%` : '100%'}</td>
                  <td className="py-2.5 px-3 text-right">${parseFloat(u.salary).toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-gray-500 uppercase text-xs">{u.cpf_type}</td>
                  <td className="py-2.5 px-3">
                    <span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditing(u); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => resetPassword(u)} className="text-xs text-gray-500 hover:underline">Reset PW</button>
                      <button onClick={() => toggleActive(u)} className={`text-xs hover:underline ${u.is_active ? 'text-red-500' : 'text-green-600'}`}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <UserModal
          user={editing}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
