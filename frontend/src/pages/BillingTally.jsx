import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  return d.slice(0, 10);
}

function badge(confirmed) {
  return confirmed
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Confirmed</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Pending</span>;
}

export default function BillingTally() {
  const { user, token } = useAuth();
  const isBDM = ['bdm', 'exec_pa'].includes(user?.role);

  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear, setSelYear]   = useState(now.getFullYear());
  const [selUser, setSelUser]   = useState(isBDM ? '' : String(user?.id));
  const [users, setUsers]       = useState([]);
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [summary, setSummary]   = useState(null);
  const [confirming, setConfirming] = useState(null);

  // Build year list from 2022 to now
  const years = [];
  for (let y = now.getFullYear(); y >= 2022; y--) years.push(y);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Load user list for BDM filter
  useEffect(() => {
    if (!isBDM) return;
    fetch(`${API}/users`, { headers })
      .then(r => r.json())
      .then(data => setUsers(data.filter(u => u.role !== 'exec_pa')))
      .catch(() => {});
  }, [isBDM]);

  const load = useCallback(() => {
    const uid = isBDM ? selUser : user.id;
    if (!uid) return;
    setLoading(true);
    fetch(`${API}/billing?user_id=${uid}&month=${selMonth}&year=${selYear}`, { headers })
      .then(r => r.json())
      .then(data => {
        setRecords(Array.isArray(data) ? data : []);
        // Compute summary locally
        const totalPersonalGP   = data.reduce((s, r) => s + (parseFloat(r.personal_gp)   || 0), 0);
        const totalEstimatedGP  = data.reduce((s, r) => s + (parseFloat(r.estimated_gp)  || 0), 0);
        const totalInvoiced     = data.reduce((s, r) => s + (parseFloat(r.invoice_amt_ex_gst) || 0), 0);
        const confirmedCount    = data.filter(r => r.confirmed_at).length;
        setSummary({ totalPersonalGP, totalEstimatedGP, totalInvoiced, confirmedCount, total: data.length });
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [selUser, selMonth, selYear]);

  useEffect(() => { load(); }, [load]);

  async function confirmRow(id) {
    setConfirming(id);
    try {
      const r = await fetch(`${API}/billing/confirm/${id}`, { method: 'POST', headers });
      if (r.ok) load();
    } finally {
      setConfirming(null);
    }
  }

  async function confirmAll() {
    const uid = isBDM ? selUser : user.id;
    if (!uid) return;
    await fetch(`${API}/billing/confirm-all`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: parseInt(uid), month: selMonth, year: selYear }),
    });
    load();
  }

  const normalRecords  = records.filter(r => r.section !== 'delayed');
  const delayedRecords = records.filter(r => r.section === 'delayed');
  const pendingCount   = records.filter(r => !r.confirmed_at).length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Billing Tally</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review imported billing records and confirm against project submissions.
          </p>
        </div>
        {pendingCount > 0 && isBDM && (
          <button
            onClick={confirmAll}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Confirm All ({pendingCount} pending)
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {isBDM && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team Member</label>
            <select
              value={selUser}
              onChange={e => setSelUser(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— select member —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <select
            value={selMonth}
            onChange={e => setSelMonth(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
          <select
            value={selYear}
            onChange={e => setSelYear(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Invoiced', value: formatCurrency(summary.totalInvoiced), color: 'blue' },
            { label: 'Total Est. GP', value: formatCurrency(summary.totalEstimatedGP), color: 'indigo' },
            { label: 'Personal GP', value: formatCurrency(summary.totalPersonalGP), color: 'green' },
            { label: 'Confirmed', value: `${summary.confirmedCount} / ${summary.total}`, color: summary.confirmedCount === summary.total ? 'green' : 'amber' },
          ].map(card => (
            <div key={card.label} className={`bg-${card.color}-50 border border-${card.color}-200 rounded-xl p-4`}>
              <div className={`text-xs font-medium text-${card.color}-600 mb-1`}>{card.label}</div>
              <div className={`text-lg font-bold text-${card.color}-900`}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🧾</div>
          <div className="font-medium">No billing records found</div>
          <div className="text-sm mt-1">
            Import a CSV using the CLI script:<br/>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
              node scripts/import-billing.js --file sheet.csv --user-id &lt;id&gt; --month {selMonth} --year {selYear}
            </code>
          </div>
        </div>
      )}

      {!loading && normalRecords.length > 0 && (
        <RecordTable
          title={`Billing Records — ${MONTH_NAMES[selMonth-1]} ${selYear}`}
          records={normalRecords}
          confirming={confirming}
          onConfirm={confirmRow}
          isBDM={isBDM}
        />
      )}

      {!loading && delayedRecords.length > 0 && (
        <RecordTable
          title="Delayed Billing"
          records={delayedRecords}
          confirming={confirming}
          onConfirm={confirmRow}
          isBDM={isBDM}
          amber
        />
      )}
    </div>
  );
}

function RecordTable({ title, records, confirming, onConfirm, isBDM, amber }) {
  const totalPersonalGP  = records.reduce((s, r) => s + (parseFloat(r.personal_gp)  || 0), 0);
  const totalEstimatedGP = records.reduce((s, r) => s + (parseFloat(r.estimated_gp) || 0), 0);

  return (
    <div className={`rounded-xl border ${amber ? 'border-amber-200' : 'border-gray-200'} overflow-hidden`}>
      <div className={`px-4 py-3 flex items-center justify-between ${amber ? 'bg-amber-50' : 'bg-gray-50'}`}>
        <h2 className={`font-semibold text-sm ${amber ? 'text-amber-800' : 'text-gray-800'}`}>{title}</h2>
        <div className="text-xs text-gray-500">{records.length} records · Personal GP: {formatCurrency(totalPersonalGP)}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['#','Client','Invoice No.','Type','Invoice (ex-GST)','Est. GP','Personal GP%','Personal GP','Remarks','Status',''].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map(r => (
              <tr key={r.id} className={r.confirmed_at ? 'bg-green-50/40' : 'bg-white'}>
                <td className="px-3 py-2 text-gray-400">{r.row_number ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900 max-w-[180px] truncate" title={r.client_name}>{r.client_name || '—'}</div>
                  <div className="text-gray-400">{r.billing_company}</div>
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-[120px]">
                  <div className="truncate" title={r.invoice_nos}>{r.invoice_nos || '—'}</div>
                  {r.quotation_no && <div className="text-gray-400">{r.quotation_no}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${r.account_type === 'Shared' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                    {r.account_type || '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">{r.invoice_amt_ex_gst != null ? formatCurrency(r.invoice_amt_ex_gst) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{r.estimated_gp != null ? formatCurrency(r.estimated_gp) : '—'}</td>
                <td className="px-3 py-2 text-right">{fmtPct(r.personal_gp_pct)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">
                  {r.personal_gp != null ? formatCurrency(r.personal_gp) : '—'}
                </td>
                <td className="px-3 py-2 max-w-[150px]">
                  {r.remarks_bd && <div className="text-gray-600 truncate" title={r.remarks_bd}>{r.remarks_bd}</div>}
                  {r.remarks_finance && <div className="text-blue-600 truncate" title={r.remarks_finance}>{r.remarks_finance}</div>}
                </td>
                <td className="px-3 py-2">{badge(r.confirmed_at)}</td>
                <td className="px-3 py-2">
                  {!r.confirmed_at && (
                    <button
                      onClick={() => onConfirm(r.id)}
                      disabled={confirming === r.id}
                      className="px-2 py-1 bg-brand-600 text-white rounded text-xs hover:bg-brand-700 transition-colors disabled:opacity-50"
                    >
                      {confirming === r.id ? '...' : 'Confirm'}
                    </button>
                  )}
                  {r.confirmed_at && (
                    <div className="text-gray-400 text-xs">{fmtDate(r.confirmed_at)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200 font-medium">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-gray-600">Totals</td>
              <td className="px-3 py-2 text-right font-mono">
                {formatCurrency(records.reduce((s,r) => s + (parseFloat(r.invoice_amt_ex_gst)||0), 0))}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstimatedGP)}</td>
              <td />
              <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalPersonalGP)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
