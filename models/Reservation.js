// Adapted from the original Appointment schema; hospitals become massage shops.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  apptDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'MassageShop', required: true },
  slot: { type: Number, required: true, enum: [1, 2, 3], immutable: true, select: false },
  active: { type: Boolean, default: true, required: true, immutable: true, select: false },
  createdAt: { type: Date, default: Date.now },
  // AR1: fixed 60-minute period (Asia/Bangkok). `seat` is 1..shop.capacity; legacy date-only records have none.
  startTime: { type: String, match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour time)'] },
  startAt: Date,
  seat: { type: Number, min: 1, select: false },
  // AR2: optional free-text notes / special requests.
  notes: { type: String, trim: true, maxlength: [1000, 'Notes must be 1000 characters or fewer'] },
  // AR4: the shop's booking-order number for that day, from an atomic counter (never reused).
  queueNumber: { type: Number, min: 1 },
  // AR5: null = reminder still due; set when the scheduler claims it (or when it is skipped).
  reminderSentAt: { type: Date, default: null },
  reminderStatus: { type: String, enum: ['pending', 'sending', 'sent', 'skipped', 'not-linked', 'failed'] },
});
// Three slots and a unique index enforce the limit under concurrent requests.
// Match the existing SW_DEV index; every new reservation is active until deleted.
schema.index({ user: 1, slot: 1 }, { unique: true, partialFilterExpression: { active: true } });
// AR1: one document per occupied seat in a period, so concurrent bookings cannot exceed capacity.
schema.index({ shop: 1, apptDate: 1, startTime: 1, seat: 1 }, { unique: true, partialFilterExpression: { active: true, seat: { $exists: true } } });
schema.index({ shop: 1, apptDate: 1, queueNumber: 1 }, { unique: true, partialFilterExpression: { queueNumber: { $exists: true } } });
schema.index({ reminderSentAt: 1, startAt: 1 });
module.exports = mongoose.model('Reservation', schema);
