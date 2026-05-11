const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const { getTenureMonths, getAssistantMultiplier, getGPTier, getSalesTargets, calculateNP, GP_TARGETS } = require('../utils/kpi');

const router = express.Router();

// Individual dashboard - own stats (or any user if BDM)
router.get('/individual/:userId', authenticate, async (req, res) => {
  const targetId = parseInt(req.params.userId);
  const isBDM = req.user.role === 'bdm';

  if (!isBDM && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { month, year } = req.query;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  try {
    // User profile
    const { rows: userRows } = await pool.query('SELECT * FROM users WHERE id = $1', [targetId]);
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];
    const tenureMonths = getTenureMonths(user.join_date);
    const multiplier = ['bda', 'pa'].includes(user.role) ? getAssistantMultiplier(tenureMonths) : 1;

    // GP with crew distribution: own projects without crew + crew-allocated GP
    const { rows: projectRows } = await pool.query(
      `SELECT gp, period_month, period_year FROM projects
       WHERE assigned_to = $1 AND status IN ('confirmed','completed')
         AND NOT EXISTS (SELECT 1 FROM project_crew WHERE project_id = id)
       UNION ALL
       SELECT pc.gp_allocated AS gp, p.period_month, p.period_year
       FROM project_crew pc JOIN projects p ON p.id = pc.project_id
       WHERE pc.user_id = $1 AND p.status IN ('confirmed','completed')`,
      [targetId]
    );

    // Monthly GP for current month
    const monthlyGP = projectRows
      .filter(p => p.period_month === m && p.period_year === y)
      .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);

    // Yearly GP (full calendar year)
    const yearlyGP = projectRows
      .filter(p => p.period_year === y)
      .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);

    // Quarterly GP (current quarter)
    const quarterStart = Math.floor((m - 1) / 3) * 3 + 1;
    const quarterMonths = [quarterStart, quarterStart + 1, quarterStart + 2];
    const quarterlyGP = projectRows
      .filter(p => p.period_year === y && quarterMonths.includes(p.period_month))
      .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);

    // GP for NP calculation (monthly)
    const gpForNP = monthlyGP;
    const np = calculateNP(gpForNP, parseFloat(user.salary), user.cpf_type, parseFloat(user.cpf_rate), parseFloat(user.permit_cost), user.role);

    // GP tier
    const gpForTier = (user.role === 'pe' || user.role === 'spe') ? quarterlyGP : monthlyGP;
    const tier = getGPTier(user.role, gpForTier);

    // Sales effort history (last 12 weeks)
    const { rows: effortRows } = await pool.query(
      `SELECT * FROM sales_effort WHERE user_id = $1 ORDER BY week_start DESC LIMIT 12`,
      [targetId]
    );

    // Latest week's sales effort for targets vs actuals
    const latestEffort = effortRows[0] || null;

    // Client counts
    const { rows: clientCounts } = await pool.query(
      `SELECT list_type, COUNT(*) AS count FROM clients WHERE user_id = $1 AND is_active = TRUE GROUP BY list_type`,
      [targetId]
    );
    const clientSummary = { current: 0, pipeline: 0, prospect: 0 };
    clientCounts.forEach(c => { clientSummary[c.list_type] = parseInt(c.count); });

    // Adjusted targets based on role and multiplier
    const salesTargets = getSalesTargets(user.role, Math.max(1, tier));
    const adjustedTargets = {
      cold_emails: Math.round(salesTargets.cold_emails * multiplier),
      cold_calls: Math.round(salesTargets.cold_calls * multiplier),
      new_clients_met: Math.round(salesTargets.new_clients_met * multiplier),
      proposals_sent: Math.round(salesTargets.proposals_sent * multiplier),
      max_existing_clients: salesTargets.max_existing_clients,
      max_potential_clients: salesTargets.max_potential_clients,
    };

    // Monthly GP trend (last 6 months)
    const gpTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      const mm = d.getMonth() + 1;
      const yy = d.getFullYear();
      const monthGP = projectRows
        .filter(p => p.period_month === mm && p.period_year === yy)
        .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);
      gpTrend.push({ month: `${yy}-${String(mm).padStart(2, '0')}`, gp: monthGP });
    }

    res.json({
      user: {
        id: user.id, name: user.name, role: user.role,
        join_date: user.join_date, tenure_months: tenureMonths, multiplier,
      },
      gp: {
        monthly: monthlyGP,
        quarterly: quarterlyGP,
        yearly: yearlyGP,
        tier,
        np,
        targets: GP_TARGETS[user.role] || null,
      },
      clients: clientSummary,
      sales_effort: {
        latest: latestEffort,
        history: effortRows,
        targets: adjustedTargets,
      },
      gp_trend: gpTrend,
      period: { month: m, year: y },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Team overview - BDM only
router.get('/team', authenticate, requireBDM, async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  try {
    const { rows: users } = await pool.query(
      `SELECT id, name, role, join_date, salary, cpf_type, cpf_rate, permit_cost
       FROM users WHERE is_active = TRUE AND role != 'exec_pa' ORDER BY name`
    );

    // GP with crew distribution for team view
    const { rows: projects } = await pool.query(
      `SELECT assigned_to AS user_id, gp, period_month, period_year FROM projects
       WHERE status IN ('confirmed','completed') AND period_year = $1
         AND NOT EXISTS (SELECT 1 FROM project_crew WHERE project_id = id)
       UNION ALL
       SELECT pc.user_id, pc.gp_allocated AS gp, p.period_month, p.period_year
       FROM project_crew pc JOIN projects p ON p.id = pc.project_id
       WHERE p.status IN ('confirmed','completed') AND p.period_year = $1`,
      [y]
    );

    const { rows: clientCounts } = await pool.query(
      `SELECT user_id, list_type, COUNT(*) AS count FROM clients WHERE is_active = TRUE GROUP BY user_id, list_type`
    );

    const { rows: latestEfforts } = await pool.query(
      `SELECT DISTINCT ON (user_id) * FROM sales_effort ORDER BY user_id, week_start DESC`
    );

    const quarterStart = Math.floor((m - 1) / 3) * 3 + 1;
    const quarterMonths = [quarterStart, quarterStart + 1, quarterStart + 2];

    const members = users.map(user => {
      const tenureMonths = getTenureMonths(user.join_date);
      const multiplier = ['bda', 'pa'].includes(user.role) ? getAssistantMultiplier(tenureMonths) : 1;

      const userProjects = projects.filter(p => p.user_id === user.id);
      const monthlyGP = userProjects
        .filter(p => p.period_month === m)
        .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);
      const quarterlyGP = userProjects
        .filter(p => quarterMonths.includes(p.period_month))
        .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);

      const ytdGP = userProjects
        .filter(p => p.period_month <= m)
        .reduce((sum, p) => sum + parseFloat(p.gp || 0), 0);

      const monthlyFixedCost = (() => {
        if (user.role === 'exec_pa') return 0;
        const sal = parseFloat(user.salary) || 0;
        const cpfCost = user.cpf_type === 'cpf'
          ? sal * (parseFloat(user.cpf_rate) || 0)
          : parseFloat(user.permit_cost) || 0;
        const mgmt = ['bda', 'pa'].includes(user.role) ? 700
                   : ['pe', 'spe'].includes(user.role) ? 1300 : 1900;
        return sal + cpfCost + mgmt;
      })();
      const ytdNP = ytdGP - monthlyFixedCost * m;

      const gpForTier = (user.role === 'pe' || user.role === 'spe') ? quarterlyGP : monthlyGP;
      const tier = getGPTier(user.role, gpForTier);
      const np = calculateNP(monthlyGP, parseFloat(user.salary), user.cpf_type, parseFloat(user.cpf_rate), parseFloat(user.permit_cost), user.role);

      const userClients = clientCounts.filter(c => c.user_id === user.id);
      const clientSummary = { current: 0, pipeline: 0, prospect: 0 };
      userClients.forEach(c => { clientSummary[c.list_type] = parseInt(c.count); });

      const effort = latestEfforts.find(e => e.user_id === user.id) || null;

      const salesTargets = getSalesTargets(user.role, Math.max(1, tier));
      const adjustedTargets = {
        cold_emails: Math.round(salesTargets.cold_emails * multiplier),
        cold_calls: Math.round(salesTargets.cold_calls * multiplier),
        new_clients_met: Math.round(salesTargets.new_clients_met * multiplier),
        proposals_sent: Math.round(salesTargets.proposals_sent * multiplier),
      };

      // Identify gaps
      const gaps = [];
      if (effort) {
        if (effort.cold_emails_actual < adjustedTargets.cold_emails) {
          gaps.push({ metric: 'Cold Emails', actual: effort.cold_emails_actual, target: adjustedTargets.cold_emails });
        }
        if (['bde','sbde'].includes(user.role) && effort.cold_calls_actual < adjustedTargets.cold_calls) {
          gaps.push({ metric: 'Cold Calls', actual: effort.cold_calls_actual, target: adjustedTargets.cold_calls });
        }
        if (effort.proposals_sent_actual < adjustedTargets.proposals_sent) {
          gaps.push({ metric: 'Proposals Sent', actual: effort.proposals_sent_actual, target: adjustedTargets.proposals_sent });
        }
      }

      const gpTarget = ['bde','sbde'].includes(user.role) ? GP_TARGETS.bde.t1 :
                       ['pe','spe'].includes(user.role) ? GP_TARGETS.pe.t1 :
                       user.role === 'bdm' ? GP_TARGETS.bdm.base : 0;
      const adjustedGPTarget = gpTarget * multiplier;
      if (gpForTier < adjustedGPTarget) {
        gaps.push({
          metric: 'GP Target',
          actual: gpForTier,
          target: adjustedGPTarget,
          note: `${Math.round((gpForTier / adjustedGPTarget) * 100)}% of target`,
        });
      }

      return {
        id: user.id, name: user.name, role: user.role,
        join_date: user.join_date, tenure_months: tenureMonths, multiplier,
        gp: { monthly: monthlyGP, quarterly: quarterlyGP, ytd: ytdGP, ytd_np: ytdNP, tier, np },
        clients: clientSummary,
        latest_effort: effort,
        adjusted_targets: adjustedTargets,
        gaps,
      };
    });

    // Benchmarks (exclude BDM from GP ranking)
    const rankable = members.filter(m => m.role !== 'bdm');
    const gpValues = rankable.map(m => m.gp.monthly);
    const teamGP = gpValues.reduce((a, b) => a + b, 0);
    const teamNP = members.reduce((sum, mem) => sum + mem.gp.np, 0);
    const avgGP = rankable.length ? teamGP / rankable.length : 0;
    const bestGP = Math.max(...gpValues, 0);
    const worstGP = rankable.length ? Math.min(...gpValues) : 0;

    const ytdGPValues = rankable.map(mem => mem.gp.ytd);
    const ytdTeamGP = ytdGPValues.reduce((a, b) => a + b, 0);
    const ytdTeamNP = members.reduce((sum, mem) => sum + mem.gp.ytd_np, 0);
    const projectedTeamGP = m > 0 ? (ytdTeamGP / m) * 12 : 0;
    const projectedTeamNP = m > 0 ? (ytdTeamNP / m) * 12 : 0;
    const avgYtdGP = rankable.length ? ytdTeamGP / rankable.length : 0;

    res.json({
      members,
      benchmarks: {
        team_gp: teamGP, team_np: teamNP,
        avg_gp: avgGP, best_gp: bestGP, worst_gp: worstGP,
        ytd_team_gp: ytdTeamGP, ytd_team_np: ytdTeamNP,
        projected_team_gp: projectedTeamGP, projected_team_np: projectedTeamNP,
        avg_ytd_gp: avgYtdGP,
      },
      period: { month: m, year: y },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Anonymous benchmarks for individual view (no identity revealed)
router.get('/benchmarks', authenticate, async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.role,
        COALESCE(SUM(p.gp) FILTER (WHERE p.period_month = $1 AND p.period_year = $2), 0) AS monthly_gp
       FROM users u
       LEFT JOIN projects p ON p.assigned_to = u.id AND p.status IN ('confirmed','completed')
       WHERE u.is_active = TRUE AND u.role NOT IN ('bdm', 'exec_pa')
       GROUP BY u.id, u.role`,
      [m, y]
    );

    const gpValues = rows.map(r => parseFloat(r.monthly_gp));
    const avg = gpValues.length ? gpValues.reduce((a, b) => a + b, 0) / gpValues.length : 0;
    const best = Math.max(...gpValues, 0);
    const worst = gpValues.length ? Math.min(...gpValues) : 0;

    res.json({
      avg_gp: avg, best_gp: best, worst_gp: worst,
      period: { month: m, year: y },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 12-month team GP benchmark trend for chart lines
router.get('/benchmarks-trend', authenticate, async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const m = parseInt(month) || now.getMonth() + 1;
  const y = parseInt(year) || now.getFullYear();

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  try {
    const { rows } = await pool.query(
      `WITH crew_gp AS (
        SELECT assigned_to AS user_id, gp, period_month, period_year FROM projects
        WHERE status IN ('confirmed','completed')
          AND NOT EXISTS (SELECT 1 FROM project_crew WHERE project_id = id)
        UNION ALL
        SELECT pc.user_id, pc.gp_allocated AS gp, p.period_month, p.period_year
        FROM project_crew pc JOIN projects p ON p.id = pc.project_id
        WHERE p.status IN ('confirmed','completed')
      ),
      user_monthly AS (
        SELECT cg.user_id, cg.period_year, cg.period_month, SUM(cg.gp) AS monthly_gp
        FROM crew_gp cg
        JOIN users u ON u.id = cg.user_id
        WHERE u.is_active = TRUE AND u.role NOT IN ('bdm', 'exec_pa')
        GROUP BY cg.user_id, cg.period_year, cg.period_month
      )
      SELECT period_year, period_month,
        AVG(monthly_gp) AS avg_gp,
        MAX(monthly_gp) AS best_gp,
        MIN(monthly_gp) AS worst_gp
      FROM user_monthly
      GROUP BY period_year, period_month
      ORDER BY period_year, period_month`
    );

    const result = months.map(({ month: mm, year: yy }) => {
      const found = rows.find(r => parseInt(r.period_month) === mm && parseInt(r.period_year) === yy);
      return {
        month: `${yy}-${String(mm).padStart(2, '0')}`,
        avg_gp: found ? parseFloat(found.avg_gp) : null,
        best_gp: found ? parseFloat(found.best_gp) : null,
        worst_gp: found ? parseFloat(found.worst_gp) : null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
