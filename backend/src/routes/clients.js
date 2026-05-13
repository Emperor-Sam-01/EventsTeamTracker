const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// List clients - BDM/exec_pa sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const { list_type, user_id } = req.query;
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);

  const conditions = [];
  const params = [];

  if (user_id) {
    params.push(parseInt(user_id));
    conditions.push(`c.user_id = $${params.length}`);
  }

  if (list_type) {
    params.push(list_type);
    conditions.push(`c.list_type = $${params.length}`);
  }

  conditions.push('c.is_active = TRUE');

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS member_name
       FROM clients c JOIN users u ON c.user_id = u.id
       ${where}
       ORDER BY c.list_type, c.company_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create client
router.post('/', authenticate, async (req, res) => {
  const {
    company_name, project_name, project_type, contact_name, contact_details,
    list_type, event_date, estimated_revenue, estimated_gp, google_link, notes, loss_reason,
  } = req.body;
  if (!company_name || !list_type) {
    return res.status(400).json({ error: 'company_name and list_type are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients
         (user_id, company_name, project_name, project_type, contact_name, contact_details,
          list_type, event_date, estimated_revenue, estimated_gp, google_link, notes, loss_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.user.id, company_name, project_name || null, project_type || null,
        contact_name || null, contact_details || null,
        list_type, event_date || null,
        estimated_revenue || null, estimated_gp || null,
        google_link || null, notes || null, loss_reason || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update client
router.put('/:id', authenticate, async (req, res) => {
  const {
    company_name, project_name, project_type, contact_name, contact_details,
    list_type, event_date, estimated_revenue, estimated_gp, google_link, notes, is_active, loss_reason,
  } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Client not found' });
    const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
    if (!isBDM && existing[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const c = existing[0];
    const { rows } = await pool.query(
      `UPDATE clients SET
        company_name = $1, project_name = $2, project_type = $3,
        contact_name = $4, contact_details = $5, list_type = $6,
        event_date = $7, estimated_revenue = $8, estimated_gp = $9,
        google_link = $10, notes = $11, is_active = $12, loss_reason = $13, updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [
        company_name ?? c.company_name,
        project_name !== undefined ? project_name : c.project_name,
        project_type !== undefined ? project_type : c.project_type,
        contact_name !== undefined ? contact_name : c.contact_name,
        contact_details !== undefined ? contact_details : c.contact_details,
        list_type ?? c.list_type,
        event_date !== undefined ? event_date : c.event_date,
        estimated_revenue !== undefined ? estimated_revenue : c.estimated_revenue,
        estimated_gp !== undefined ? estimated_gp : c.estimated_gp,
        google_link !== undefined ? google_link : c.google_link,
        notes !== undefined ? notes : c.notes,
        is_active !== undefined ? is_active : c.is_active,
        loss_reason !== undefined ? loss_reason : c.loss_reason,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete client (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM clients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
    if (!isBDM && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.query('UPDATE clients SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
