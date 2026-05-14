const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const { getTenureMonths, getAssistantMultiplier } = require('../utils/kpi');

const router = express.Router();

// List users — BDM/exec_pa get full detail; others get lightweight list for crew/filter use
router.get('/', authenticate, async (req, res) => {
  const isBDM = ['bdm', 'exec_pa'].includes(req.user.role);
  try {
    if (isBDM) {
      const { rows } = await pool.query(
        `SELECT id, name, email, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1, bdm_id, is_active, created_at
         FROM users ORDER BY name`
      );
      res.json(rows.map(u => ({
        ...u,
        tenure_months: getTenureMonths(u.join_date),
        multiplier: ['bda', 'pa'].includes(u.role) ? getAssistantMultiplier(getTenureMonths(u.join_date)) : 1,
      })));
    } else {
      const { rows } = await pool.query(
        `SELECT id, name, role, is_active FROM users WHERE is_active = TRUE AND role != 'exec_pa' ORDER BY name`
      );
      res.json(rows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user (BDM sees all, others see only themselves)
router.get('/:id', authenticate, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'bdm' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1, bdm_id, is_active
       FROM users WHERE id = $1`,
      [targetId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({
      ...u,
      tenure_months: getTenureMonths(u.join_date),
      multiplier: ['bda', 'pa'].includes(u.role) ? getAssistantMultiplier(getTenureMonths(u.join_date)) : 1,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (BDM only)
router.post('/', authenticate, requireBDM, async (req, res) => {
  const { name, email, password, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1 } = req.body;
  if (!name || !email || !password || !role || !join_date) {
    return res.status(400).json({ error: 'name, email, password, role, join_date are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, name, email, role, join_date`,
      [
        name, email.toLowerCase().trim(), hash, role, join_date,
        salary || 0, cpf_type || 'cpf', cpf_rate || 0.17, permit_cost || 0,
        gp_target_t1 || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (BDM only)
router.put('/:id', authenticate, requireBDM, async (req, res) => {
  const { name, email, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1, bdm_id, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        join_date = COALESCE($4, join_date),
        salary = COALESCE($5, salary),
        cpf_type = COALESCE($6, cpf_type),
        cpf_rate = COALESCE($7, cpf_rate),
        permit_cost = COALESCE($8, permit_cost),
        gp_target_t1 = $9,
        bdm_id = $10,
        is_active = COALESCE($11, is_active),
        updated_at = NOW()
       WHERE id = $12 RETURNING id, name, email, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1, bdm_id, is_active`,
      [name, email, role, join_date, salary, cpf_type, cpf_rate, permit_cost, gp_target_t1 ?? null, bdm_id ?? null, is_active, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset user password (BDM only)
router.post('/:id/reset-password', authenticate, requireBDM, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.params.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user permanently (BDM only)
router.delete('/:id', authenticate, requireBDM, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
