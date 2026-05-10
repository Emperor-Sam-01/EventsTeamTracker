const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

// Get Monday of the current week
function getWeekStart(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// List meetings - BDM sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const { user_id, limit = 12 } = req.query;
  const isBDM = req.user.role === 'bdm';
  const params = [];
  const conditions = [];

  if (!isBDM) {
    params.push(req.user.id);
    conditions.push(`wm.user_id = $${params.length}`);
  } else if (user_id) {
    params.push(parseInt(user_id));
    conditions.push(`wm.user_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parseInt(limit));

  try {
    const { rows } = await pool.query(
      `SELECT wm.*, u.name AS member_name,
        se.cold_emails_target, se.cold_emails_actual,
        se.cold_calls_target, se.cold_calls_actual,
        se.new_clients_met_target, se.new_clients_met_actual,
        se.proposals_sent_target, se.proposals_sent_actual,
        se.existing_clients_count, se.potential_clients_count
       FROM weekly_meetings wm
       JOIN users u ON wm.user_id = u.id
       LEFT JOIN sales_effort se ON se.user_id = wm.user_id AND se.week_start = wm.week_start
       ${where}
       ORDER BY wm.week_start DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a specific week's meeting for a user
router.get('/week/:weekStart', authenticate, async (req, res) => {
  const userId = req.query.user_id && req.user.role === 'bdm' ? parseInt(req.query.user_id) : req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT wm.*, se.*
       FROM weekly_meetings wm
       LEFT JOIN sales_effort se ON se.user_id = wm.user_id AND se.week_start = wm.week_start
       WHERE wm.user_id = $1 AND wm.week_start = $2`,
      [userId, req.params.weekStart]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Meeting not found for this week' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit / upsert weekly meeting
router.post('/', authenticate, async (req, res) => {
  const {
    week_start,
    action_items,
    cold_emails_target, cold_emails_actual,
    cold_calls_target, cold_calls_actual,
    new_clients_met_target, new_clients_met_actual,
    proposals_sent_target, proposals_sent_actual,
    existing_clients_count, potential_clients_count,
  } = req.body;

  const weekStart = week_start || getWeekStart();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: meetingRows } = await client.query(
      `INSERT INTO weekly_meetings (user_id, week_start, action_items)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, week_start) DO UPDATE
         SET action_items = EXCLUDED.action_items, updated_at = NOW()
       RETURNING *`,
      [req.user.id, weekStart, action_items || null]
    );

    const meeting = meetingRows[0];

    const { rows: effortRows } = await client.query(
      `INSERT INTO sales_effort (
         user_id, meeting_id, week_start,
         cold_emails_target, cold_emails_actual,
         cold_calls_target, cold_calls_actual,
         new_clients_met_target, new_clients_met_actual,
         proposals_sent_target, proposals_sent_actual,
         existing_clients_count, potential_clients_count
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         cold_emails_target = EXCLUDED.cold_emails_target,
         cold_emails_actual = EXCLUDED.cold_emails_actual,
         cold_calls_target = EXCLUDED.cold_calls_target,
         cold_calls_actual = EXCLUDED.cold_calls_actual,
         new_clients_met_target = EXCLUDED.new_clients_met_target,
         new_clients_met_actual = EXCLUDED.new_clients_met_actual,
         proposals_sent_target = EXCLUDED.proposals_sent_target,
         proposals_sent_actual = EXCLUDED.proposals_sent_actual,
         existing_clients_count = EXCLUDED.existing_clients_count,
         potential_clients_count = EXCLUDED.potential_clients_count,
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.id, meeting.id, weekStart,
        cold_emails_target || 0, cold_emails_actual || 0,
        cold_calls_target || 0, cold_calls_actual || 0,
        new_clients_met_target || 0, new_clients_met_actual || 0,
        proposals_sent_target || 0, proposals_sent_actual || 0,
        existing_clients_count || 0, potential_clients_count || 0,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ meeting: meetingRows[0], sales_effort: effortRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
