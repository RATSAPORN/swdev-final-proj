const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../models/User');
const Shop = require('../models/MassageShop');
const Reservation = require('../models/Reservation');
const app = require('../app');
let mongo, server, base, owner, other, admin, shop;
const date = '2099-12-20';
async function api(path, method = 'GET', body, token) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
}
async function register(email) {
  const result = await api('/auth/register', 'POST', { name: email, email, password: 'password123', tel: '0812345678', role: 'admin' });
  assert.equal(result.status, 201);
  return result.body.token;
}
before(async () => {
  process.env.JWT_SECRET = 'isolated-test-secret-never-used-in-production';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Shop.init(), Reservation.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  owner = await register('owner@example.com');
  other = await register('other@example.com');
  const adminUser = await User.create({ name: 'Admin', email: 'admin@example.com', tel: '0812345678', password: 'password123', role: 'admin' });
  admin = adminUser.getSignedJwtToken();
  shop = await Shop.create({ name: 'Test massage shop', address: 'Bangkok', tel: '021234567', openTime: '09:00', closeTime: '20:00' });
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
test('registration validates telephone, normalizes email, and cannot grant admin', async () => {
  assert.equal((await api('/auth/register', 'POST', { name: 'No phone', email: 'n@example.com', password: 'password123' })).status, 400);
  const me = await api('/auth/me', 'GET', undefined, owner);
  assert.equal(me.body.data.role, 'user');
  assert.equal(me.body.data.tel, '0812345678');
  assert.equal(me.body.data.password, undefined);
  assert.equal((await api('/auth/register', 'POST', { name: 'Duplicate', email: ' OWNER@EXAMPLE.COM ', tel: '0812345678', password: 'password123' })).status, 409);
});
test('login checks credentials and session cookies work', async () => {
  assert.equal((await api('/auth/login', 'POST', { email: 'owner@example.com', password: 'bad' })).status, 401);
  assert.equal((await api('/auth/login', 'POST', { email: { $ne: null }, password: 'bad' })).status, 400);
  const login = await api('/auth/login', 'POST', { email: ' OWNER@EXAMPLE.COM ', password: 'password123' });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /SameSite=Strict/);
  const response = await fetch(`${base}/api/v1/auth/me`, { headers: { Cookie: login.cookie.split(';')[0] } });
  assert.equal(response.status, 200);
  assert.equal((await api('/reservations')).status, 401);
});
test('public shop list contains required details and no private reservations', async () => {
  const result = await api('/shops');
  assert.equal(result.status, 200);
  for (const key of ['name', 'address', 'tel', 'openTime', 'closeTime']) assert.ok(result.body.data[0][key]);
  assert.equal(result.body.data[0].reservations, undefined);
  assert.equal((await api('/shops', 'POST', {}, owner)).status, 403);
});
test('existing Atlas shops are read from shops with telephone and opening-hour aliases', async () => {
  const existing = await mongoose.connection.collection('shops').insertOne({
    name: 'Existing Atlas Shop', address: 'Existing address', telephone: '02-000-0101', opens: '09:00', closes: '21:00',
  });
  try {
    const result = await api(`/shops/${existing.insertedId}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.tel, '02-000-0101');
    assert.equal(result.body.data.openTime, '09:00');
    assert.equal(result.body.data.closeTime, '21:00');
    const created = await api('/reservations', 'POST', { shop: String(existing.insertedId), apptDate: date, startTime: '10:00' }, other);
    assert.equal(created.status, 201);
    const reservation = await api(`/reservations/${created.body.data._id}`, 'GET', undefined, other);
    assert.equal(reservation.body.data.shop.tel, '02-000-0101');
    assert.equal(reservation.body.data.shop.openTime, '09:00');
    await api(`/reservations/${created.body.data._id}`, 'DELETE', undefined, other);
  } finally { await mongoose.connection.collection('shops').deleteOne({ _id: existing.insertedId }); }
});
test('owner/admin reservation CRUD, privacy, filters, and immutable ownership', async () => {
  const created = await api(`/shops/${shop.id}/reservations`, 'POST', { apptDate: date, startTime: '10:00' }, owner);
  assert.equal(created.status, 201);
  const path = `/reservations/${created.body.data._id}`;
  assert.equal((await api(path, 'GET', undefined, other)).status, 403);
  assert.equal((await api(path, 'PUT', { apptDate: date }, other)).status, 403);
  assert.equal((await api(path, 'DELETE', undefined, other)).status, 403);
  assert.equal((await api('/reservations', 'GET', undefined, other)).body.count, 0);
  assert.equal((await api(`/shops/${new mongoose.Types.ObjectId()}/reservations`, 'GET', undefined, owner)).body.count, 0);
  assert.equal((await api(path, 'GET', undefined, owner)).status, 200);
  const originalOwner = created.body.data.user;
  const update = await api(path, 'PUT', { apptDate: '2099-12-21', user: new mongoose.Types.ObjectId(), slot: 3 }, owner);
  assert.equal(update.status, 200);
  assert.equal(update.body.data.user, originalOwner);
  assert.equal(update.body.data.apptDate, '2099-12-21');
  const all = await api('/reservations', 'GET', undefined, admin);
  assert.equal(all.body.count, 1);
  assert.equal(all.body.data[0].user.email, 'owner@example.com');
  assert.equal((await api(path, 'GET', undefined, admin)).status, 200);
  assert.equal((await api(path, 'PUT', { apptDate: date }, admin)).status, 200);
  assert.equal((await api(`/shops/${shop.id}`, 'DELETE', undefined, admin)).status, 409);
  assert.equal((await api(path, 'DELETE', undefined, admin)).status, 200);
  assert.equal((await api(path, 'GET', undefined, owner)).status, 404);
});
test('invalid IDs, impossible/past dates, and nonexistent shops return useful errors', async () => {
  assert.equal((await api('/reservations/not-an-id', 'GET', undefined, owner)).status, 400);
  for (const apptDate of ['2099-02-31', '2020-01-01', 'invalid', { $gt: '' }]) {
    assert.equal((await api('/reservations', 'POST', { shop: shop.id, apptDate }, owner)).status, 400);
  }
  assert.equal((await api('/reservations', 'POST', { shop: new mongoose.Types.ObjectId(), apptDate: date, startTime: '10:00' }, owner)).status, 404);
});
test('simultaneous requests cannot exceed three reservations, deletion frees a slot', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => api('/reservations', 'POST', { shop: shop.id, apptDate: date, startTime: '10:00' }, owner)));
  assert.equal(results.filter(r => r.status === 201).length, 3);
  assert.equal(results.filter(r => r.status === 400).length, 5);
  assert.equal(await Reservation.countDocuments(), 3);
  const list = await api('/reservations', 'GET', undefined, owner);
  assert.equal((await api(`/reservations/${list.body.data[0]._id}`, 'DELETE', undefined, owner)).status, 200);
  assert.equal((await api('/reservations', 'POST', { shop: shop.id, apptDate: date, startTime: '10:00' }, owner)).status, 201);
});
test('saving an existing user does not hash their password again', async () => {
  const user = await User.findOne({ email: 'other@example.com' }).select('+password');
  user.name = 'Updated';
  await user.save();
  assert.equal(await user.matchPassword('password123'), true);
});
test('logout revokes bearer tokens and cookies', async () => {
  assert.equal((await api('/auth/logout', 'POST', {}, owner)).status, 200);
  assert.equal((await api('/auth/me', 'GET', undefined, owner)).status, 401);
  assert.equal((await api('/auth/login', 'POST', { email: 'owner@example.com', password: 'password123' })).status, 200);
});
test('admin can create and update shop hours; invalid ranges fail', async () => {
  const result = await api('/shops', 'POST', { name: 'New shop', address: 'Bangkok', tel: '021234567', openTime: '09:00', closeTime: '18:00' }, admin);
  assert.equal(result.status, 201);
  assert.equal((await api(`/shops/${result.body.data._id}`, 'PUT', { closeTime: '08:00' }, admin)).status, 400);
  assert.equal((await api(`/shops/${result.body.data._id}`, 'PUT', { closeTime: '19:00' }, admin)).status, 200);
  assert.equal((await api(`/shops/${result.body.data._id}`, 'DELETE', undefined, admin)).status, 200);
});
