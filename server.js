require('dotenv').config({ path: require('path').join(__dirname, 'config/config.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
async function start() {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) throw new Error('Set MONGO_URI and JWT_SECRET in config/config.env');
  await connectDB();
  await Promise.all([require('./models/User').init(), require('./models/MassageShop').init(), require('./models/Reservation').init()]);
  await Promise.all([require('./models/Counter').init(), require('./models/LineLoginState').init()]);
  const reminder = require('./services/reminder');
  const server = app.listen(process.env.PORT || 5000, () => console.log(`Open http://localhost:${process.env.PORT || 5000}`));
  reminder.start();
  const close = () => { reminder.stop(); server.close(async () => { await mongoose.disconnect(); process.exit(0); }); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  return server;
}
if (require.main === module) start().catch(error => { console.error(`Startup failed: ${error.message}`); process.exit(1); });
module.exports = { start };
