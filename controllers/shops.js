const mongoose = require('mongoose');
const Shop = require('../models/MassageShop');
const Reservation = require('../models/Reservation');
const { fields, id, fail, reservationDate } = require('../middleware/validation');
const { slotsFor, startAtFor, SLOT_MINUTES } = require('../utils/time');
const { withSummaries } = require('../utils/reviews');
async function shopInput(body) {
  const data = fields(body, [...shopFields, 'notificationAdmin']);
  if (Object.hasOwn(data, 'notificationAdmin') && data.notificationAdmin !== null) {
    const recipient = await require('../models/User').findOne({ _id: id(data.notificationAdmin), role: 'admin' });
    if (!recipient) fail(400, 'Choose an existing administrator for review notifications');
  }
  return data;
}
function publicShop(shop) { const data = shop.toObject(); delete data.notificationAdmin; return data; }
// AR1 capacity and AR3 license fields are admin-editable alongside the original fields.
const shopFields = ['name', 'address', 'tel', 'openTime', 'closeTime', 'capacity', 'licenseNumber', 'licenseExpiresAt'];
exports.getShops = async (req, res) => {
  const data = await Shop.find().sort('name');
  res.json({ success: true, count: data.length, data: await withSummaries(data) });
};
exports.getShop = async (req, res) => {
  const data = await Shop.findById(id(req.params.id));
  if (!data) fail(404, 'Massage shop not found');
  res.json({ success: true, data: (await withSummaries([data]))[0] });
};
exports.createShop = async (req, res) => {
  const data = await Shop.create(await shopInput(req.body));
  res.status(201).json({ success: true, data: publicShop(data) });
};
exports.updateShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  Object.assign(shop, await shopInput(req.body));
  await shop.save();
  res.json({ success: true, data: publicShop(shop) });
};
exports.deleteShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  if (await Reservation.exists({ shop: shop.id })) fail(409, 'Delete this shop’s reservations before deleting the shop');
  if (await require('../models/Review').exists({ shop: shop.id, deleted: false })) fail(409, 'Moderate this shop’s reviews before deleting the shop');
  await shop.deleteOne();
  res.json({ success: true, data: {} });
};
// AR1: GET /shops/:id/availability?date=YYYY-MM-DD[&exclude=<reservationId>]
// Remaining places per 60-minute period from opening to closing, excluding periods that have already started.
exports.getAvailability = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  const date = reservationDate(req.query.date);
  const match = { shop: shop._id, apptDate: date, active: true, seat: { $exists: true } };
  if (req.query.exclude !== undefined) match._id = { $ne: new mongoose.Types.ObjectId(id(req.query.exclude)) };
  const counts = await Reservation.aggregate([{ $match: match }, { $group: { _id: '$startTime', booked: { $sum: 1 } } }]);
  const booked = new Map(counts.map(c => [c._id, c.booked]));
  const now = new Date();
  const data = slotsFor(shop).filter(slot => startAtFor(date, slot.start) > now).map(slot => {
    const remaining = Math.max(0, shop.capacity - (booked.get(slot.start) || 0));
    return { start: slot.start, end: slot.end, remaining, available: remaining > 0 };
  });
  res.json({ success: true, shop: shop.id, date, timezone: 'Asia/Bangkok', slotMinutes: SLOT_MINUTES, capacity: shop.capacity, count: data.length, data });
};
