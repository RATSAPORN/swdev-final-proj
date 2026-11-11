// Development-only helpers for demos (AR4/AR5). Mounted only when NODE_ENV=development; admin only.
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const { fail, fields } = require('../middleware/validation');
const reminder = require('../services/reminder');
const line = require('../services/line');
router.use(protect, authorize('admin'));

// Run the reminder scheduler now. Optional `asOf` (ISO date-time) simulates the current time.
router.post('/reminders/run', async (req, res) => {
  const { asOf } = fields(req.body, ['asOf']);
  let now = new Date();
  if (asOf !== undefined) {
    if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) fail(400, 'asOf must be an ISO date-time, e.g. 2026-12-20T09:15:00+07:00');
    now = new Date(asOf);
  }
  const data = await reminder.runOnce(now);
  res.json({ success: true, asOf: now.toISOString(), minutesBefore: reminder.minutesBefore(), count: data.length, data });
});

// Messages captured in dry-run mode (no channel access token configured).
router.get('/line/outbox', (req, res) => {
  const data = line.sent.slice(-20).reverse().map(m => ({ to: line.mask(m.to), text: m.text, at: m.at }));
  res.json({ success: true, messagingMode: line.messagingMode(), count: data.length, data });
});
module.exports = router;
