const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const router = express.Router();

const REVIEW_QUESTIONS = [
  'Have you achieved the goals set during your last catch-up? If not, what got in the way?',
  'Give yourself an overall performance rating from 1 to 10.',
  'Tell us more about your score.',
  'Is there anything you\'re currently doing — or planning to start — that would push that rating higher next quarter?',
  'Is there anything the management team can do to better support you?',
  'Set at least 2 new goals for the coming quarter.',
  'How are you planning to make meaningful progress on these goals?',
  'Is there anything else you\'d like to raise, flag, or discuss?',
];

// Auto-generate summary and action items from review answers (BDM only)
router.post('/generate', authenticate, requireBDM, async (req, res) => {
  const { answers, memberName } = req.body;
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set in your backend .env file.' });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const qa = Object.entries(answers || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([i, v]) => `Q${parseInt(i)+1}. ${REVIEW_QUESTIONS[i] || ''}\nAnswer: ${v}`)
    .join('\n\n');

  const prompt = `You are a team manager reviewing a quarterly 1-1 catch-up session with ${memberName || 'a team member'}.

Below are the questions and their answers from the session:

${qa}

Please produce two things:
1. A concise session SUMMARY (2–4 sentences) capturing the key themes, performance sentiment, and any notable points raised.
2. A bullet-point ACTION ITEMS list (3–6 items) of concrete next steps for ${memberName || 'the team member'} and/or management, derived directly from the answers. Each item should start with a dash (–).

Respond in this exact format:
SUMMARY:
<summary text>

ACTION ITEMS:
– <item 1>
– <item 2>
...`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content[0]?.text || '';
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=ACTION ITEMS:|$)/i);
    const actionsMatch = text.match(/ACTION ITEMS:\s*([\s\S]*)/i);
    res.json({
      summary: (summaryMatch?.[1] || '').trim(),
      action_items: (actionsMatch?.[1] || '').trim(),
    });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to generate summary. Check your API key and try again.' });
  }
});

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
  const { user_id, quarter, year, answers, summary, action_items, catch_up_date, location, spend } = req.body;
  if (!user_id || !quarter || !year) return res.status(400).json({ error: 'user_id, quarter, year required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO individual_reviews (user_id, reviewer_id, quarter, year, answers, summary, action_items, catch_up_date, location, spend)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, quarter, year) DO UPDATE SET
         answers=$5, summary=$6, action_items=$7, reviewer_id=$2,
         catch_up_date=$8, location=$9, spend=$10, updated_at=NOW()
       RETURNING *`,
      [user_id, req.user.id, quarter, year, JSON.stringify(answers||{}), summary||null, action_items||null,
       catch_up_date||null, location||null, spend||null]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
