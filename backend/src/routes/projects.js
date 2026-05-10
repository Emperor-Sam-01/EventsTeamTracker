const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

// List projects - BDM sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const { month, year, user_id, status } = req.query;
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  const targetUserId = isBDM && user_id ? parseInt(user_id) : req.user.id;

  const conditions = [];
  const params = [];

  if (!isBDM) {
    params.push(req.user.id);
    conditions.push(`p.assigned_to = $${params.length}`);
  } else if (user_id) {
    params.push(targetUserId);
    conditions.push(`p.assigned_to = $${params.length}`);
  }

  if (month) {
    params.push(parseInt(month));
    conditions.push(`p.period_month = $${params.length}`);
  }
  if (year) {
    params.push(parseInt(year));
    conditions.push(`p.period_year = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS assigned_name, u.role AS assigned_role
       FROM projects p
       JOIN users u ON p.assigned_to = u.id
       ${where}
       ORDER BY p.event_date DESC NULLS LAST, p.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS assigned_name FROM projects p JOIN users u ON p.assigned_to = u.id WHERE p.id = $1`,
      [req.params.id]
    );
    const project = rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'bdm' && project.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create project
router.post('/', authenticate, async (req, res) => {
  const { title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, notes } = req.body;
  if (!title || !client_name || revenue == null || cost == null) {
    return res.status(400).json({ error: 'title, client_name, revenue, cost are required' });
  }

  const assignee = req.user.role === 'bdm' && assigned_to ? assigned_to : req.user.id;

  // Derive GP period from confirmation_date (falls back to today)
  const periodDate = confirmation_date ? new Date(confirmation_date) : new Date();
  const pMonth = periodDate.getMonth() + 1;
  const pYear = periodDate.getFullYear();

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, period_month, period_year, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, client_name, project_type || 'events', event_date || null, confirmation_date || null, revenue, cost, status || 'pending', assignee, pMonth, pYear, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update project
router.put('/:id', authenticate, async (req, res) => {
  const { title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, notes } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'bdm' && existing[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const p = existing[0];
    // Re-derive period if confirmation_date is being updated
    const newConfirmation = confirmation_date !== undefined ? confirmation_date : p.confirmation_date;
    const periodDate = newConfirmation ? new Date(newConfirmation) : new Date();
    const pMonth = newConfirmation ? periodDate.getMonth() + 1 : p.period_month;
    const pYear = newConfirmation ? periodDate.getFullYear() : p.period_year;

    const { rows } = await pool.query(
      `UPDATE projects SET
        title = $1, client_name = $2, project_type = $3, event_date = $4,
        confirmation_date = $5, revenue = $6, cost = $7, status = $8,
        assigned_to = $9, period_month = $10, period_year = $11, notes = $12, updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [
        title ?? p.title, client_name ?? p.client_name, project_type ?? p.project_type,
        event_date !== undefined ? event_date : p.event_date,
        newConfirmation,
        revenue ?? p.revenue, cost ?? p.cost, status ?? p.status,
        req.user.role === 'bdm' && assigned_to ? assigned_to : p.assigned_to,
        pMonth, pYear,
        notes !== undefined ? notes : p.notes,
        req.params.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete project (BDM only)
router.delete('/:id', authenticate, requireBDM, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
