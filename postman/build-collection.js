// Source for the importable JSON. Run node postman/build-collection.js after editing.
const fs = require('node:fs');
const path = require('node:path');
const item = [];
let folder;
const group = name => { folder = { name, item: [] }; item.push(folder); };
const value = key => `pm.collectionVariables.get('${key}')`;
function request(name, method, url, status, body, token, assertions = '', options = {}) {
  const checks = [
    `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`,
    ...(options.redirect ? [] : [`const result = pm.response.json();`, `pm.test('Response success flag', () => pm.expect(result.success).to.eql(${status < 400}));`]),
    assertions,
  ].join('\n');
  const entry = {
    name,
    protocolProfileBehavior: { disableCookies: true, followRedirects: false },
    request: {
      method, auth: { type: 'noauth' },
      header: [
        ...(body !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : []),
        ...(token ? [{ key: 'Authorization', value: `Bearer {{${token}}}` }] : []),
        ...(options.cookie ? [{ key: 'Cookie', value: options.cookie }] : []),
      ],
      url: url.startsWith('{{baseUrl}}') ? url : `{{baseUrl}}/api/v1${url}`,
      description: `${name}. Expected HTTP ${status}. Run in order using the Local-Demo environment; credentials and IDs are captured automatically.`,
      ...(body === undefined ? {} : { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } }),
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: checks.split('\n') } }],
  };
  folder.item.push(entry);
}
const captureToken = key => `pm.test('JWT returned', () => pm.expect(result.token).to.be.a('string').and.not.empty); pm.collectionVariables.set('${key}', result.token);`;
const saveId = key => `pm.test('MongoDB ID returned', () => pm.expect(result.data._id).to.match(/^[a-f0-9]{24}$/)); pm.collectionVariables.set('${key}', result.data._id);`;
const booking = day => ({ shop: '{{shopId}}', apptDate: `{{${day}}}`, startTime: '10:00', notes: 'Presentation booking: quiet room please' });
const login = (email, password) => ({ email: `{{${email}}}`, password: `{{${password}}}` });
group('01 · User registration + validation');
request('01.1 Reject registration without telephone', 'POST', '/auth/register', 400, { name: 'Presentation Guest', email: '{{userEmail}}', password: '{{userPassword}}' });
request('01.2 Reject a short password', 'POST', '/auth/register', 400, { name: 'Presentation Guest', email: '{{userEmail}}', password: '123', tel: '0812345678' });
request('01.3 Register a regular user (role escalation ignored)', 'POST', '/auth/register', 201, { name: 'Presentation Guest', email: '{{userEmail}}', password: '{{userPassword}}', tel: '0812345678', role: 'admin' }, undefined, captureToken('userToken'));
request('01.4 Reject duplicate email', 'POST', '/auth/register', 409, { name: 'Duplicate', email: '{{userEmail}}', password: '{{userPassword}}', tel: '0812345678' });
group('02 · User log-in');
request('02.1 Reject wrong password', 'POST', '/auth/login', 401, { email: '{{userEmail}}', password: 'wrong-password' });
request('02.2 User log-in', 'POST', '/auth/login', 200, login('userEmail', 'userPassword'), undefined, captureToken('userToken'));
request('02.3 Confirm ordinary role and identity', 'GET', '/auth/me', 200, undefined, 'userToken', `${saveId('userId')} pm.test('Registration cannot grant admin', () => pm.expect(result.data.role).to.eql('user')); pm.test('Correct user', () => pm.expect(result.data.email).to.eql(${value('userEmail')}));`);
group('03 · User view massage shops');
request('03.1 Browse massage shops', 'GET', '/shops', 200, undefined, undefined, `const shop = result.data.find(s => s.name === 'Postman Presentation Shop'); pm.test('Presentation shop is seeded', () => pm.expect(shop).to.be.an('object')); if (shop) pm.collectionVariables.set('shopId', shop._id);`);
request('03.2 View shop details, hours and license', 'GET', '/shops/{{shopId}}', 200, undefined, undefined, `pm.test('Shop information is complete', () => { ['name','address','tel','openTime','closeTime','capacity','licenseNumber'].forEach(k => pm.expect(result.data).to.have.property(k)); pm.expect(result.data.capacity).to.eql(1); });`);
request('03.3 View available 60-minute periods', 'GET', '/shops/{{shopId}}/availability?date={{day1}}', 200, undefined, undefined, `pm.test('Hourly periods available', () => { pm.expect(result.slotMinutes).to.eql(60); pm.expect(result.data.some(s => s.start === '10:00' && s.available)).to.eql(true); });`);
group('04 · User create booking + condition checks');
request('04.1 Reject unauthenticated booking', 'POST', '/reservations', 401, booking('day1'), 'invalidToken');
request('04.2 Reject past date', 'POST', '/reservations', 400, { ...booking('day1'), apptDate: '2020-01-01' }, 'userToken');
request('04.3 Reject missing start time', 'POST', '/reservations', 400, { shop: '{{shopId}}', apptDate: '{{day1}}' }, 'userToken');
request('04.4 Reject time outside opening hours', 'POST', '/reservations', 400, { ...booking('day1'), startTime: '02:00' }, 'userToken');
request('04.5 Reject a fully booked period', 'POST', '/reservations', 409, { ...booking('busyDay') }, 'userToken', `pm.test('Capacity conflict explained', () => pm.expect(result.message).to.include('fully booked'));`);
request('04.6 Create own booking', 'POST', '/reservations', 201, booking('day1'), 'userToken', `${saveId('ownBookingId')} pm.test('Notes, owner and queue saved', () => { pm.expect(result.data.user).to.eql(${value('userId')}); pm.expect(result.data.notes).to.include('quiet room'); pm.expect(result.data.queueNumber).to.be.above(0); });`);
request('04.7 Create booking retained for admin demo', 'POST', '/reservations', 201, booking('day2'), 'userToken', saveId('adminBookingId'));
request('04.8 Create third booking', 'POST', '/reservations', 201, booking('day3'), 'userToken', saveId('quotaBookingId'));
request('04.9 Reject fourth booking', 'POST', '/reservations', 400, booking('day4'), 'userToken', `pm.test('Three-booking limit explained', () => pm.expect(result.message).to.include('3 reservations'));`);
group('05 · User view own bookings');
request('05.1 List only own bookings', 'GET', '/reservations', 200, undefined, 'userToken', `pm.test('Exactly three owned bookings', () => { pm.expect(result.count).to.eql(3); result.data.forEach(r => pm.expect(r.user).to.eql(${value('userId')})); });`);
request('05.2 View own booking by ID', 'GET', '/reservations/{{ownBookingId}}', 200, undefined, 'userToken', `pm.test('Requested booking', () => pm.expect(result.data._id).to.eql(${value('ownBookingId')}));`);
group('06 · User update own booking');
request('06.1 Reschedule and update notes', 'PUT', '/reservations/{{ownBookingId}}', 200, { apptDate: '{{day4}}', startTime: '11:00', notes: 'Updated request: gentle pressure' }, 'userToken', `pm.test('Updated fields and unchanged owner', () => { pm.expect(result.data.apptDate).to.eql(${value('day4')}); pm.expect(result.data.startTime).to.eql('11:00'); pm.expect(result.data.notes).to.include('gentle pressure'); pm.expect(result.data.user).to.eql(${value('userId')}); });`);
group('07 · User delete own booking');
request('07.1 Delete own booking', 'DELETE', '/reservations/{{ownBookingId}}', 200, undefined, 'userToken');
request('07.2 Deleted booking returns 404', 'GET', '/reservations/{{ownBookingId}}', 404, undefined, 'userToken');
request('07.3 Clean up quota booking; retain admin target', 'DELETE', '/reservations/{{quotaBookingId}}', 200, undefined, 'userToken');
request('07.4 One booking remains for admin demonstration', 'GET', '/reservations', 200, undefined, 'userToken', `pm.test('Admin target retained', () => { pm.expect(result.count).to.eql(1); pm.expect(result.data[0]._id).to.eql(${value('adminBookingId')}); });`);
group('08 · User log-out');
request('08.1 Log out user', 'POST', '/auth/logout', 200, {}, 'userToken');
request('08.2 Revoked token cannot read bookings', 'GET', '/reservations', 401, undefined, 'userToken');
group('09 · Admin log-in');
request('09.1 Admin log-in', 'POST', '/auth/login', 200, login('adminEmail', 'adminPassword'), undefined, captureToken('adminToken'));
request('09.2 Confirm administrator role', 'GET', '/auth/me', 200, undefined, 'adminToken', `${saveId('adminId')} pm.test('Administrator role', () => pm.expect(result.data.role).to.eql('admin'));`);
group('10 · Admin view any booking');
request('10.1 Admin lists another user booking', 'GET', '/reservations', 200, undefined, 'adminToken', `pm.test('Another user booking and guest details visible', () => { const r = result.data.find(r => r._id === ${value('adminBookingId')}); pm.expect(r).to.be.an('object'); pm.expect(r.user._id).to.eql(${value('userId')}); pm.expect(r.user.email).to.eql(${value('userEmail')}); });`);
request('10.2 Admin reads another user booking by ID', 'GET', '/reservations/{{adminBookingId}}', 200, undefined, 'adminToken', `pm.test('Booking belongs to ordinary user', () => pm.expect(result.data.user).to.eql(${value('userId')}));`);
group('11 · Admin update any booking');
request('11.1 Admin reschedules another user booking', 'PUT', '/reservations/{{adminBookingId}}', 200, { apptDate: '{{day4}}', startTime: '12:00', notes: 'Admin changed the booking' }, 'adminToken', `pm.test('Admin changes booking without taking ownership', () => { pm.expect(result.data.user).to.eql(${value('userId')}); pm.expect(result.data.startTime).to.eql('12:00'); pm.expect(result.data.apptDate).to.eql(${value('day4')}); });`);
group('12 · Admin delete any booking');
request('12.1 Admin deletes another user booking', 'DELETE', '/reservations/{{adminBookingId}}', 200, undefined, 'adminToken');
request('12.2 Confirm booking removed', 'GET', '/reservations/{{adminBookingId}}', 404, undefined, 'adminToken');
group('15 · Extra credits — LINE, reviews and moderation');
request('15.01 Review fixture user log-in', 'POST', '/auth/login', 200, login('reviewEmail', 'reviewPassword'), undefined, captureToken('reviewToken'));
request('15.02 Find completed and future fixture visits', 'GET', '/reservations', 200, undefined, 'reviewToken', `const completed = result.data.find(r => r.notes === 'Postman completed visit fixture'); const future = result.data.find(r => r.notes === 'Postman reminder fixture'); pm.test('Fresh eligible completed fixture exists', () => { pm.expect(completed).to.be.an('object'); pm.expect(completed.canReview).to.eql(true); pm.expect(future).to.be.an('object'); }); if (completed && future) { pm.collectionVariables.set('completedId', completed._id); pm.collectionVariables.set('reviewShopId', completed.shop._id); pm.collectionVariables.set('reminderId', future._id); pm.collectionVariables.set('reminderAsOf', new Date(new Date(future.startAt).getTime() - 30*60000).toISOString()); }`);
request('15.03 Check safe mock LINE mode', 'GET', '/line/status', 200, undefined, 'reviewToken', `pm.test('Local mock login and dry-run delivery', () => { pm.expect(result.data.loginMode).to.eql('mock'); pm.expect(result.data.messagingMode).to.eql('dry-run'); });`);
request('15.04 Start mock LINE linking', 'GET', '/line/login', 302, undefined, 'reviewToken', `const callback = pm.response.headers.get('Location'); pm.test('Mock callback redirect', () => pm.expect(callback.startsWith('/api/v1/line/callback?code=mock-code&state=')).to.eql(true)); pm.collectionVariables.set('lineCallback', callback); pm.collectionVariables.set('lineState', decodeURIComponent(callback.match(/state=([^&]+)/)[1]));`, { redirect: true });
request('15.05 Finish mock LINE linking', 'GET', '{{baseUrl}}{{lineCallback}}', 302, undefined, undefined, `pm.test('LINE link confirmed', () => pm.expect(pm.response.headers.get('Location')).to.include('line=linked'));`, { redirect: true, cookie: 'line_state={{lineState}}' });
request('15.06 Confirm LINE linked', 'GET', '/line/status', 200, undefined, 'reviewToken', `pm.test('Account is linked', () => pm.expect(result.data.linked).to.eql(true));`);
request('15.07 Assign shop notification administrator', 'PUT', '/shops/{{reviewShopId}}', 200, { notificationAdmin: '{{adminId}}' }, 'adminToken');
request('15.08 Run post-visit prompt scheduler', 'POST', '/dev/review-notifications/run', 200, {}, 'adminToken', `pm.test('Review prompt delivered in dry-run mode', () => pm.expect(result.data.some(job => job.id === ${value('completedId')} && job.kind === 'reviewPrompt' && job.status === 'sent')).to.eql(true));`);
request('15.09 Inspect LINE review prompt', 'GET', '/dev/line/outbox', 200, undefined, 'adminToken', `pm.test('Prompt contains review link', () => pm.expect(result.data.some(m => m.text.includes('Please leave a review') && m.text.includes(${value('completedId')}))).to.eql(true));`);
request('15.10 Run pre-appointment reminder scheduler', 'POST', '/dev/reminders/run', 200, { asOf: '{{reminderAsOf}}' }, 'adminToken', `pm.test('Appointment reminder sent', () => pm.expect(result.data.some(r => r.reservation === ${value('reminderId')} && r.status === 'sent')).to.eql(true));`);
request('15.11 Reject review before visit completion', 'POST', '/reservations/{{reminderId}}/review', 400, { rating: 5, comment: 'Too early' }, 'reviewToken');
request('15.12 Reject review by another account (even admin)', 'POST', '/reservations/{{completedId}}/review', 403, { rating: 2, comment: 'Not my visit' }, 'adminToken');
request('15.13 Reject invalid review rating', 'POST', '/reservations/{{completedId}}/review', 400, { rating: 0, comment: 'Invalid rating' }, 'reviewToken');
request('15.14 Reject blank review comment', 'POST', '/reservations/{{completedId}}/review', 400, { rating: 2, comment: '   ' }, 'reviewToken');
request('15.15 Submit low-rating verified review', 'POST', '/reservations/{{completedId}}/review', 201, { rating: 2, comment: 'Please improve the waiting time.' }, 'reviewToken', `${saveId('reviewId')} pm.test('Saved rating and comment', () => { pm.expect(result.data.rating).to.eql(2); pm.expect(result.data.comment).to.include('waiting time'); });`);
request('15.16 Reject duplicate review', 'POST', '/reservations/{{completedId}}/review', 409, { rating: 5, comment: 'Second submission' }, 'reviewToken');
request('15.17 Display public reviews and average', 'GET', '/shops/{{reviewShopId}}/reviews', 200, undefined, undefined, `pm.test('Public review and average', () => { pm.expect(result.total).to.eql(1); pm.expect(result.averageRating).to.eql(2); pm.expect(result.data[0]._id).to.eql(${value('reviewId')}); pm.expect(result.data[0].author).to.have.keys('name'); });`);
request('15.18 Run new-review shop alert scheduler', 'POST', '/dev/review-notifications/run', 200, {}, 'adminToken', `pm.test('Shop alert sent', () => pm.expect(result.data.some(job => job.id === ${value('reviewId')} && job.kind === 'notification' && job.status === 'sent')).to.eql(true));`);
request('15.19 Inspect low-rating LINE alert', 'GET', '/dev/line/outbox', 200, undefined, 'adminToken', `pm.test('Low rating is prominent in alert', () => pm.expect(result.data.some(m => m.text.includes('Low-rating review') && m.text.includes('2/5') && m.text.includes('waiting time'))).to.eql(true));`);
request('15.20 Ordinary user cannot moderate reviews', 'PATCH', '/reviews/{{reviewId}}', 403, { hidden: true, reason: 'Spam' }, 'reviewToken');
request('15.21 Admin hides review with policy reason', 'PATCH', '/reviews/{{reviewId}}', 200, { hidden: true, reason: 'Spam / policy demonstration' }, 'adminToken', `pm.test('Review hidden', () => pm.expect(result.data.hidden).to.eql(true));`);
request('15.22 Hidden review excluded from public average', 'GET', '/shops/{{reviewShopId}}/reviews', 200, undefined, undefined, `pm.test('No visible reviews', () => { pm.expect(result.total).to.eql(0); pm.expect(result.averageRating).to.eql(null); pm.expect(result.data).to.have.lengthOf(0); });`);
request('15.23 Admin lists hidden review', 'GET', '/reviews?shop={{reviewShopId}}', 200, undefined, 'adminToken', `pm.test('Hidden review retained for moderation', () => { pm.expect(result.data[0].hidden).to.eql(true); pm.expect(result.data[0].moderationReason).to.include('Spam'); });`);
request('15.24 Admin restores review', 'PATCH', '/reviews/{{reviewId}}', 200, { hidden: false, reason: 'Policy review complete' }, 'adminToken');
request('15.25 Shop summary includes restored review', 'GET', '/shops/{{reviewShopId}}', 200, undefined, undefined, `pm.test('Restored average recalculated', () => { pm.expect(result.data.reviewCount).to.eql(1); pm.expect(result.data.averageRating).to.eql(2); });`);
request('15.26 Admin deletes review', 'DELETE', '/reviews/{{reviewId}}', 200, undefined, 'adminToken');
request('15.27 Deleted review excluded from shop summary', 'GET', '/shops/{{reviewShopId}}', 200, undefined, undefined, `pm.test('Deleted review excluded', () => { pm.expect(result.data.reviewCount).to.eql(0); pm.expect(result.data.averageRating).to.eql(null); });`);
request('15.28 Deletion does not permit reposting', 'POST', '/reservations/{{completedId}}/review', 409, { rating: 5, comment: 'Trying again after deletion' }, 'reviewToken');
request('15.29 Unlink mock LINE account', 'DELETE', '/line/link', 200, undefined, 'reviewToken', `pm.test('LINE unlinked', () => pm.expect(result.data.linked).to.eql(false));`);
request('15.30 Review guest log-out', 'POST', '/auth/logout', 200, {}, 'reviewToken');
request('15.31 Admin log-out', 'POST', '/auth/logout', 200, {}, 'adminToken');
request('15.32 Revoked admin token denied', 'GET', '/reviews', 401, undefined, 'adminToken');

