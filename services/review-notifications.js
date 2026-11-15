// Durable review delivery. Jobs live in the same document as their triggering event.
// Leases recover interrupted workers; LINE's retry key deduplicates ambiguous network retries.
const crypto = require('crypto');
const Reservation = require('../models/Reservation');
const Review = require('../models/Review');
const Shop = require('../models/MassageShop');
const User = require('../models/User');
const line = require('./line');
const { SLOT_MINUTES } = require('../utils/time');
const MINUTE = 60000;
const MAX_ATTEMPTS = 3;
function delayMinutes() {
  const value = Number(process.env.REVIEW_PROMPT_DELAY_MINUTES);
  return Number.isFinite(value) && value >= 0 && process.env.REVIEW_PROMPT_DELAY_MINUTES?.trim() ? value : 5;
}
function appLink(query) {
  const configured = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  const url = new URL('/', configured);
  url.search = new URLSearchParams(query).toString();
  return url.toString();
}
async function deliver(userId, text, retryKey, context, adminOnly = false) {
  const user = await User.findById(userId).select('+lineUserId');
  if (!user?.lineUserId || (adminOnly && user.role !== 'admin')) return 'not-linked';
  const { Model, path, match, job, now } = context;
  if (job.recipient && job.recipient !== user.lineUserId) return 'skipped';
  const recipient = job.recipient || user.lineUserId;
  const message = job.message || text;
  if (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= 23 * 3600000) return 'failed';
  const saved = await Model.updateOne(match, { $set: {
    [`${path}.recipient`]: recipient, [`${path}.message`]: message, [`${path}.firstAttemptAt`]: job.firstAttemptAt || now,
  } });
  if (!saved.matchedCount) return 'skipped';
  await line.pushMessage(recipient, message, retryKey);
  return 'sent';
}
async function sendPrompt(r, key, context) {
  if (!await Reservation.exists({ _id: r.id }) || r.reviewSubmitted || await Review.exists({ reservation: r.id })) return 'skipped';
  const shop = await Shop.findById(r.shop).select('name');
  if (!shop) return 'skipped';
  return deliver(r.user, `How was your massage at ${shop.name}?\nPlease leave a review of your visit on ${r.apptDate} at ${r.startTime} (Bangkok time).\n${appLink({ review: r.id })}`, key, context);
}
async function sendAlert(review, key, context) {
  // Re-read policy state immediately before delivery, so queued deleted/hidden content is skipped.
  if (!await Review.exists({ _id: review.id, hidden: false, deleted: false })) return 'skipped';
  const shop = await Shop.findById(review.shop).select('name +notificationAdmin');
  if (!shop?.notificationAdmin) return 'not-linked';
  const heading = review.rating <= 2 ? 'Low-rating review — please follow up' : 'New massage shop review';
  return deliver(shop.notificationAdmin, `${heading}\nShop: ${shop.name}\nRating: ${review.rating}/5\n${review.comment}\n${appLink({ shop: shop.id })}`, key, context, true);
}
async function processJobs(Model, path, clock, send, filter = {}) {
  const results = [];
  const field = name => `${path}.${name}`;
  let now = clock();
  await Model.updateMany({ [field('status')]: 'sending', [field('attempts')]: { $gte: MAX_ATTEMPTS }, [field('leaseUntil')]: { $lte: now } }, { $set: { [field('status')]: 'failed' } });
  for (let i = 0; i < 100; i++) {
    now = clock();
    const claim = crypto.randomUUID();
    const doc = await Model.findOneAndUpdate({
      ...filter, [field('attempts')]: { $lt: MAX_ATTEMPTS },
      $or: [
        { [field('status')]: 'pending', [field('nextAttemptAt')]: { $lte: now } },
        { [field('status')]: 'sending', [field('leaseUntil')]: { $lte: now } },
      ],
    }, {
      $set: { [field('status')]: 'sending', [field('leaseUntil')]: new Date(now.getTime() + MINUTE), [field('claim')]: claim },
      $inc: { [field('attempts')]: 1 },
    }, { new: true, sort: { [field('nextAttemptAt')]: 1 } }).select(`+${path}`);
    if (!doc) break;
    const job = doc.get(path);
    // Deterministic fallback also covers old jobs missing a key; always persist before sending.
    const hex = crypto.createHash('sha256').update(`${Model.modelName}:${doc.id}:${path}`).digest('hex');
    const key = job.retryKey || `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const match = { _id: doc._id, [field('claim')]: claim, [field('status')]: 'sending' };
    await Model.updateOne(match, { $set: { [field('retryKey')]: key } });
    let status;
    try { status = await send(doc, key, { Model, path, match, job, now }); }
    catch (error) {
      line.logError('review notification', error);
      status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    }
    await Model.updateOne(match, { $set: {
      [field('status')]: status,
      [field('nextAttemptAt')]: new Date(now.getTime() + MINUTE * 2 ** (job.attempts - 1)),
      ...(status === 'sent' ? { [field('deliveredAt')]: now } : {}),
    }, $unset: { [field('claim')]: '', [field('leaseUntil')]: '' } });
    results.push({ id: doc.id, kind: path, status });
  }
  return results;
}
async function runOnce(now = new Date()) {
  if (process.env.REVIEW_NOTIFICATIONS_ENABLED === 'false') return [];
  const started = Date.now();
  const clock = () => new Date(now.getTime() + Math.max(0, Date.now() - started));
  const completedBy = new Date(now.getTime() - (SLOT_MINUTES + delayMinutes()) * MINUTE);
  const earliestStart = new Date(now.getTime() - (24 * 60 + SLOT_MINUTES) * MINUTE);
  // No default on the reservation schema: future and date-only visits must never enter the queue.
  await Reservation.updateMany({
    startAt: { $gte: earliestStart, $lte: completedBy }, reviewSubmitted: { $ne: true }, reviewPrompt: { $exists: false },
  }, { $set: { reviewPrompt: { status: 'pending', attempts: 0, nextAttemptAt: now } } });
  // The historical cutoff applies only to new jobs. Persisted retries must not get stranded at 24h.
  const prompts = await processJobs(Reservation, 'reviewPrompt', clock, sendPrompt, { startAt: { $lte: completedBy } });
  const alerts = await processJobs(Review, 'notification', clock, sendAlert);
  return [...prompts, ...alerts];
}
let timer;
let running = false;
function start() {
  if (timer || process.env.REVIEW_NOTIFICATIONS_ENABLED === 'false') return;
  const seconds = Number(process.env.REMINDER_POLL_SECONDS);
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runOnce(); } catch (error) { line.logError('review scheduler', error); } finally { running = false; }
  };
  timer = setInterval(tick, (Number.isFinite(seconds) && seconds >= 5 ? seconds : 60) * 1000);
  timer.unref();
  tick();
}
function stop() { clearInterval(timer); timer = null; }
module.exports = { runOnce, start, stop, delayMinutes };
