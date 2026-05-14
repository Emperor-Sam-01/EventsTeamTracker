const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');

const router = express.Router();

async function saveCrew(client, projectId, crew, defaultLeadId) {
  await client.query('DELETE FROM project_crew WHERE project_id = $1', [projectId]);
  if (!crew || crew.length === 0) return;
  for (const member of crew) {
    await client.query(
      `INSERT INTO project_crew (project_id, user_id, is_lead, gp_allocated)
       VALUES ($1, $2, $3, $4) ON CONFLICT (project_id, user_id) DO UPDATE
       SET is_lead = EXCLUDED.is_lead, gp_allocated = EXCLUDED.gp_allocated`,
      [projectId, member.user_id, !!member.is_lead, member.gp_allocated || 0]
    );
  }
}

// List projects - BDM sees all, others see own + crew projects
router.get('/', authenticate, async (req, res) => {
  const { month, year, user_id, status } = req.query;
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  const filterUserId = user_id ? parseInt(user_id) : null;

  const conditions = [];
  const params = [];

  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`(p.assigned_to = $${params.length} OR EXISTS (SELECT 1 FROM project_crew pc WHERE pc.project_id = p.id AND pc.user_id = $${params.length}))`);
  }
  if (month) { params.push(parseInt(month)); conditions.push(`EXTRACT(MONTH FROM p.event_date) = $${params.length}`); }
  if (year)  { params.push(parseInt(year));  conditions.push(`EXTRACT(YEAR FROM p.event_date) = $${params.length}`); }
  if (status){ params.push(status);          conditions.push(`p.status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS assigned_name, u.role AS assigned_role,
        (SELECT json_agg(json_build_object('user_id', pc.user_id, 'name', cu.name, 'is_lead', pc.is_lead, 'gp_allocated', pc.gp_allocated))
         FROM project_crew pc JOIN users cu ON cu.id = pc.user_id WHERE pc.project_id = p.id) AS crew
       FROM projects p JOIN users u ON p.assigned_to = u.id
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

// Get single project with crew
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.name AS assigned_name,
        (SELECT json_agg(json_build_object('user_id', pc.user_id, 'name', cu.name, 'is_lead', pc.is_lead, 'gp_allocated', pc.gp_allocated))
         FROM project_crew pc JOIN users cu ON cu.id = pc.user_id WHERE pc.project_id = p.id) AS crew
       FROM projects p JOIN users u ON p.assigned_to = u.id WHERE p.id = $1`,
      [req.params.id]
    );
    const project = rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
    if (!isBDM && project.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create project
router.post('/', authenticate, async (req, res) => {
  const { title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, project_google_link, notes, crew, cancellation_reason, external_brokers } = req.body;
  if (!title || !client_name || revenue == null || cost == null) {
    return res.status(400).json({ error: 'title, client_name, revenue, cost are required' });
  }
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  const assignee = isBDM && assigned_to ? assigned_to : req.user.id;
  const periodDate = confirmation_date ? new Date(confirmation_date) : new Date();
  const pMonth = periodDate.getMonth() + 1;
  const pYear = periodDate.getFullYear();
  const extBrokers = Array.isArray(external_brokers) ? external_brokers : [];

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `INSERT INTO projects (title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, period_month, period_year, project_google_link, notes, cancellation_reason, external_brokers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [title, client_name, project_type || 'Others', event_date || null, confirmation_date || null, revenue, cost, status || 'confirmed', assignee, pMonth, pYear, project_google_link || null, notes || null, cancellation_reason || null, JSON.stringify(extBrokers)]
    );
    const project = rows[0];
    await saveCrew(db, project.id, crew, assignee);
    await db.query('COMMIT');
    res.status(201).json(project);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    db.release();
  }
});

// Update project
router.put('/:id', authenticate, async (req, res) => {
  const { title, client_name, project_type, event_date, confirmation_date, revenue, cost, status, assigned_to, project_google_link, notes, crew, cancellation_reason, external_brokers } = req.body;
  const db = await pool.connect();
  try {
    const { rows: existing } = await db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Project not found' });
    const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
    if (!isBDM && existing[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const p = existing[0];
    const newStatus = status ?? p.status;
    const newConfirmation = confirmation_date !== undefined ? (confirmation_date || null) : p.confirmation_date;
    const periodDate = newConfirmation ? new Date(newConfirmation) : new Date();
    const pMonth = newConfirmation ? periodDate.getMonth() + 1 : p.period_month;
    const pYear = newConfirmation ? periodDate.getFullYear() : p.period_year;
    const newClientName = client_name ?? p.client_name;
    const newAssignee = isBDM && assigned_to ? assigned_to : p.assigned_to;
    const newExtBrokers = external_brokers !== undefined
      ? JSON.stringify(Array.isArray(external_brokers) ? external_brokers : [])
      : p.external_brokers;

    await db.query('BEGIN');
    const { rows } = await db.query(
      `UPDATE projects SET
        title=$1, client_name=$2, project_type=$3, event_date=$4, confirmation_date=$5,
        revenue=$6, cost=$7, status=$8, assigned_to=$9, period_month=$10, period_year=$11,
        project_google_link=$12, notes=$13, cancellation_reason=$14, external_brokers=$15,
        updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [
        title ?? p.title, newClientName, project_type ?? p.project_type,
        event_date !== undefined ? (event_date || null) : p.event_date, newConfirmation,
        revenue ?? p.revenue, cost ?? p.cost, newStatus,
        newAssignee, pMonth, pYear,
        project_google_link !== undefined ? project_google_link : p.project_google_link,
        notes !== undefined ? notes : p.notes,
        cancellation_reason !== undefined ? cancellation_reason : p.cancellation_reason,
        newExtBrokers,
        req.params.id,
      ]
    );
    if (crew !== undefined) await saveCrew(db, parseInt(req.params.id), crew, rows[0].assigned_to);

    // Auto-deactivate matching current client when project completes or cancels
    if (['completed', 'cancelled'].includes(newStatus) && !['completed', 'cancelled'].includes(p.status)) {
      if (newStatus === 'completed') {
        await db.query(
          `UPDATE clients SET list_type = 'completed', updated_at = NOW()
           WHERE user_id = $1 AND company_name = $2 AND list_type = 'current' AND is_active = TRUE`,
          [newAssignee, newClientName]
        );
      } else {
        await db.query(
          `UPDATE clients SET is_active = FALSE, updated_at = NOW()
           WHERE user_id = $1 AND company_name = $2 AND list_type = 'current' AND is_active = TRUE`,
          [newAssignee, newClientName]
        );
      }
    }

    await db.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    console.error('Project update error:', err);
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    db.release();
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
