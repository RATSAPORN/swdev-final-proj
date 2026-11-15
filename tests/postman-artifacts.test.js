const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../postman');
test('presentation collection contains the ordered user/admin flow and runnable assertions', () => {
  const collection = JSON.parse(fs.readFileSync(path.join(root, 'Massage-Reservation.postman_collection.json')));
  assert.equal(collection.info.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  for (const step of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '15']) {
    assert.ok(collection.item.some(folder => folder.name.startsWith(step)), `presentation step ${step}`);
  }
  const requests = collection.item.flatMap(folder => folder.item);
  assert.ok(requests.length >= 35);
  for (const request of requests) {
    assert.ok(request.request.url.startsWith('{{baseUrl}}'));
    assert.ok(request.event.some(event => event.listen === 'test' && event.script.exec.join('\n').includes('pm.test')));
    for (const event of request.event) assert.doesNotThrow(() => new (require('node:vm').Script)(event.script.exec.join('\n')), request.name);
  }
  // Parse through the same SDK used by Newman/Postman.
  const { Collection } = require('postman-collection');
  assert.equal(new Collection(collection).items.count(), collection.item.length);
});
test('local Postman environment contains demo defaults but no persisted authentication tokens', () => {
  const env = JSON.parse(fs.readFileSync(path.join(root, 'Local-Demo.postman_environment.json')));
  const values = Object.fromEntries(env.values.map(v => [v.key, v.value]));
  assert.equal(values.baseUrl, 'http://127.0.0.1:5000');
  assert.equal(values.adminEmail, 'admin@example.com');
  assert.equal(values.reviewEmail, 'review-guest@example.com');
  assert.equal(Object.keys(values).some(key => /token/i.test(key)), false);
});
