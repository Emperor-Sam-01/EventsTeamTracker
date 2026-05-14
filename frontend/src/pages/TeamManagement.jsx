import React, { useEffect, useState, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, ROLE_COLORS, formatCurrency } from '../utils/format';

const ASSISTANT_ROLES = ['bda', 'pa'];
const PE_ROLES = ['pe', 'spe'];
const CPF_OPTIONS = [
  { value: 'cpf',         label: 'CPF' },
  { value: 'work_permit', label: 'Work Permit' },
  { value: 's_pass',      label: 'S-Pass' },
  { value: 'e_pass',      label: 'E-Pass' },
];
const CPF_LABELS = Object.fromEntries(CPF_OPTIONS.map(o => [o.value, o.label]));
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getManagementFee(role) {
  if (role === 'exec_pa') return 0;
  if (ASSISTANT_ROLES.includes(role)) return 700;
  if (PE_ROLES.includes(role)) return 1300;
  return 1900;
}

function calcMonthlyCost(salary, cpf_type, cpf_rate, permit_cost, role) {
  if (role === 'exec_pa') return 0;
  const sal = parseFloat(salary) || 0;
  const cpfCost = cpf_type === 'cpf'
    ? sal * (parseFloat(cpf_rate) || 0)
    : parseFloat(permit_cost) || 0;
  return sal + cpfCost + getManagementFee(role);
}

function calcBDTargets(t1) {
  const v = parseFloat(t1) || 0;
  return { t0_5: v / 2, t1: v, t2: v + 4000, t3: v + 10000 };
}

function calcPETargets(t1Monthly) {
  const v = parseFloat(t1Monthly) || 0;
  return { t1q: v * 0.75 * 3 }; // T2Q: t1q–$50k, T3Q: $50k+
}

