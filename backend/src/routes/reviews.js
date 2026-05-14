const express = require('express');
const pool = require('../config/database');
const { authenticate, requireBDM } = require('../middleware/auth');
const router = express.Router();

const REVIEW_QUESTIONS = [
  'Have you achieved the goals set during your last catch-up?',
  'Overall performance rating (1–10)',
  'Tell us more about your score.',
  'What would push that rating higher next quarter?',
  'What can management do to better support you?',
  'New goals for the coming quarter.',
  'How are you planning to make progress on these goals?',
  'Anything else to raise or discuss?',
];

function generateLocally(answers, memberName) {
  const name = memberName ? memberName.split(' ')[0] : 'The team member';
  const rating = parseInt(answers[1]);
  const hasRating = !isNaN(rating) && rating >= 1 && rating <= 10;

  const ratingPhrase = !hasRating ? 'no rating provided'
    : rating >= 9 ? 'an outstanding self-rating of ' + rating + '/10'
    : rating >= 7 ? 'a strong self-rating of ' + rating + '/10'
    : rating >= 5 ? 'a moderate self-rating of ' + rating + '/10'
    : 'a low self-rating of ' + rating + '/10, indicating areas for improvement';

  const sentimentNote = !hasRating ? ''
    : rating >= 8 ? `${name} expressed confidence in their performance this quarter.`
    : rating >= 5 ? `${name} sees room for growth and is working on improving their results.`
    : `${name} acknowledged challenges this quarter and is seeking support to get back on track.`;

  const goalsSnippet = answers[5] ? `Goals set for next quarter include: ${answers[5].trim().split('\n')[0]}.` : '';
  const mgmtNote = answers[4] ? `Management support was requested around: ${answers[4].trim().split('\n')[0]}.` : '';
  const othersNote = answers[7] ? `Additional points were raised: ${answers[7].trim().split('\n')[0]}.` : '';

  const summary = [
    `${name} completed their quarterly 1-1 catch-up with ${ratingPhrase}.`,
    sentimentNote,
    goalsSnippet,
    mgmtNote || othersNote,
  ].filter(Boolean).join(' ');

  const actionItems = [];

  if (hasRating && rating < 7) {
    actionItems.push(`– Follow up with ${name} in 4 weeks to check progress and provide additional support`);
  }
  if (answers[3]) {
    actionItems.push(`– ${name} to action: ${answers[3].trim().split('\n')[0]}`);
  }
  if (answers[5]) {
    const goalLines = answers[5].trim().split('\n').filter(Boolean).slice(0, 2);
    goalLines.forEach(g => actionItems.push(`– ${name} to work towards goal: ${g.replace(/^[-–•]\s*/, '')}`));
  }
  if (answers[6]) {
    actionItems.push(`– ${name} to follow through on plan: ${answers[6].trim().split('\n')[0]}`);
  }
  if (answers[4]) {
    actionItems.push(`– Management to follow up on: ${answers[4].trim().split('\n')[0]}`);
  }
  if (actionItems.length === 0) {
    actionItems.push(`– Schedule next catch-up for following quarter`);
    actionItems.push(`– Review progress on goals set in this session`);
  }

  return { summary, action_items: actionItems.join('\n') };
}

// Auto-generate summary and action items from review answers (BDM only)
router.post('/generate', authenticate, requireBDM, (req, res) => {
  const { answers, memberName } = req.body;
  try {
    const result = generateLocally(answers || {}, memberName || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate summary.' });
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
