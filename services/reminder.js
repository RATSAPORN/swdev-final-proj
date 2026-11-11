// AR5: appointment reminders by polling the database (survives restarts; no per-booking timers).
// A reservation is due when reminderSentAt is null and now < startAt <= now + REMINDER_MINUTES_BEFORE.
// findOneAndUpdate claims each one atomically, so it is sent at most once even with several servers.
// Deleted reservations no longer exist, and past ones fail `startAt > now`, so neither is reminded.
const Reservation = require('../models/Reservation');
const notifications = require('./notifications');

const minutesBefore = () => {
  const value = Number(process.env.REMINDER_MINUTES_BEFORE);
  return Number.isFinite(value) && value > 0 ? value : 60;
};
const pollSeconds = () => {
  const value = Number(process.env.REMINDER_POLL_SECONDS);
  return Number.isFinite(value) && value >= 5 ? value : 60;
};

// Fields for a new or rescheduled reservation. Bookings made inside the reminder window are skipped
// (the user has just received the confirmation message).
function initialState(startAt, now = new Date()) {
  return startAt.getTime() - now.getTime() <= minutesBefore() * 60000
    ? { reminderSentAt: now, reminderStatus: 'skipped' }
    : { reminderSentAt: null, reminderStatus: 'pending' };
}

async function runOnce(now = new Date()) {
  const windowEnd = new Date(now.getTime() + minutesBefore() * 60000);
  const processed = [];
  for (let i = 0; i < 1000; i++) {
    const reservation = await Reservation.findOneAndUpdate(
      { reminderSentAt: null, startAt: { $gt: now, $lte: windowEnd } },
      { $set: { reminderSentAt: now, reminderStatus: 'sending' } },
      { new: true, sort: { startAt: 1 } },
    ).populate('shop', 'name');
    if (!reservation) break;
    const status = await notifications.sendReminder(reservation);
    await Reservation.updateOne({ _id: reservation._id, reminderStatus: 'sending' }, { $set: { reminderStatus: status } });
    processed.push({ reservation: reservation.id, startAt: reservation.startAt.toISOString(), status });
  }
  return processed;
}

let timer = null;
let running = false;
function start() {
  if (timer || process.env.REMINDER_ENABLED === 'false') return;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runOnce(); } catch (error) { console.error(`[reminder] run failed: ${error.message}`); } finally { running = false; }
  };
  timer = setInterval(tick, pollSeconds() * 1000);
  timer.unref();
  tick();
}
function stop() { clearInterval(timer); timer = null; }

module.exports = { initialState, runOnce, start, stop, minutesBefore };
