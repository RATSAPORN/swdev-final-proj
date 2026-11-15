const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterShops } = require('../public/shop-search');
const shops = [
  { _id: 'one', name: 'Banyan House', address: 'Bangkok', neighborhood: 'Sukhumvit', tags: ['Thai massage', 'Aromatherapy'] },
  { _id: 'two', name: 'Mali Wellness', address: 'Bangkok', neighborhood: 'Silom', tags: ['Foot massage'] },
  { _id: 'three', name: 'New shop', address: 'Bangkok' },
];
test('shop search finds neighborhoods and massage styles without case sensitivity', () => {
  assert.deepEqual(filterShops(shops, ' SUKHUMVIT ').map(s => s._id), ['one']);
  assert.deepEqual(filterShops(shops, 'AROMATHERAPY').map(s => s._id), ['one']);
});
test('style filters combine with search and tolerate missing optional metadata', () => {
  assert.deepEqual(filterShops(shops, '', 'Foot massage').map(s => s._id), ['two']);
  assert.deepEqual(filterShops(shops, 'Banyan', 'Foot massage'), []);
  assert.equal(filterShops(shops).length, 3);
});
