export const formatCurrency = (val) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(val || 0);

export const formatPct = (val, total) =>
  total ? `${Math.round((val / total) * 100)}%` : '0%';

export const ROLE_LABELS = {
  bdm: 'BD Manager / Team Lead',
  bde: 'BD Executive',
  pe: 'Project Executive',
  bda: 'BD Assistant',
  pa: 'Project Assistant',
};

export const ROLE_COLORS = {
  bdm: 'bg-purple-100 text-purple-800',
  bde: 'bg-blue-100 text-blue-800',
  pe: 'bg-teal-100 text-teal-800',
  bda: 'bg-amber-100 text-amber-800',
  pa: 'bg-orange-100 text-orange-800',
};

export const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export const TIER_COLORS = {
  0: 'text-red-600',
  1: 'text-yellow-600',
  2: 'text-blue-600',
  3: 'text-green-600',
};

export const monthName = (m) =>
  new Date(2000, m - 1).toLocaleString('default', { month: 'short' });

export const getMonthYear = () => {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
};
