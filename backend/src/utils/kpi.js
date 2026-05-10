// Returns tenure in months from join_date to today
function getTenureMonths(joinDate) {
  const join = new Date(joinDate);
  const now = new Date();
  return (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
}

// Returns multiplier for assistant roles based on tenure
function getAssistantMultiplier(tenureMonths) {
  if (tenureMonths <= 6) return 0.0;
  if (tenureMonths <= 12) return 0.25;
  if (tenureMonths <= 18) return 0.5;
  if (tenureMonths <= 24) return 0.8;
  return 1.0;
}

// Returns GP tier (1/2/3) for a given role and GP amount
// BDE: monthly GP | PE: quarterly GP | BDM: monthly personal GP
function getGPTier(role, gp) {
  if (role === 'bde' || role === 'sbde') {
    if (gp >= 18000) return 3;
    if (gp >= 12000) return 2;
    if (gp >= 8000) return 1;
    return 0;
  }
  if (role === 'pe' || role === 'spe') {
    if (gp >= 50000) return 3;
    if (gp >= 18000) return 2;
    if (gp > 0) return 1;
    return 0;
  }
  if (role === 'bdm') {
    if (gp >= 10000) return 1;
    return 0;
  }
  return 0;
}

// GP targets per role
const GP_TARGETS = {
  bde:  { t1: 8000, t2: 12000, t3: 18000, period: 'monthly' },
  sbde: { t1: 8000, t2: 12000, t3: 18000, period: 'monthly' },
  pe:   { t1: 18000, t2: 50000, t3: null, period: 'quarterly' },
  spe:  { t1: 18000, t2: 50000, t3: null, period: 'quarterly' },
  bdm:  { base: 10000, period: 'monthly' },
};

// Sales effort baselines per role (monthly)
function getSalesTargets(role, tier = 1) {
  const tierIndex = Math.max(1, Math.min(3, tier)) - 1;

  if (role === 'bde' || role === 'sbde') {
    return {
      cold_emails: 150,
      cold_calls: 100,
      new_clients_met: [1, 2, 3][tierIndex],
      proposals_sent: [2, 3, 5][tierIndex],
      max_existing_clients: 5,
      max_potential_clients: 10,
    };
  }
  if (role === 'pe' || role === 'spe') {
    return {
      cold_emails: 250,
      cold_calls: 0,
      new_clients_met: 0,
      proposals_sent: [3, 5, 7][tierIndex],
      max_existing_clients: 6,
      max_potential_clients: 8,
    };
  }
  // BDM has no enforced cold outreach baseline in the system
  return {
    cold_emails: 0,
    cold_calls: 0,
    new_clients_met: 0,
    proposals_sent: 0,
    max_existing_clients: null,
    max_potential_clients: null,
  };
}

// Management cost per role
function getManagementCost(role) {
  if (role === 'bda' || role === 'pa') return 700;
  if (role === 'pe' || role === 'spe') return 1300;
  return 1900; // bde, sbde, bdm
}

// NP = GP - salary - cpf/permit - management cost
function calculateNP(gp, salary, cpfType, cpfRate, permitCost, role) {
  const cpfCost = cpfType === 'foreign' ? permitCost : salary * cpfRate;
  const mgmtCost = getManagementCost(role);
  return gp - salary - cpfCost - mgmtCost;
}

module.exports = {
  getTenureMonths,
  getAssistantMultiplier,
  getGPTier,
  getSalesTargets,
  getManagementCost,
  calculateNP,
  GP_TARGETS,
};
