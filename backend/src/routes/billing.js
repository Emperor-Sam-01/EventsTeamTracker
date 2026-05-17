const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

// GET /api/billing?user_id=&month=&year=
// BDM: can query any user. Others: own records only.
router.get('/', authenticate, async (req, res) => {
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  const targetUserId = isBDM && req.query.user_id ? parseInt(req.query.user_id) : req.user.id;
  const month = req.query.month ? parseInt(req.query.month) : null;
  const year  = req.query.year  ? parseInt(req.query.year)  : null;

  try {
    let q = `
      SELECT br.*, u.name AS user_name, cb.name AS confirmed_by_name
      FROM billing_records br
      LEFT JOIN users u  ON u.id = br.user_id
      LEFT JOIN users cb ON cb.id = br.confirmed_by
      WHERE br.user_id = $1
    `;
    const params = [targetUserId];
    if (month) { params.push(month); q += ` AND br.period_month = $${params.length}`; }
    if (year)  { params.push(year);  q += ` AND br.period_year  = $${params.length}`; }
    q += ' ORDER BY br.period_year DESC, br.period_month DESC, br.row_number ASC NULLS LAST, br.id ASC';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('billing GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/billing/summary — totals per (user, year, month) for tally view
// BDM only.
router.get('/summary', authenticate, requireBDM, async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year) : null;
  try {
    let q = `
      SELECT
        br.user_id,
        u.name AS user_name,
        br.period_year,
        br.period_month,
        COUNT(*)                                    AS record_count,
        SUM(br.personal_gp)                         AS total_personal_gp,
        SUM(br.estimated_gp)                        AS total_estimated_gp,
        SUM(br.invoice_amt_ex_gst)                  AS total_invoiced,
        COUNT(*) FILTER (WHERE br.confirmed_at IS NOT NULL) AS confirmed_count,
        MIN(br.import_batch)                        AS import_batch
      FROM billing_records br
      JOIN users u ON u.id = br.user_id
    `;
    const params = [];
    if (year) { params.push(year); q += ` WHERE br.period_year = $${params.length}`; }
    q += ' GROUP BY br.user_id, u.name, br.period_year, br.period_month ORDER BY br.period_year DESC, br.period_month DESC, u.name';

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('billing summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/billing/batches — list distinct (user, year, month, batch) combos
router.get('/batches', authenticate, requireBDM, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT br.user_id, u.name AS user_name, br.period_year, br.period_month, br.import_batch,
        COUNT(*) AS record_count
      FROM billing_records br
      JOIN users u ON u.id = br.user_id
      GROUP BY br.user_id, u.name, br.period_year, br.period_month, br.import_batch
      ORDER BY br.period_year DESC, br.period_month DESC, u.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/billing/confirm/:id — mark a single record as confirmed
// BDM or the record's own user
router.post('/confirm/:id', authenticate, async (req, res) => {
  const id = parseInt(req.params.id);
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM billing_records WHERE id=$1', [id]);
    if (!existing[0]) return res.status(404).json({ error: 'Record not found' });
    if (!isBDM && existing[0].user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const { rows } = await pool.query(
      `UPDATE billing_records SET confirmed_at=NOW(), confirmed_by=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [req.user.id, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('billing confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/billing/confirm-all — confirm all records for a (user_id, month, year)
router.post('/confirm-all', authenticate, requireBDM, async (req, res) => {
  const { user_id, month, year } = req.body;
  if (!user_id || !month || !year) return res.status(400).json({ error: 'user_id, month, year required' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE billing_records SET confirmed_at=NOW(), confirmed_by=$1, updated_at=NOW()
       WHERE user_id=$2 AND period_month=$3 AND period_year=$4 AND confirmed_at IS NULL`,
      [req.user.id, user_id, month, year]
    );
    res.json({ updated: rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/billing/batch — delete all records for a specific import batch
router.delete('/batch', authenticate, requireBDM, async (req, res) => {
  const { user_id, month, year, batch } = req.body;
  if (!user_id || !month || !year || !batch) return res.status(400).json({ error: 'user_id, month, year, batch required' });
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM billing_records WHERE user_id=$1 AND period_month=$2 AND period_year=$3 AND import_batch=$4',
      [user_id, month, year, batch]
    );
    res.json({ deleted: rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
