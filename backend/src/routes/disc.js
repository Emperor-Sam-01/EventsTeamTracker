const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Get all DISC profiles (visible to all)
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dp.*, u.name, u.role FROM disc_profiles dp JOIN users u ON u.id = dp.user_id ORDER BY u.name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Get own DISC profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM disc_profiles WHERE user_id = $1', [req.user.id]);
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Save (upsert) own DISC profile
router.post('/me', authenticate, async (req, res) => {
  const { d_score, i_score, s_score, c_score, notes } = req.body;
  const scores = { D: d_score, I: i_score, S: s_score, C: c_score };
  const dominant_type = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
  try {
    const { rows } = await pool.query(
      `INSERT INTO disc_profiles (user_id, d_score, i_score, s_score, c_score, dominant_type, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         d_score=$2, i_score=$3, s_score=$4, c_score=$5, dominant_type=$6, notes=$7, updated_at=NOW()
       RETURNING *`,
      [req.user.id, d_score||25, i_score||25, s_score||25, c_score||25, dominant_type, notes||null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