function fmtJoinDate(d) {
  if (!d) return '—';
  const dateStr = d.split('T')[0];
  const dt = new Date(dateStr + 'T12:00:00');
  return `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

const EMPTY = {
  name: '', email: '', password: '', role: 'bde',
  join_month: new Date().getMonth() + 1,
  join_year: new Date().getFullYear(),
  salary: '', cpf_type: 'cpf', cpf_rate: '0.17', permit_cost: '0',
  gp_target_t1: '', bdm_id: '', resignation_date: '',
};

function UserModal({ user, onSave, onClose, bdmList }) {
  const initForm = () => {
    if (!user) return EMPTY;
    const dateStr = user.join_date ? user.join_date.split('T')[0] : null;
    const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
    return {
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'bde',
      join_month: d.getMonth() + 1,
      join_year: d.getFullYear(),
      salary: user.salary != null ? String(user.salary) : '',
      cpf_type: user.cpf_type || 'cpf',
      cpf_rate: user.cpf_rate != null ? String(user.cpf_rate) : '0.17',
      permit_cost: user.permit_cost != null ? String(user.permit_cost) : '0',
      gp_target_t1: user.gp_target_t1 != null ? String(user.gp_target_t1) : '',
      bdm_id: user.bdm_id != null ? String(user.bdm_id) : '',
      resignation_date: user.resignation_date ? user.resignation_date.split('T')[0] : '',
    };
  };

  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isExecPA   = form.role === 'exec_pa';
  const isAssistant = ASSISTANT_ROLES.includes(form.role);
  const isPE        = PE_ROLES.includes(form.role);
  const isCPF       = form.cpf_type === 'cpf';
  const showCost    = !isExecPA;
  const showTargets = !isExecPA && !isAssistant;

  const monthlyCost = calcMonthlyCost(form.salary, form.cpf_type, form.cpf_rate, form.permit_cost, form.role);
  const bdTargets   = calcBDTargets(form.gp_target_t1);
  const peTargets   = calcPETargets(form.gp_target_t1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const join_date = `${form.join_year}-${String(form.join_month).padStart(2, '0')}-01`;
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        join_date,
        salary:      isExecPA ? 0 : (parseFloat(form.salary) || 0),
        cpf_type:    isExecPA ? 'cpf' : form.cpf_type,
        cpf_rate:    isExecPA ? 0 : (isCPF ? parseFloat(form.cpf_rate) || 0 : 0),
        permit_cost: isExecPA ? 0 : (!isCPF ? parseFloat(form.permit_cost) || 0 : 0),
        gp_target_t1: (showTargets && form.gp_target_t1 !== '') ? parseFloat(form.gp_target_t1) : null,
        bdm_id: (!isExecPA && form.role !== 'bdm' && form.bdm_id !== '') ? parseInt(form.bdm_id) : null,
        resignation_date: form.resignation_date || null,
      };
      if (form.password) payload.password = form.password;
      if (user?.id) {
        await api.put(`/users/${user.id}`, payload);
      } else {
        if (!form.password) { setError('Password is required for new members'); setSaving(false); return; }
        await api.post('/users', { ...payload, password: form.password });
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
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                minLength={form.password ? 8 : undefined}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {form.role !== 'bdm' && form.role !== 'exec_pa' && (
              <div>
                <label className="label">Reporting to (BDM)</label>
                <select className="input" value={form.bdm_id} onChange={e => setForm(f => ({ ...f, bdm_id: e.target.value }))}>
                  <option value="">Not assigned</option>
                  {bdmList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Join Date (Month &amp; Year)</label>
              <div className="flex gap-2">
                <select
                  className="input flex-1 text-sm"
                  value={form.join_month}
                  onChange={e => setForm(f => ({ ...f, join_month: parseInt(e.target.value) }))}
                >
                  {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <input
                  type="number"
                  className="input w-24 text-sm"
                  value={form.join_year}
                  onChange={e => setForm(f => ({ ...f, join_year: parseInt(e.target.value) }))}
                  min="2000" max="2099" required
                />
              </div>
            </div>

            <div>
              <label className="label">Resignation Date (if applicable)</label>
              <input
                type="date"
                className="input"
                value={form.resignation_date}
                onChange={e => setForm(f => ({ ...f, resignation_date: e.target.value }))}
              />
              {form.resignation_date && (
                <p className="text-xs text-amber-600 mt-1">Staff will not appear in crew assignments for projects on or after this date.</p>
              )}
            </div>

            {isExecPA && (
              <div className="col-span-2">
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 text-center">
                  Executive PA is an administrative account — no salary or cost fields required.
                </div>
              </div>
            )}

            {showCost && (
              <>
                <div>
                  <label className="label">Monthly Salary ($)</label>
                  <input
                    type="number" className="input"
                    value={form.salary}
                    onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                    required min="0" step="0.01"
                  />
                </div>
                <div>
                  <label className="label">CPF / Permit</label>
                  <select className="input" value={form.cpf_type} onChange={e => setForm(f => ({ ...f, cpf_type: e.target.value }))}>
                    {CPF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {isCPF ? (
                  <div>
                    <label className="label">CPF Employer Rate</label>
                    <input
                      type="number" className="input"
                      value={form.cpf_rate}
                      onChange={e => setForm(f => ({ ...f, cpf_rate: e.target.value }))}
                      step="0.001" min="0" max="1"
                      placeholder="e.g. 0.17 for 17%"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="label">Monthly Permit Cost ($)</label>
                    <input
                      type="number" className="input"
                      value={form.permit_cost}
                      onChange={e => setForm(f => ({ ...f, permit_cost: e.target.value }))}
                      min="0" step="0.01"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Monthly Cost Breakdown */}
          {showCost && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm">
              <div className="font-semibold text-blue-800 mb-2">Monthly Cost Breakdown</div>
              <div className="space-y-1 text-blue-700">
                <div className="flex justify-between">
                  <span>Salary</span>
                  <span>{formatCurrency(form.salary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isCPF ? `CPF (${Math.round((parseFloat(form.cpf_rate) || 0) * 100)}%)` : CPF_LABELS[form.cpf_type]}</span>
                  <span>
                    {isCPF
                      ? formatCurrency((parseFloat(form.salary) || 0) * (parseFloat(form.cpf_rate) || 0))
                      : formatCurrency(form.permit_cost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Management Fee</span>
                  <span>{formatCurrency(getManagementFee(form.role))}</span>
                </div>
                <div className="flex justify-between font-bold text-blue-900 border-t border-blue-200 pt-1 mt-1">
                  <span>Total Monthly Cost</span>
                  <span>{formatCurrency(monthlyCost)}</span>
                </div>
              </div>
            </div>
          )}

          {/* GP Targets */}
          {showTargets && (
            <>
              <hr className="border-gray-200" />
              {form.role === 'bdm' ? (
                <div>
                  <div className="font-semibold text-gray-700 text-sm mb-1">Monthly GP Target</div>
                  <div className="text-xs text-gray-400 mb-3">No tiered commission structure for BDM</div>
                  <div>
                    <label className="label">Monthly GP Target ($)</label>
                    <input
                      type="number" className="input"
                      placeholder="e.g. 15000"
                      value={form.gp_target_t1}
                      onChange={e => setForm(f => ({ ...f, gp_target_t1: e.target.value }))}
                      min="0" step="0.01"
                    />
                  </div>
                  {form.gp_target_t1 && (
                    <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm flex justify-between">
                      <span className="text-gray-600">Monthly GP Target</span>
                      <span className="font-bold text-gray-900">{formatCurrency(form.gp_target_t1)}</span>
                    </div>
                  )}
                </div>
              ) : isPE ? (
                <div>
                  <div className="font-semibold text-gray-700 text-sm mb-1">GP Targets — Project Executive</div>
                  <div className="text-xs text-gray-400 mb-3">Quarterly tiers calculated from monthly T1 input</div>
                  <div>
                    <label className="label">T1 Target (Monthly GP, $)</label>
                    <input
                      type="number" className="input"
                      placeholder="e.g. 5000"
                      value={form.gp_target_t1}
                      onChange={e => setForm(f => ({ ...f, gp_target_t1: e.target.value }))}
                      min="0" step="0.01"
                    />
                  </div>
                  {form.gp_target_t1 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Quarterly Tiers</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-amber-50 text-amber-700 rounded-lg p-2 text-center">
                          <div className="text-xs font-semibold">Tier 1 (Quarterly)</div>
                          <div className="text-sm font-bold">{formatCurrency(peTargets.t1q)}</div>
                          <div className="text-xs opacity-70">T1 × 0.75 × 3</div>
                        </div>
                        <div className="bg-blue-50 text-blue-700 rounded-lg p-2 text-center">
                          <div className="text-xs font-semibold">Tier 2 (Quarterly)</div>
                          <div className="text-sm font-bold">{formatCurrency(peTargets.t1q)} – $50K</div>
                          <div className="text-xs opacity-70">T1Q to $50,000</div>
                        </div>
                        <div className="bg-green-50 text-green-700 rounded-lg p-2 text-center">
                          <div className="text-xs font-semibold">Tier 3 (Quarterly)</div>
                          <div className="text-sm font-bold">$50,001+</div>
                          <div className="text-xs opacity-70">Above $50,000</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-semibold text-gray-700 text-sm mb-1">Individual GP Targets</div>
                  <div className="text-xs text-gray-400 mb-3">T0.5 = T1÷2 &nbsp;|&nbsp; T2 = T1+$4,000 &nbsp;|&nbsp; T3 = T2+$6,000</div>
                  <div>
                    <label className="label">T1 Target (Monthly GP, $)</label>
                    <input
                      type="number" className="input"
                      placeholder="e.g. 8000"
                      value={form.gp_target_t1}
                      onChange={e => setForm(f => ({ ...f, gp_target_t1: e.target.value }))}
                      min="0" step="0.01"
                    />
                  </div>
                  {form.gp_target_t1 && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {[
                        { label: 'T0.5', val: bdTargets.t0_5, color: 'bg-gray-50 text-gray-600' },
                        { label: 'T1',   val: bdTargets.t1,   color: 'bg-amber-50 text-amber-700' },
                        { label: 'T2',   val: bdTargets.t2,   color: 'bg-blue-50 text-blue-700' },
                        { label: 'T3',   val: bdTargets.t3,   color: 'bg-green-50 text-green-700' },
                      ].map(t => (
                        <div key={t.label} className={`rounded-lg p-2 text-center ${t.color}`}>
                          <div className="text-xs font-semibold">{t.label}</div>
                          <div className="text-sm font-bold">{formatCurrency(t.val)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

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

function DeleteConfirmModal({ user, onConfirm, onClose }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-lg">Delete Member</h2>
        <p className="text-sm text-gray-600">
          This will <span className="font-semibold text-red-600">permanently delete</span> all data for{' '}
          <span className="font-semibold">{user.name}</span>, including their projects, clients, and meeting history. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl py-2 transition-colors disabled:opacity-50"
            disabled={confirming}
            onClick={async () => { setConfirming(true); await onConfirm(); setConfirming(false); }}
          >
            {confirming ? 'Deleting...' : 'Yes, Delete Permanently'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function TeamManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState({ role: '', status: 'active', search: '' });
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

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

  const handleDelete = async () => {
    try { await api.delete(`/users/${deleting.id}`); setDeleting(null); load(); } catch { alert('Failed to delete user.'); }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => <span className="text-gray-400">{sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</span>;

  const filtered = useMemo(() => {
    let list = users.filter(u => {
      if (filter.role && u.role !== filter.role) return false;
      if (filter.status === 'active' && !u.is_active) return false;
      if (filter.status === 'inactive' && u.is_active) return false;
      if (filter.search && !u.name.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let va, vb;
      if (sortBy === 'name')      { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortBy === 'salary') { va = parseFloat(a.salary) || 0; vb = parseFloat(b.salary) || 0; }
      else if (sortBy === 'cost')   { va = calcMonthlyCost(a.salary, a.cpf_type, a.cpf_rate, a.permit_cost, a.role); vb = calcMonthlyCost(b.salary, b.cpf_type, b.cpf_rate, b.permit_cost, b.role); }
      else if (sortBy === 'role')   { va = a.role; vb = b.role; }
      else if (sortBy === 'join_date') { va = a.join_date || ''; vb = b.join_date || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [users, filter, sortBy, sortDir]);

  const totalCost = filtered.filter(u => u.is_active).reduce(
    (s, u) => s + calcMonthlyCost(u.salary, u.cpf_type, u.cpf_rate, u.permit_cost, u.role), 0
  );

  if (user?.role !== 'bdm') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <div className="text-gray-700 font-semibold">Access Restricted</div>
        <div className="text-sm text-gray-400">Team Management is only available to the Business Development Manager.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Team Management</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary text-sm">+ Add Member</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="input w-44 text-sm"
          placeholder="Search by name..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
        />
        <select className="input w-auto text-sm" value={filter.role} onChange={e => setFilter(f => ({ ...f, role: e.target.value }))}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="ml-auto text-sm text-gray-600">
          Active team cost: <span className="font-semibold text-gray-900">{formatCurrency(totalCost)}<span className="text-xs text-gray-400">/mo</span></span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="text-left py-3 px-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('name')}>Name<SortIcon col="name" /></th>
                <th className="text-left py-3 px-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('role')}>Role<SortIcon col="role" /></th>
                <th className="text-left py-3 px-3">BDM</th>
                <th className="text-left py-3 px-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('join_date')}>Joined<SortIcon col="join_date" /></th>
                <th className="text-right py-3 px-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('salary')}>Salary<SortIcon col="salary" /></th>
                <th className="text-left py-3 px-3">CPF/Permit</th>
                <th className="text-right py-3 px-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('cost')}>Monthly Cost<SortIcon col="cost" /></th>
                <th className="text-right py-3 px-3">GP Targets</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="py-3 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-gray-400">No members found.</td></tr>
              )}
              {filtered.map(u => {
                const isExecPA    = u.role === 'exec_pa';
                const isAssistant = ASSISTANT_ROLES.includes(u.role);
                const isPE        = PE_ROLES.includes(u.role);
                const cost        = calcMonthlyCost(u.salary, u.cpf_type, u.cpf_rate, u.permit_cost, u.role);
                const isCPF       = u.cpf_type === 'cpf';
                const cpfDetail   = isCPF
                  ? `${Math.round((parseFloat(u.cpf_rate) || 0) * 100)}%`
                  : formatCurrency(u.permit_cost);
                const bdT = calcBDTargets(u.gp_target_t1);
                const peT = calcPETargets(u.gp_target_t1);

                return (
                  <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 px-3 font-medium text-gray-900">{u.name}</td>
                    <td className="py-2.5 px-3"><span className={`badge ${ROLE_COLORS[u.role]}`}>{u.role.toUpperCase()}</span></td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">
                      {u.bdm_id ? (users.find(b => b.id === u.bdm_id)?.name?.split(' ')[0] || '—') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{fmtJoinDate(u.join_date)}</td>
                    <td className="py-2.5 px-3 text-right">{isExecPA ? '—' : formatCurrency(u.salary)}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">
                      {isExecPA ? '—' : `${CPF_LABELS[u.cpf_type] || u.cpf_type} (${cpfDetail})`}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {isExecPA ? '—' : formatCurrency(cost)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-gray-500">
                      {isExecPA ? (
                        <span className="text-gray-300 italic">Admin only</span>
                      ) : isAssistant ? (
                        <span className="text-gray-400 italic">Baseline × multiplier</span>
                      ) : u.role === 'bdm' ? (
                        u.gp_target_t1 ? (
                          <div className="text-gray-700 font-medium">{formatCurrency(u.gp_target_t1)}<span className="text-xs text-gray-400">/mo</span></div>
                        ) : <span className="text-gray-300">Not set</span>
                      ) : isPE ? (
                        u.gp_target_t1 ? (
                          <div className="space-y-0.5">
                            <div><span className="text-amber-600 font-medium">T1Q</span> {formatCurrency(peT.t1q)}</div>
                            <div><span className="text-blue-600 font-medium">T2Q</span> {formatCurrency(peT.t1q)}–$50K</div>
                            <div><span className="text-green-600 font-medium">T3Q</span> $50,001+</div>
                          </div>
                        ) : <span className="text-gray-300">Not set</span>
                      ) : (
                        u.gp_target_t1 ? (
                          <div className="space-y-0.5">
                            <div><span className="text-amber-600 font-medium">T1</span> {formatCurrency(bdT.t1)}</div>
                            <div><span className="text-blue-600 font-medium">T2</span> {formatCurrency(bdT.t2)}</div>
                            <div><span className="text-green-600 font-medium">T3</span> {formatCurrency(bdT.t3)}</div>
                          </div>
                        ) : <span className="text-gray-300">Not set</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`badge ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditing(u); setShowModal(true); }} className="text-xs text-brand-600 hover:underline">Edit</button>
                        <button onClick={() => resetPassword(u)} className="text-xs text-gray-500 hover:underline">Reset PW</button>
                        <button onClick={() => toggleActive(u)} className={`text-xs hover:underline ${u.is_active ? 'text-orange-500' : 'text-green-600'}`}>
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button onClick={() => setDeleting(u)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <UserModal
          user={editing}
          onSave={() => { setShowModal(false); load(); }}
          onClose={() => setShowModal(false)}
          bdmList={users.filter(u => u.role === 'bdm' && u.is_active)}
        />
      )}

      {deleting && (
        <DeleteConfirmModal
          user={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
