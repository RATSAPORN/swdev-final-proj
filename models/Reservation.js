// Adapted from the original Appointment schema; hospitals become massage shops.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  apptDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'MassageShop', required: true },
  slot: { type: Number, required: true, enum: [1, 2, 3], immutable: true, select: false },
  active: { type: Boolean, default: true, required: true, immutable: true, select: false },
  createdAt: { type: Date, default: Date.now },
});
// Three slots and a unique index enforce the limit under concurrent requests.
// Match the existing SW_DEV index; every new reservation is active until deleted.
schema.index({ user: 1, slot: 1 }, { unique: true, partialFilterExpression: { active: true } });
module.exports = mongoose.model('Reservation', schema);
