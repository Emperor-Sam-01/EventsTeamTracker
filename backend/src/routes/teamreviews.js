const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const router = express.Router();

// List all team reviews (all users can see)
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM team_reviews ORDER BY year DESC, quarter DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Get live stats for a quarter (for BDM review creation)
router.get('/stats', authenticate, requireBDM, async (req, res) => {
  const { quarter, year } = req.query;
  const q = parseInt(quarter); const y = parseInt(year);
  if (!q || !y) return res.status(400).json({ error: 'quarter and year required' });
  const startMonth = (q - 1) * 3 + 1;
  const months = [startMonth, startMonth+1, startMonth+2];
  try {
    const { rows: gpRows } = await pool.query(
      `SELECT COALESCE(SUM(gp),0) AS total_gp, COUNT(*) AS total_projects
       FROM projects WHERE period_year=$1 AND period_month = ANY($2) AND status IN ('confirmed','completed')`,
      [y, months]
    );
    const { rows: clientRows } = await pool.query(
      `SELECT list_type, COUNT(*) AS cnt FROM clients WHERE is_active=TRUE GROUP BY list_type`
    );
    const clients = { prospect:0, pipeline:0, current:0 };
    clientRows.forEach(r => { clients[r.list_type] = parseInt(r.cnt); });
    res.json({
      total_gp: parseFloat(gpRows[0]?.total_gp||0),
      total_projects: parseInt(gpRows[0]?.total_projects||0),
      total_prospects: clients.prospect,
      total_pipeline: clients.pipeline,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Create or update a team review (BDM only)
router.post('/', authenticate, requireBDM, async (req, res) => {
  const { quarter, year, total_gp, total_projects, total_prospects, total_pipeline, highlights, challenges, action_items } = req.body;
  if (!quarter || !year) return res.status(400).json({ error: 'quarter and year required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO team_reviews (quarter, year, total_gp, total_projects, total_prospects, total_pipeline, highlights, challenges, action_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (quarter, year) DO UPDATE SET
         total_gp=$3, total_projects=$4, total_prospects=$5, total_pipeline=$6,
         highlights=$7, challenges=$8, action_items=$9, updated_at=NOW()
       RETURNING *`,
      [quarter, year, total_gp||0, total_projects||0, total_prospects||0, total_pipeline||0, highlights||null, challenges||null, action_items||null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
