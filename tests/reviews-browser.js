// Optional real Chrome smoke test: node --experimental-websocket tests/reviews-browser.js
// Uses temporary MongoDB and a dedicated headless Chrome profile; never reads config/config.env.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let mongo, server, chrome, socket;
async function main() {
  process.env.JWT_SECRET = 'isolated-browser-test-secret';
  process.env.LINE_LOG_QUIET = 'true';
  process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = '';
  process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(__dirname, '../.cache/mongodb');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const User = require('../models/User');
  const Shop = require('../models/MassageShop');
  const Reservation = require('../models/Reservation');
  const Review = require('../models/Review');
  await Promise.all([User.init(), Shop.init(), Reservation.init(), Review.init()]);
  const guest = await User.create({ name: 'Preview guest', email: 'guest@preview.test', password: 'preview123', tel: '0812345678' });
  const admin = await User.create({ name: 'Preview admin', email: 'admin@preview.test', password: 'preview123', tel: '0812345678', role: 'admin', lineUserId: 'Upreviewadmin' });
  const shop = await Shop.create({ name: 'Calm Bangkok', address: 'Silom, Bangkok', tel: '021234567', openTime: '09:00', closeTime: '20:00', description: 'A quiet place for your next massage.' });
  const visit = await Reservation.create({ user: guest.id, shop: shop.id, slot: 1, apptDate: '2026-11-14', startTime: '10:00', startAt: new Date(Date.now() - 7200000) });
  server = require('../app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = path.resolve(__dirname, `../.cache/reviews-chrome-${process.pid}`);
  await fs.mkdir(profile, { recursive: true });
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-sync', '--window-size=1440,1000', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  chrome.on('error', error => console.error(error.message));
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); }
  }
  assert.ok(port, 'Chrome started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(t => t.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let next = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.id) {
      const callback = pending.get(message.id); pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error))); else callback.resolve(message.result);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  const screenshot = async name => {
    const result = await command('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.resolve(__dirname, `../.cache/${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await command('Runtime.enable'); await command('Page.enable');
  await command('Page.navigate', { url: `${base}/?review=${visit.id}` });
  await waitFor(`document.querySelector('#notice')?.textContent.includes('Log in to leave a review')`);
  await evaluate(`document.querySelector('#auth-form').elements.email.value='guest@preview.test'; document.querySelector('#auth-form').elements.password.value='preview123'; document.querySelector('#auth-form').requestSubmit();`);
  await waitFor(`document.querySelector('#review-dialog').open`);
  await evaluate(`document.querySelector('#review-form').elements.rating.value='2'; document.querySelector('#review-form').elements.comment.value='A quieter room would help. <img src=x onerror=alert(1)>'; document.querySelector('#review-form').requestSubmit();`);
  await waitFor(`document.querySelector('#notice').textContent.includes('Your review has been posted')`);
  await evaluate(`Array.from(document.querySelectorAll('.shop-more'))[0].click()`);
  await waitFor(`document.querySelector('#shop-rating-summary').textContent.includes('2.0 / 5')`);
  assert.equal(await evaluate(`document.querySelector('#shop-reviews img') === null`), true, 'User HTML is rendered as text');
  await screenshot('reviews-desktop');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Mobile page fits viewport');
  await screenshot('reviews-mobile');
  await evaluate(`document.querySelector('#shop-dialog-close').click(); document.querySelector('#logout').click()`);
  await waitFor(`!document.querySelector('#account').hidden`);
  await evaluate(`document.querySelector('#auth-form').elements.email.value='admin@preview.test'; document.querySelector('#auth-form').elements.password.value='preview123'; document.querySelector('#auth-form').requestSubmit();`);
  await waitFor(`!document.querySelector('#review-admin').hidden`);
  await evaluate(`document.querySelector('#review-admin').open=true`);
  await waitFor(`document.querySelector('#review-moderation .review-entry') && document.querySelector('.review-recipient-form')`);
  await evaluate(`document.querySelector('.review-recipient-form select').value=${JSON.stringify(admin.id)}; document.querySelector('.review-recipient-form').requestSubmit();`);
  await waitFor(`document.querySelector('.review-recipient-form').textContent.includes('Recipient saved')`);
  assert.equal(String((await Shop.findById(shop.id).select('+notificationAdmin')).notificationAdmin), admin.id);
  await evaluate(`Array.from(document.querySelectorAll('#review-moderation button')).find(b => b.textContent==='Hide').click()`);
  await waitFor(`document.querySelector('#moderation-dialog').open`);
  await evaluate(`document.querySelector('#moderation-form').elements.reason.value='Abusive language'; document.querySelector('#moderation-form').requestSubmit();`);
  await waitFor(`document.querySelector('#review-moderation').textContent.includes('Hidden · Abusive language')`);
  assert.equal((await (await fetch(`${base}/api/v1/shops/${shop.id}/reviews`)).json()).total, 0);
  await evaluate(`Array.from(document.querySelectorAll('#review-moderation button')).find(b => b.textContent==='Restore').click()`);
  await evaluate(`document.querySelector('#moderation-form').elements.reason.value='Reviewed by administrator'; document.querySelector('#moderation-form').requestSubmit();`);
  await waitFor(`document.querySelector('#review-moderation').textContent.includes('Visible to guests')`);
  await evaluate(`Array.from(document.querySelectorAll('#review-moderation button')).find(b => b.textContent==='Delete').click()`);
  await waitFor(`document.querySelector('#moderation-dialog').open`);
  await evaluate(`document.querySelector('#moderation-form').requestSubmit()`);
  await waitFor(`document.querySelector('#review-moderation').textContent.includes('No reviews on this page')`);
  assert.equal((await (await fetch(`${base}/api/v1/shops/${shop.id}/reviews`)).json()).total, 0);
  assert.deepEqual(exceptions, []);
  console.log('PASS: pending review link → login → submit → public reviews; mobile fit; admin recipient → hide → restore → delete; no browser exceptions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  if (chrome) chrome.kill();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
