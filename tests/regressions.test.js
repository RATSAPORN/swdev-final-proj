const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const auth = require('../controllers/auth');
const reservations = require('../controllers/reservations');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    cookie() { return this; }, json(body) { this.body = body; return this; } };
}

test('registration requires a telephone number', async () => {
  const user = new User({ name: 'Test', email: 'test@example.com', password: 'secret123' });
  assert.ok(user.validateSync()?.errors.tel);
});

test('public registration never grants an admin role and keeps telephone', async () => {
  let created;
  const stub = mock.method(User, 'create', async (data) => {
    created = data; return { getSignedJwtToken: () => 'test-token' };
  });
  try {
    const res = response();
    await auth.register({ body: { name: 'Test', email: 'test@example.com', password: 'secret123', tel: '0812345678', role: 'admin' } }, res);
    assert.equal(created.role, 'user');
    assert.equal(created.tel, '0812345678');
  } finally { stub.mock.restore(); }
});

test('a user cannot read another user reservation by ID', async () => {
  const stub = mock.method(Reservation, 'findById', () => ({ populate: async () => ({ user: 'owner' }) }));
  try {
    const res = response();
    await assert.rejects(reservations.getReservation({ params: { id: '507f1f77bcf86cd799439011' }, user: { id: 'stranger', role: 'user' } }, res), { status: 403 });
  } finally { stub.mock.restore(); }
});

test('logout is implemented', () => assert.equal(typeof auth.logout, 'function'));
