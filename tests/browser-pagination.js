// Standalone browser integration check. Uses fixtures only; never connects to Atlas.
// Run: node --experimental-websocket tests/browser-pagination.js [viewport width]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function fixtures() {
  const user = { _id: 'sample-admin', name: 'Sample admin', role: 'admin' };
  const shops = Array.from({ length: 15 }, (_, i) => ({ _id: `shop-${i}`, name: `Sample Shop ${String(i + 1).padStart(2, '0')}`, address: 'Sample address, Bangkok', tel: '020000001', openTime: '09:00', closeTime: '20:00', tags: [i % 2 ? 'Thai massage' : 'Wellness'] }));
  const reservations = Array.from({ length: 21 }, (_, i) => ({ _id: `visit-${i}`, shop: shops[i % 15], user, apptDate: '2026-12-20', startTime: '09:00' }));
  let reviews = Array.from({ length: 21 }, (_, i) => ({ _id: `review-${i}`, author: { name: `Sample guest ${i}` }, shop: shops[0], rating: 5, comment: `Sample review ${i}`, createdAt: '2026-11-01T00:00:00Z' }));
  window.fetch = async (url, options = {}) => {
    const parsed = new URL(url, location.href), route = parsed.pathname.replace('/api/v1', '');
    let data;
    if (route === '/auth/me') data = user;
    else if (route === '/shops' || route === '/reviews/shops') data = shops;
    else if (route === '/reservations') data = reservations;
    else if (route === '/reviews/recipients') data = [];
    else if (route === '/line/status') data = { linked: false, loginMode: 'off' };
    else if (route.startsWith('/reviews/') && options.method === 'DELETE') {
      reviews = reviews.filter(r => r._id !== route.split('/').at(-1)); data = {};
    } else if (route === '/reviews' || /\/shops\/[^/]+\/reviews$/.test(route)) {
      const page = Number(parsed.searchParams.get('page') || 1), limit = Number(parsed.searchParams.get('limit') || 10);
      return { ok: true, json: async () => ({ success: true, page, limit, total: reviews.length, averageRating: 5, data: reviews.slice((page - 1) * limit, page * limit) }) };
    } else if (route.includes('/availability')) data = [];
    else throw Error(`Unexpected fixture request: ${route}`);
    return { ok: true, json: async () => ({ success: true, data }) };
  };
}

