const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const router = express.Router();

// List reviews — BDM sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  try {
    const { rows } = await pool.query(
      `SELECT ir.*, u.name AS user_name, u.role AS user_role
       FROM individual_reviews ir JOIN users u ON u.id = ir.user_id
       ${isBDM ? '' : 'WHERE ir.user_id = $1'}
       ORDER BY ir.year DESC, ir.quarter DESC`,
      isBDM ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Create or update a review (BDM only)
router.post('/', authenticate, requireBDM, async (req, res) => {
  const { user_id, quarter, year, answers, summary, action_items } = req.body;
  if (!user_id || !quarter || !year) return res.status(400).json({ error: 'user_id, quarter, year required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO individual_reviews (user_id, reviewer_id, quarter, year, answers, summary, action_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, quarter, year) DO UPDATE SET
         answers=$5, summary=$6, action_items=$7, reviewer_id=$2, updated_at=NOW()
       RETURNING *`,
      [user_id, req.user.id, quarter, year, JSON.stringify(answers||{}), summary||null, action_items||null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
