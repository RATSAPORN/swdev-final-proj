// Reservation CRUD adapted from controllers/appointments.js (see docs/original).
const Reservation = require('../models/Reservation');
const Shop = require('../models/MassageShop');
const { fail, fields, id, reservationDate, startTime: periodStart, notes: cleanNotes } = require('../middleware/validation');
const { slotsFor, startAtFor, toMinutes, toHHMM, SLOT_MINUTES } = require('../utils/time');
const { nextQueueNumber } = require('../services/queue');
const notifications = require('../services/notifications');
const reminder = require('../services/reminder');
const shopDetails = { path: 'shop', select: 'name address telephone opens closes capacity licenseNumber licenseExpiresAt' };
const allowed = (reservation, user) => String(reservation.user._id || reservation.user) === user.id || user.role === 'admin';

// AR1: a period must be one of the shop's 60-minute periods and must not have started (Asia/Bangkok).
async function bookablePeriod(shopId, apptDate, time) {
  const shop = await Shop.findById(shopId);
  if (!shop) fail(404, 'Massage shop not found');
  if (!slotsFor(shop).some(slot => slot.start === time)) fail(400, `Choose a 60-minute period that starts between ${shop.openTime} and ${shop.closeTime}, on the hour from opening time`);
  const startAt = startAtFor(apptDate, time);
  if (startAt <= new Date()) fail(400, 'That time period has already started. Choose a later one');
  return { shop, startAt };
}
const isSeatConflict = error => error.code === 11000 && !!error.keyPattern?.seat;
const isQuotaConflict = error => error.code === 11000 && !!error.keyPattern?.slot;
const fullyBooked = (apptDate, time) => fail(409, `${time}–${toHHMM(toMinutes(time) + SLOT_MINUTES)} on ${apptDate} is fully booked. Please choose another time`);

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
  const data = fields(req.body, ['apptDate', 'shop', 'startTime', 'notes']);
  const apptDate = reservationDate(data.apptDate);
  const shop = id(req.params.shopId || data.shop);
  const time = periodStart(data.startTime);
  const notes = cleanNotes(data.notes);
  const { shop: shopDoc, startAt } = await bookablePeriod(shop, apptDate, time);
  const base = { apptDate, shop, user: req.user.id, startTime: time, startAt, ...(notes ? { notes } : {}), ...reminder.initialState(startAt) };
  // Quota slots 1-3 (existing rule) x seats 1..capacity (AR1). Unique indexes reject over-booking atomically.
  quota: for (const slot of [1, 2, 3]) {
    for (let seat = 1; seat <= shopDoc.capacity; seat++) {
      try {
        const reservation = await Reservation.create({ ...base, slot, seat });
        reservation.queueNumber = await nextQueueNumber(shop, apptDate);
        await Reservation.updateOne({ _id: reservation._id }, { $set: { queueNumber: reservation.queueNumber } });
        notifications.reservationCreated(reservation._id);
        const result = reservation.toObject(); delete result.slot; delete result.seat;
        return res.status(201).json({ success: true, data: result });
      } catch (error) {
        if (isQuotaConflict(error)) continue quota;
        if (!isSeatConflict(error)) throw error;
      }
    }
    fullyBooked(apptDate, time);
  }
  fail(400, 'You already have 3 reservations. Delete one before booking again');
};
exports.updateReservation = async (req, res) => {
  const reservation = await Reservation.findById(id(req.params.id)).select('+seat');
  if (!reservation) fail(404, 'Reservation not found');
  if (!allowed(reservation, req.user)) fail(403, 'This reservation belongs to another user');
  const data = fields(req.body, ['apptDate', 'shop', 'startTime', 'notes']);
  if (!Object.keys(data).length) fail(400, 'Provide apptDate, shop, startTime or notes to update');
  const update = { $set: {}, $unset: {} };
  if (Object.hasOwn(data, 'notes')) {
    const notes = cleanNotes(data.notes);
    if (notes) update.$set.notes = notes; else update.$unset.notes = '';
  }
  const has = key => Object.hasOwn(data, key);
  const ops = (extra = {}) => ({ $set: { ...update.$set, ...extra }, ...(Object.keys(update.$unset).length ? { $unset: update.$unset } : {}) });
  let moved = false;
  if (has('apptDate') || has('shop') || has('startTime')) {
    const apptDate = reservationDate(has('apptDate') ? data.apptDate : reservation.apptDate);
    const shop = has('shop') ? id(data.shop) : String(reservation.shop);
    const time = has('startTime') ? periodStart(data.startTime) : reservation.startTime;
    if (!time) fail(400, 'startTime is required, in HH:mm (for example 10:00)');
    const samePeriod = apptDate === reservation.apptDate && shop === String(reservation.shop) && time === reservation.startTime && reservation.seat;
    if (!samePeriod) {
      const { shop: shopDoc, startAt } = await bookablePeriod(shop, apptDate, time);
      // Rescheduling resets the reminder (AR5) and takes a free seat in the new period (AR1).
      Object.assign(update.$set, { apptDate, shop, startTime: time, startAt, ...reminder.initialState(startAt) });
      for (let seat = 1; seat <= shopDoc.capacity && !moved; seat++) {
        try {
          const result = await Reservation.updateOne({ _id: reservation._id }, ops({ seat }), { runValidators: true });
          if (!result.matchedCount) fail(404, 'Reservation no longer exists');
          moved = true;
        } catch (error) {
          if (!isSeatConflict(error)) throw error;
        }
      }
      if (!moved) fullyBooked(apptDate, time);
      // AR4: a booking moved to another shop or day joins the end of that day's queue.
      if (apptDate !== reservation.apptDate || shop !== String(reservation.shop) || !reservation.queueNumber) {
        await Reservation.updateOne({ _id: reservation._id }, { $set: { queueNumber: await nextQueueNumber(shop, apptDate) } });
      }
    }
  }
  if (!moved && (Object.keys(update.$set).length || Object.keys(update.$unset).length)) {
    await Reservation.updateOne({ _id: reservation._id }, ops(), { runValidators: true });
  }
  const updated = await Reservation.findById(reservation.id).populate(shopDetails);
  if (!updated) fail(404, 'Reservation no longer exists');
  notifications.reservationUpdated(updated._id);
  res.json({ success: true, data: updated });
};
exports.deleteReservation = async (req, res) => {
  const reservation = await Reservation.findById(id(req.params.id));
  if (!reservation) fail(404, 'Reservation not found');
  if (!allowed(reservation, req.user)) fail(403, 'This reservation belongs to another user');
  await reservation.deleteOne();
  notifications.reservationCancelled(reservation.toObject());
  res.json({ success: true, data: {} });
};