const collection = {
  info: { name: 'Massage Reservation · Presentation & Extra Credits', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Run in folder order. Steps 01–12 match the presentation checklist. Step 15 demonstrates extra credits with isolated fixtures and mock LINE only. Start npm run postman:demo first. Restart the demo before repeating extra credits. No Swagger or manual ID/token copying required. Steps 0, 13, 14 and 16 belong to slides.' },
  auth: { type: 'noauth' },
  variable: [{ key: 'invalidToken', value: 'deliberately-invalid-session' }],
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    "if (pm.info.requestName === '01.1 Reject registration without telephone') {",
    "  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);",
    "  ['userToken','userId','adminToken','adminId','shopId','ownBookingId','adminBookingId','quotaBookingId','reviewToken','reviewId','completedId','reviewShopId','reminderId','reminderAsOf','lineCallback','lineState'].forEach(k => pm.collectionVariables.unset(k));",
    "  pm.collectionVariables.set('userEmail', 'presentation-' + stamp + '@example.com');",
    "  pm.collectionVariables.set('userPassword', 'Presentation123!');",
    "  [1,2,3,4].forEach(day => pm.collectionVariables.set('day'+day, new Date(Date.now() + 7*3600000 + day*86400000).toISOString().slice(0,10)));",
    "  pm.collectionVariables.set('busyDay', new Date(Date.now() + 7*3600000 + 10*86400000).toISOString().slice(0,10));",
    '}',
  ] } }], item,
};
const environment = { name: 'Massage Reservation · Local Demo', _postman_variable_scope: 'environment', values: [
  { key: 'baseUrl', value: 'http://127.0.0.1:5000', enabled: true },
  { key: 'adminEmail', value: 'admin@example.com', enabled: true },
  { key: 'adminPassword', value: 'DemoAdmin123!', type: 'secret', enabled: true },
  { key: 'reviewEmail', value: 'review-guest@example.com', enabled: true },
  { key: 'reviewPassword', value: 'DemoReview123!', type: 'secret', enabled: true },
] };
fs.writeFileSync(path.join(__dirname, 'Massage-Reservation.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'Local-Demo.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
console.log(`Generated ${item.reduce((count, folder) => count + folder.item.length, 0)} requests in ${item.length} presentation folders.`);