async function checks() {
  const passed = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); passed.push(message); };
  const waitFor = async condition => {
    for (let i = 0; i < 150; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    throw Error('Timed out waiting for page update');
  };
  const click = (selector, label) => [...document.querySelectorAll(selector)].find(el => el.textContent === label).click();
  try {
    await waitFor(() => document.querySelectorAll('.reservation-row').length === 10);
    assert(document.querySelectorAll('.shop-row').length === 6, 'six shops per page');
    click('#shop-pagination button', '3');
    assert(document.querySelectorAll('.shop-row').length === 3, 'last shop page has remaining rows');
    assert(document.activeElement.getAttribute('aria-current') === 'page', 'page change retains keyboard focus');
    const search = document.querySelector('#shop-search'); search.value = 'Shop 01'; search.dispatchEvent(new Event('input'));
    assert(document.querySelectorAll('.shop-row').length === 1 && document.querySelector('#shop-pagination').hidden, 'search resets page and hides single-page controls');
    search.value = ''; search.dispatchEvent(new Event('input')); click('#shop-pagination button', '2');
    click('#shop-filters button', 'Wellness');
    assert(document.querySelector('#shop-pagination [aria-current]').textContent === '1', 'style filter resets page');
    click('#reservation-pagination button', '3');
    assert(document.querySelectorAll('.reservation-row').length === 1, 'ten reservations per page with final remainder');
    state.reservations.pop(); renderReservations();
    assert(document.querySelector('#reservation-pagination [aria-current]').textContent === '2', 'reservation page clamps when last record disappears');
    document.querySelector('#review-admin').open = true;
    await waitFor(() => document.querySelectorAll('#review-moderation .review-entry').length === 10);
    click('#review-moderation .pagination button', '3');
    await waitFor(() => document.querySelectorAll('#review-moderation .review-entry').length === 1);
    assert(true, 'admin review numbered navigation loads requested page');
    document.querySelector('#review-moderation .review-entry .danger').click();
    document.querySelector('#moderation-confirm').click();
    await waitFor(() => document.querySelector('#review-moderation [aria-current]')?.textContent === '2');
    assert(document.querySelectorAll('#review-moderation .review-entry').length === 10, 'deleting the final review returns to the previous valid page');
    showShopDetails(state.shops[0]);
    await waitFor(() => document.querySelectorAll('#shop-reviews .review-entry').length === 10);
    click('#shop-review-pagination button', 'Next');
    await waitFor(() => document.querySelector('#shop-review-pagination [aria-current]')?.textContent === '2');
    assert(document.querySelector('#shop-review-pagination').textContent.includes('11–20 of 20'), 'public reviews show server-paged range and total');
    assert(document.documentElement.scrollWidth <= window.innerWidth, 'viewport has no horizontal overflow');
    assert(window.innerWidth === window.expectedWidth, 'browser uses the requested viewport width');
    const dialog = document.querySelector('#shop-dialog');
    assert(dialog.scrollWidth <= dialog.clientWidth, 'review dialog has no horizontal overflow');
    const bounds = dialog.getBoundingClientRect();
    assert(bounds.left >= 0 && bounds.right <= window.innerWidth, 'review dialog fits within viewport');
    assert(bounds.top >= 0 && bounds.bottom <= window.innerHeight, 'review dialog stays vertically within viewport');
    assert([...document.querySelectorAll('#shop-review-pagination button')].every(b => b.getBoundingClientRect().height >= 44), 'pagination controls meet minimum touch height');
    assert(!window.paginationErrors.length, 'no browser runtime errors');
    const result = document.createElement('pre'); result.id = 'pagination-test-result';
    result.textContent = JSON.stringify({ passed }); document.body.append(result);
  } catch (error) {
    const result = document.createElement('pre'); result.id = 'pagination-test-result';
    result.textContent = JSON.stringify({ passed, error: error.message, browserErrors: window.paginationErrors }); document.body.append(result);
  }
}

const root = path.resolve(__dirname, '../public');
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    const setup = `<script>window.expectedWidth=${Number(process.argv[2] || 1280)};window.paginationErrors=[];window.addEventListener('error',e=>window.paginationErrors.push(e.message));(${fixtures.toString()})();window.addEventListener('load',${checks.toString()});</script>`;
    res.setHeader('Content-Type', 'text/html');
    return res.end(fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<head>', `<head>${setup}`));
  }
  const file = path.resolve(root, `.${new URL(req.url, 'http://localhost').pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.ttf': 'font/ttf' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const width = Number(process.argv[2] || 1280);
  const profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pagination-browser-'));
  const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (typeof WebSocket === 'undefined') {
    console.error('Use node --experimental-websocket tests/browser-pagination.js on Node 20.');
    process.exitCode = 1; server.close(); return;
  }
  const child = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank']);
  let socket;
  const timeout = setTimeout(() => child.kill(), 30000);
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let errors = '';
      child.on('error', reject);
      child.on('close', () => reject(Error('Chrome exited before exposing its debugging endpoint')));
      child.stderr.on('data', data => {
        errors += data;
        const match = errors.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) resolve(match[1]);
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result);
    });
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` }, sessionId);
    let result;
    for (let i = 0; i < 150; i++) {
      const response = await call('Runtime.evaluate', { expression: 'document.querySelector("#pagination-test-result")?.textContent', returnByValue: true }, sessionId);
      if (response.result.value) { result = JSON.parse(response.result.value); break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!result) throw Error('Browser checks did not finish');
    console.log(JSON.stringify({ width, ...result }, null, 2));
    if (result.error) process.exitCode = 1;
    if (process.env.PAGINATION_SCREENSHOT) {
      await call('Runtime.evaluate', { expression: 'document.querySelector("#shop-dialog").scrollTop = document.querySelector("#shop-dialog").scrollHeight' }, sessionId);
      await new Promise(resolve => setTimeout(resolve, 300));
      const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }, sessionId);
      fs.writeFileSync(path.resolve(process.env.PAGINATION_SCREENSHOT), Buffer.from(capture.data, 'base64'));
    }
    await call('Browser.close');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { clearTimeout(timeout); socket?.close(); child.kill(); server.close(); }
});
