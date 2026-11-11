const mongoose = require('mongoose');
const Shop = require('../models/MassageShop');
const Reservation = require('../models/Reservation');
const { fields, id, fail, reservationDate } = require('../middleware/validation');
const { slotsFor, startAtFor, SLOT_MINUTES } = require('../utils/time');
// AR1 capacity and AR3 license fields are admin-editable alongside the original fields.
const shopFields = ['name', 'address', 'tel', 'openTime', 'closeTime', 'capacity', 'licenseNumber', 'licenseExpiresAt'];
exports.getShops = async (req, res) => {
  const data = await Shop.find().sort('name');
  res.json({ success: true, count: data.length, data });
};
exports.getShop = async (req, res) => {
  const data = await Shop.findById(id(req.params.id));
  if (!data) fail(404, 'Massage shop not found');
  res.json({ success: true, data });
};
exports.createShop = async (req, res) => {
  const data = await Shop.create(fields(req.body, shopFields));
  res.status(201).json({ success: true, data });
};
exports.updateShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  Object.assign(shop, fields(req.body, shopFields));
  await shop.save();
  res.json({ success: true, data: shop });
};
exports.deleteShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  if (await Reservation.exists({ shop: shop.id })) fail(409, 'Delete this shop’s reservations before deleting the shop');
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
