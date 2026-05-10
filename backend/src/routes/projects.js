const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

// List projects - BDM sees all, others see own
router.get('/', authenticate, async (req, res) => {
  const { month, year, user_id, status } = req.query;
  const isBDM = req.user.role === 'bdm';
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
  const { title, client_name, project_type, event_date, revenue, cost, status, assigned_to, period_month, period_year, notes } = req.body;
  if (!title || !client_name || revenue == null || cost == null) {
    return res.status(400).json({ error: 'title, client_name, revenue, cost are required' });
  }

  // Only BDM can assign to others
  const assignee = req.user.role === 'bdm' && assigned_to ? assigned_to : req.user.id;

  const now = new Date();
  const pMonth = period_month || now.getMonth() + 1;
  const pYear = period_year || now.getFullYear();

  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (title, client_name, project_type, event_date, revenue, cost, status, assigned_to, period_month, period_year, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [title, client_name, project_type || 'events', event_date || null, revenue, cost, status || 'pending', assignee, pMonth, pYear, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update project
router.put('/:id', authenticate, async (req, res) => {
  const { title, client_name, project_type, event_date, revenue, cost, status, assigned_to, period_month, period_year, notes } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role !== 'bdm' && existing[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const p = existing[0];
    const { rows } = await pool.query(
      `UPDATE projects SET
        title = $1, client_name = $2, project_type = $3, event_date = $4,
        revenue = $5, cost = $6, status = $7, assigned_to = $8,
        period_month = $9, period_year = $10, notes = $11, updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [
        title ?? p.title, client_name ?? p.client_name, project_type ?? p.project_type,
        event_date !== undefined ? event_date : p.event_date,
        revenue ?? p.revenue, cost ?? p.cost, status ?? p.status,
        req.user.role === 'bdm' && assigned_to ? assigned_to : p.assigned_to,
        period_month ?? p.period_month, period_year ?? p.period_year,
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
