// AR4/AR5: LINE message text and delivery for reservations.
// Delivery never affects the booking result: missing LINE links are skipped and errors are only logged.
const line = require('./line');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Shop = require('../models/MassageShop');
const { SLOT_MINUTES, toMinutes, toHHMM } = require('../utils/time');

const formatDate = date => new Date(`${date}T12:00:00+07:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
const formatTime = start => (start ? `${start}–${toHHMM(toMinutes(start) + SLOT_MINUTES)} (Bangkok time)` : 'No time selected');

function details(reservation, shopName) {
  return [
    `Shop: ${shopName || 'Massage shop'}`,
    `Date: ${formatDate(reservation.apptDate)}`,
    `Time: ${formatTime(reservation.startTime)}`,
    `Queue number: ${reservation.queueNumber ? `#${reservation.queueNumber}` : '-'}`,
  ].join('\n');
}
async function shopName(shop) {
  if (shop && shop.name) return shop.name;
  const found = await Shop.findById(shop).select('name');
  return found ? found.name : '';
}
// Returns 'sent' or 'not-linked'; throws if LINE rejects the message.
async function deliver(userId, text) {
  const user = await User.findById(userId).select('+lineUserId');
  if (!user || !user.lineUserId) return 'not-linked';
  await line.pushMessage(user.lineUserId, text);
  return 'sent';
}
function background(label, task) {
  Promise.resolve().then(task).catch(error => line.logError(label, error));
}

exports.messages = {
  created: (r, name) => `✅ Reservation confirmed\n${details(r, name)}\n\nSee you soon!`,
  updated: (r, name) => `✏️ Reservation updated\n${details(r, name)}`,
  cancelled: (r, name) => `❌ Reservation cancelled\n${details(r, name)}`,
  reminder: (r, name) => `⏰ Reminder: your massage starts soon\n${details(r, name)}`,
};

exports.reservationCreated = reservationId => background('booking confirmation', async () => {
  const r = await Reservation.findById(reservationId).populate('shop', 'name');
  if (r) await deliver(r.user, exports.messages.created(r, await shopName(r.shop)));
});
exports.reservationUpdated = reservationId => background('booking update notice', async () => {
  const r = await Reservation.findById(reservationId).populate('shop', 'name');
  if (r) await deliver(r.user, exports.messages.updated(r, await shopName(r.shop)));
});
// Receives a snapshot because the document is already deleted.
exports.reservationCancelled = snapshot => background('cancellation notice', async () => {
  await deliver(snapshot.user, exports.messages.cancelled(snapshot, await shopName(snapshot.shop)));
});
// Awaited by the reminder scheduler; returns the final reminder status.
exports.sendReminder = async reservation => {
  try {
    return await deliver(reservation.user, exports.messages.reminder(reservation, await shopName(reservation.shop)));
  } catch (error) {
    line.logError('appointment reminder', error);
    return 'failed';
  }
};
