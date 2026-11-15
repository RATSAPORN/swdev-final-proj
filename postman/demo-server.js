// Disposable presentation fixtures. Never loads config.env or connects to Atlas.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const crypto = require('node:crypto');
const path = require('node:path');
async function startDemo({ port = 5000 } = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'development', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    LINE_MOCK_LOGIN: 'true', LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: '', LINE_LOG_QUIET: 'true',
    REVIEW_NOTIFICATIONS_ENABLED: 'true', REVIEW_PROMPT_DELAY_MINUTES: '5',
    REMINDER_MINUTES_BEFORE: '60',
  });
  process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(__dirname, '../.cache/mongodb');
  const mongo = await MongoMemoryServer.create();
  let server;
  try {
    await mongoose.connect(mongo.getUri());
    const User = require('../models/User');
    const Shop = require('../models/MassageShop');
    const Reservation = require('../models/Reservation');
    await Promise.all([User.init(), Shop.init(), Reservation.init(), require('../models/Review').init(), require('../models/Counter').init(), require('../models/LineLoginState').init()]);
    const admin = await User.create({ name: 'Presentation Admin', email: 'admin@example.com', tel: '0812345678', password: 'DemoAdmin123!', role: 'admin', lineUserId: 'Upostmanadmin000000000000000000001' });
    const guest = await User.create({ name: 'Review Demo Guest', email: 'review-guest@example.com', tel: '0812345678', password: 'DemoReview123!' });
    const capacityGuest = await User.create({ name: 'Capacity Fixture', email: 'capacity@example.com', tel: '0812345678', password: crypto.randomBytes(24).toString('hex') });
    const shop = await Shop.create({ name: 'Postman Presentation Shop', address: 'Sample address, Bangkok', tel: '020000001', openTime: '09:00', closeTime: '20:00', capacity: 1, licenseNumber: 'HE-2569-10-00123', licenseExpiresAt: '2099-12-31' });
    const reviewShop = await Shop.create({ name: 'Postman Review Shop', address: 'Sample review address, Bangkok', tel: '020000002', openTime: '09:00', closeTime: '20:00', capacity: 3 });
    const { bangkokDate, startAtFor } = require('../utils/time');
    const futureDay = days => bangkokDate(new Date(Date.now() + days * 86400000));
    const completedStart = new Date(Date.now() - 2 * 3600000);
    await Reservation.create({ user: guest.id, shop: reviewShop.id, slot: 1, apptDate: bangkokDate(completedStart), startTime: '10:00', startAt: completedStart, notes: 'Postman completed visit fixture' });
    await Reservation.create({ user: guest.id, shop: reviewShop.id, slot: 2, apptDate: futureDay(5), startTime: '11:00', startAt: startAtFor(futureDay(5), '11:00'), seat: 1, reminderSentAt: null, reminderStatus: 'pending', notes: 'Postman reminder fixture' });
    await Reservation.create({ user: capacityGuest.id, shop: shop.id, slot: 1, apptDate: futureDay(10), startTime: '10:00', startAt: startAtFor(futureDay(10), '10:00'), seat: 1 });
    server = require('../app').listen(port, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    process.env.APP_BASE_URL = baseUrl;
    const close = async () => {
      await new Promise(resolve => server.close(resolve));
      await mongoose.disconnect(); await mongo.stop();
    };
    return { baseUrl, close, adminId: admin.id };
  } catch (error) {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await mongo.stop(); throw error;
  }
}
if (require.main === module) {
  startDemo({ port: Number(process.env.PORT || 5000) }).then(demo => {
    console.log(`Postman demo: ${demo.baseUrl}\nAdmin: admin@example.com / DemoAdmin123!\nReview guest: review-guest@example.com / DemoReview123!\nImport the collection and Local-Demo environment. Run the whole collection once; restart this demo to reset extra-credit fixtures.\nNo Atlas connection or live LINE messages. Ctrl+C to stop.`);
    const stop = () => demo.close().then(() => process.exit(0));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { startDemo };
