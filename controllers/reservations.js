// Reservation CRUD adapted from controllers/appointments.js (see docs/original).
const Reservation = require('../models/Reservation');
const Shop = require('../models/MassageShop');
const { fail, fields, id, reservationDate } = require('../middleware/validation');
const shopDetails = { path: 'shop', select: 'name address telephone opens closes' };
const allowed = (reservation, user) => String(reservation.user._id || reservation.user) === user.id || user.role === 'admin';

exports.getReservations = async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { user: req.user.id };
  if (req.params.shopId) filter.shop = id(req.params.shopId);
  let query = Reservation.find(filter).populate(shopDetails).sort('apptDate createdAt');
  if (req.user.role === 'admin') query = query.populate({ path: 'user', select: 'name email tel' });
  const data = await query;
  res.json({ success: true, count: data.length, data });
};
exports.getReservation = async (req, res) => {
  const data = await Reservation.findById(id(req.params.id)).populate(shopDetails);
  if (!data) fail(404, 'Reservation not found');
  if (!allowed(data, req.user)) fail(403, 'This reservation belongs to another user');
  res.json({ success: true, data });
};
exports.addReservation = async (req, res) => {
  const data = fields(req.body, ['apptDate', 'shop']);
  const apptDate = reservationDate(data.apptDate);
  const shop = id(req.params.shopId || data.shop);
  if (!(await Shop.exists({ _id: shop }))) fail(404, 'Massage shop not found');
  for (const slot of [1, 2, 3]) {
    try {
      const reservation = await Reservation.create({ apptDate, shop, user: req.user.id, slot });
      const result = reservation.toObject(); delete result.slot;
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  fail(400, 'You already have 3 reservations. Delete one before booking again');
};
exports.updateReservation = async (req, res) => {
  const reservation = await Reservation.findById(id(req.params.id));
  if (!reservation) fail(404, 'Reservation not found');
  if (!allowed(reservation, req.user)) fail(403, 'This reservation belongs to another user');
  const data = fields(req.body, ['apptDate', 'shop']);
  if (!Object.keys(data).length) fail(400, 'Provide apptDate or shop to update');
  if (Object.hasOwn(data, 'apptDate')) data.apptDate = reservationDate(data.apptDate);
  if (Object.hasOwn(data, 'shop') && !(await Shop.exists({ _id: id(data.shop) }))) fail(404, 'Massage shop not found');
  const updated = await Reservation.findByIdAndUpdate(reservation.id, { $set: data }, { new: true, runValidators: true }).populate(shopDetails);
  if (!updated) fail(404, 'Reservation no longer exists');
  res.json({ success: true, data: updated });
};
exports.deleteReservation = async (req, res) => {
  const reservation = await Reservation.findById(id(req.params.id));
  if (!reservation) fail(404, 'Reservation not found');
  if (!allowed(reservation, req.user)) fail(403, 'This reservation belongs to another user');
  await reservation.deleteOne();
  res.json({ success: true, data: {} });
};
