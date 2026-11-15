const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Shop = require('../models/MassageShop');
const Reservation = require('../models/Reservation');
const app = require('../app');
let mongo, server, base, guest, other, admin, shop;
const now = new Date('2026-11-15T12:00:00Z');
async function api(path, method = 'GET', body, user) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(user ? { Authorization: `Bearer ${user.getSignedJwtToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...await response.json() };
}
async function booking(overrides = {}) {
  return Reservation.create({ user: guest.id, shop: shop.id, slot: 1, apptDate: '2026-11-14', startTime: '10:00', startAt: new Date(Date.now() - 7200000), ...overrides });
}
const postReview = (r, user = guest, body = { rating: 2, comment: 'Please improve the service.' }) => api(`/reservations/${r.id}/review`, 'POST', body, user);
before(async () => {
  process.env.JWT_SECRET = 'isolated-review-test-secret';
  process.env.LINE_LOG_QUIET = 'true';
  process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = '';
  process.env.MONGOMS_DOWNLOAD_DIR ||= require('path').join(__dirname, '../.cache/mongodb');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Shop.init(), Reservation.init(), require('../models/Review').init()]);
  guest = await User.create({ name: 'Guest', email: 'guest@test.com', tel: '0812345678', password: 'password123', lineUserId: 'Uguest' });
  other = await User.create({ name: 'Other', email: 'other@test.com', tel: '0812345678', password: 'password123' });
  admin = await User.create({ name: 'Admin', email: 'admin@test.com', tel: '0812345678', password: 'password123', role: 'admin', lineUserId: 'Uadmin' });
  shop = await Shop.create({ name: 'Review shop', address: 'Bangkok', tel: '021234567', openTime: '09:00', closeTime: '20:00' });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Reservation.deleteMany({});
  if (mongoose.models.Review) await mongoose.models.Review.deleteMany({});
  await Shop.updateOne({ _id: shop.id }, { $unset: { notificationAdmin: '' } });
  require('../services/line').sent.length = 0;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
test('only the owner of a completed timed reservation can review', async () => {
  const r = await booking();
  assert.equal((await postReview(r, null)).status, 401);
  assert.equal((await postReview(r, other)).status, 403);
  assert.equal((await postReview(r, admin)).status, 403);
  await Reservation.updateOne({ _id: r.id }, { $set: { startAt: new Date(Date.now() - 1800000) } });
  assert.equal((await postReview(r)).status, 400);
  await Reservation.updateOne({ _id: r.id }, { $unset: { startAt: '', startTime: '' } });
  assert.equal((await postReview(r)).status, 400);
  await r.deleteOne();
  assert.equal((await postReview(r)).status, 404);
});
test('strict ratings, comments and one concurrent review per visit', async () => {
  const r = await booking();
  for (const rating of [0, 6, 2.5, '5', null]) assert.equal((await postReview(r, guest, { rating, comment: 'Good' })).status, 400);
  for (const comment of ['', '   ', 'x'.repeat(2001), {}, null]) assert.equal((await postReview(r, guest, { rating: 5, comment })).status, 400);
  const results = await Promise.all([postReview(r), postReview(r)]);
  assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
  assert.equal(await mongoose.models.Review.countDocuments(), 1);
  const reservations = await api('/reservations', 'GET', undefined, guest);
  assert.equal(reservations.data[0].reviewSubmitted, true);
  assert.equal(reservations.data[0].canReview, false);
});
test('public reviews and averages exclude hidden/deleted reviews and private fields', async () => {
  const r = await booking();
  const created = await postReview(r);
  assert.equal(created.status, 201);
  const reviewId = created.data._id;
  const publicList = await api(`/shops/${shop.id}/reviews`);
  assert.equal(publicList.averageRating, 2);
  assert.equal(publicList.total, 1);
  assert.equal(publicList.data[0].author.name, 'Guest');
  assert.doesNotMatch(JSON.stringify(publicList), /guest@test|Uguest|Uadmin|notification|reservation"|email"|tel"/);
  assert.equal((await api(`/reviews/${reviewId}`, 'PATCH', { hidden: true, reason: 'Spam' }, guest)).status, 403);
  assert.equal((await api(`/reviews/${reviewId}`, 'PATCH', { hidden: true }, admin)).status, 400);
  assert.equal((await api(`/reviews/${reviewId}`, 'PATCH', { hidden: true, reason: 'Spam' }, admin)).status, 200);
  assert.equal((await api(`/shops/${shop.id}/reviews`)).total, 0);
  assert.equal((await api(`/shops/${shop.id}`)).data.averageRating, null);
  const moderation = await api('/reviews', 'GET', undefined, admin);
  assert.equal(moderation.data[0].hidden, true);
  assert.equal((await api(`/reviews/${reviewId}`, 'PATCH', { hidden: false, reason: 'Reviewed' }, admin)).status, 200);
  assert.equal((await api(`/shops/${shop.id}`)).data.reviewCount, 1);
  assert.equal((await api(`/reviews/${reviewId}`, 'DELETE', undefined, admin)).status, 200);
  assert.equal((await postReview(r)).status, 409);
  assert.equal((await api(`/shops/${shop.id}/reviews`)).total, 0);
});
test('reviews survive reservation deletion and block reassignment after review', async () => {
  const r = await booking();
  await postReview(r);
  assert.equal((await api(`/reservations/${r.id}`, 'PUT', { apptDate: '2099-12-20', startTime: '10:00' }, guest)).status, 409);
  assert.equal((await api(`/reservations/${r.id}`, 'DELETE', undefined, guest)).status, 200);
  assert.equal((await api(`/shops/${shop.id}/reviews`)).total, 1);
});
test('shop alert recipient can only be assigned by admins and must be an admin', async () => {
  assert.equal((await api(`/shops/${shop.id}`, 'PUT', { notificationAdmin: admin.id }, guest)).status, 403);
  assert.equal((await api(`/shops/${shop.id}`, 'PUT', { notificationAdmin: guest.id }, admin)).status, 400);
  assert.equal((await api(`/shops/${shop.id}`, 'PUT', { notificationAdmin: admin.id }, admin)).status, 200);
  assert.equal((await api('/reviews/recipients', 'GET', undefined, guest)).status, 403);
  const recipients = await api('/reviews/recipients', 'GET', undefined, admin);
  assert.equal(recipients.data[0]._id, admin.id);
  assert.doesNotMatch(JSON.stringify(recipients), /Uadmin|password/);
});
test('review prompts wait until five minutes after completion and are claimed once across workers', async () => {
  const worker = require('../services/review-notifications');
  const r = await booking({ startAt: new Date(now.getTime() - 64 * 60000) });
  await worker.runOnce(now);
  assert.equal(require('../services/line').sent.length, 0);
  const due = new Date(now.getTime() + 60000);
  await Promise.all([worker.runOnce(due), worker.runOnce(due)]);
  const outbox = require('../services/line').sent;
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'Uguest');
  assert.match(outbox[0].text, /leave a review/i);
  assert.match(outbox[0].text, new RegExp(`review=${r.id}`));
  await worker.runOnce(due);
  assert.equal(outbox.length, 1);
});
test('review prompts skip old, reviewed, untimed and deleted visits', async () => {
  const worker = require('../services/review-notifications');
  const reviewed = await booking({ startAt: new Date(now.getTime() - 2 * 3600000) });
  // Inject a reviewed record independently of wall clock so the scheduler has a deterministic test clock.
  await mongoose.models.Review.create({ user: guest.id, shop: shop.id, reservation: reviewed.id, rating: 4, comment: 'Good' });
  await booking({ slot: 2, startAt: new Date(now.getTime() - 27 * 3600000) });
  await booking({ slot: 3, startAt: undefined, startTime: undefined });
  await worker.runOnce(now);
  assert.equal(require('../services/line').sent.length, 0);
  await Reservation.deleteMany({});
  await worker.runOnce(now);
  assert.equal(require('../services/line').sent.length, 0);
});
test('new review alerts go to the assigned linked admin and emphasize low ratings', async () => {
  const worker = require('../services/review-notifications');
  await Shop.updateOne({ _id: shop.id }, { $set: { notificationAdmin: admin.id } });
  const r = await booking();
  const created = await postReview(r);
  assert.equal(created.status, 201);
  await worker.runOnce(new Date());
  const outbox = require('../services/line').sent;
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'Uadmin');
  assert.match(outbox[0].text, /low.rating/i);
  assert.match(outbox[0].text, /2\/5/);
  assert.match(outbox[0].text, /Please improve/);
  await worker.runOnce(new Date());
  assert.equal(outbox.length, 1);
});
test('failed review alerts retry with the same LINE key, and expired claims recover', async () => {
  const worker = require('../services/review-notifications');
  const line = require('../services/line');
  await Shop.updateOne({ _id: shop.id }, { $set: { notificationAdmin: admin.id } });
  const created = await postReview(await booking());
  const clock = new Date();
  const original = line.pushMessage;
  const keys = [];
  line.pushMessage = async (to, text, key) => { keys.push(key); throw new Error('temporary outage'); };
  try { await worker.runOnce(clock); } finally { line.pushMessage = original; }
  const review = await mongoose.models.Review.findById(created.data._id).select('+notification');
  assert.equal(review.notification.status, 'pending');
  assert.equal(review.notification.attempts, 1);
  line.pushMessage = async (to, text, key) => { keys.push(key); return original(to, text, key); };
  try { await worker.runOnce(new Date(clock.getTime() + 61000)); } finally { line.pushMessage = original; }
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(require('../services/line').sent.length, 1);
  await mongoose.models.Review.updateOne({ _id: review.id }, { $set: { 'notification.status': 'sending', 'notification.attempts': 1, 'notification.leaseUntil': new Date(0) } });
  await worker.runOnce(new Date(clock.getTime() + 120000));
  assert.equal((await mongoose.models.Review.findById(review.id).select('+notification')).notification.status, 'sent');
});
test('unlinked recipients, hidden reviews and exhausted failures never send an alert', async () => {
  const worker = require('../services/review-notifications');
  const line = require('../services/line');
  const created = await postReview(await booking());
  await worker.runOnce(new Date());
  const Review = mongoose.models.Review;
  assert.equal((await Review.findById(created.data._id).select('+notification')).notification.status, 'not-linked');
  await Shop.updateOne({ _id: shop.id }, { $set: { notificationAdmin: admin.id } });
  await Review.updateOne({ _id: created.data._id }, { $set: { 'notification.status': 'pending', 'notification.nextAttemptAt': new Date(0), hidden: true } });
  await worker.runOnce(new Date());
  assert.equal(line.sent.length, 0);
  await Review.updateOne({ _id: created.data._id }, { $set: { 'notification.status': 'pending', 'notification.attempts': 0, 'notification.nextAttemptAt': new Date(0), hidden: false } });
  const original = line.pushMessage;
  let attempts = 0;
  line.pushMessage = async () => { attempts++; throw new Error('offline'); };
  const clock = new Date();
  try {
    for (const minutes of [0, 2, 5, 10]) await worker.runOnce(new Date(clock.getTime() + minutes * 60000));
  } finally { line.pushMessage = original; }
  assert.equal(attempts, 3);
  assert.equal((await Review.findById(created.data._id).select('+notification')).notification.status, 'failed');
});
test('completion boundary, pagination and multiple-shop averages stay correct', async () => {
  const { completed } = require('../utils/reviews');
  assert.equal(completed({ startAt: new Date(now.getTime() - 3600000) }, now), true);
  assert.equal(completed({ startAt: new Date(now.getTime() - 3599999) }, now), false);
  const r1 = await booking();
  const r2 = await booking({ slot: 2 });
  await postReview(r1, guest, { rating: 3, comment: 'Okay' });
  await postReview(r2, guest, { rating: 4, comment: 'Good' });
  const page = await api(`/shops/${shop.id}/reviews?limit=1&page=2`);
  assert.equal(page.averageRating, 3.5); assert.equal(page.total, 2); assert.equal(page.data.length, 1);
  assert.equal((await api(`/shops/${shop.id}/reviews?limit=100000`)).status, 400);
  const shops = await api('/shops');
  assert.equal(shops.data[0].averageRating, 3.5);
  assert.equal(shops.data[0].reviewCount, 2);
});
test('batched review prompts use different LINE retry keys for each reservation', async () => {
  const worker = require('../services/review-notifications');
  const line = require('../services/line');
  await booking({ startAt: new Date(now.getTime() - 2 * 3600000) });
  await booking({ slot: 2, startAt: new Date(now.getTime() - 3 * 3600000) });
  const keys = [];
  const original = line.pushMessage;
  line.pushMessage = async (to, message, key) => { keys.push(key); return original(to, message, key); };
  try { await worker.runOnce(now); } finally { line.pushMessage = original; }
  assert.equal(keys.length, 2);
  assert.equal(new Set(keys).size, 2);
});
test('a persisted prompt retries even after its visit passes the 24-hour catch-up cutoff', async () => {
  const worker = require('../services/review-notifications');
  const line = require('../services/line');
  await booking({ startAt: new Date(now.getTime() - (25 * 60 - 1) * 60000) });
  const original = line.pushMessage;
  line.pushMessage = async () => { throw new Error('temporary failure'); };
  try { await worker.runOnce(now); } finally { line.pushMessage = original; }
  await worker.runOnce(new Date(now.getTime() + 2 * 60000));
  assert.equal(line.sent.length, 1);
  assert.equal((await Reservation.findOne().select('+reviewPrompt')).reviewPrompt.status, 'sent');
});
test('each notification claim gets a full lease even late in a slow batch', async () => {
  const worker = require('../services/review-notifications');
  const line = require('../services/line');
  await booking({ startAt: new Date(now.getTime() - 2 * 3600000) });
  await booking({ slot: 2, startAt: new Date(now.getTime() - 3 * 3600000) });
  const originalPush = line.pushMessage;
  const originalNow = Date.now;
  const wall = Date.now();
  let elapsed = 0;
  const leases = [];
  Date.now = () => wall + elapsed;
  line.pushMessage = async () => {
    const sending = await Reservation.findOne({ 'reviewPrompt.status': 'sending' }).select('+reviewPrompt');
    leases.push(sending.reviewPrompt.leaseUntil.getTime());
    elapsed += 120000;
  };
  try { await worker.runOnce(now); } finally { line.pushMessage = originalPush; Date.now = originalNow; }
  assert.equal(leases.length, 2);
  assert.ok(leases[1] >= now.getTime() + 180000, 'second job lease starts when claimed, not at batch start');
});
test('rescheduling atomically rechecks completion rather than using a stale reservation snapshot', async () => {
  const r = await booking({ apptDate: '2099-12-20', startAt: new Date(Date.now() + 7200000) });
  const original = Reservation.updateOne;
  let raced = false;
  Reservation.updateOne = async function(filter, update, options) {
    if (!raced && String(filter._id) === r.id && update.$set?.seat) {
      raced = true;
      await original.call(this, { _id: r.id }, { $set: { startAt: new Date(Date.now() - 7200000) } });
    }
    return original.call(this, filter, update, options);
  };
  let result;
  try { result = await api(`/reservations/${r.id}`, 'PUT', { apptDate: '2099-12-21', startTime: '11:00' }, guest); }
  finally { Reservation.updateOne = original; }
  assert.equal(raced, true);
  assert.equal(result.status, 409);
  assert.equal((await Reservation.findById(r.id)).apptDate, '2099-12-20');
});
