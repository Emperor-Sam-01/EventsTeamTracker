const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

// List clients - BDM sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const { list_type, user_id } = req.query;
  const isBDM = req.user.role === 'bdm';

  const conditions = [];
  const params = [];

  if (!isBDM) {
    params.push(req.user.id);
    conditions.push(`c.user_id = $${params.length}`);
  } else if (user_id) {
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
  const { company_name, contact_person, list_type, event_date, estimated_value, notes } = req.body;
  if (!company_name || !list_type) {
    return res.status(400).json({ error: 'company_name and list_type are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (user_id, company_name, contact_person, list_type, event_date, estimated_value, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, company_name, contact_person || null, list_type, event_date || null, estimated_value || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update client
router.put('/:id', authenticate, async (req, res) => {
  const { company_name, contact_person, list_type, event_date, estimated_value, notes, is_active } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'bdm' && existing[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const c = existing[0];
    const { rows } = await pool.query(
      `UPDATE clients SET
        company_name = $1, contact_person = $2, list_type = $3, event_date = $4,
        estimated_value = $5, notes = $6, is_active = $7, updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        company_name ?? c.company_name, contact_person ?? c.contact_person,
        list_type ?? c.list_type, event_date !== undefined ? event_date : c.event_date,
        estimated_value !== undefined ? estimated_value : c.estimated_value,
        notes !== undefined ? notes : c.notes,
        is_active !== undefined ? is_active : c.is_active,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete client
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM clients WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    if (req.user.role !== 'bdm' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.query('UPDATE clients SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
