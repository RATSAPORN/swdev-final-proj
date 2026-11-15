const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  reservation: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, immutable: true },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'MassageShop', required: true, immutable: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  comment: { type: String, trim: true, maxlength: 2000 },
  hidden: { type: Boolean, default: false, required: true },
  deleted: { type: Boolean, default: false, required: true },
  moderationReason: String,
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
  // Written in the same document as the review: an alert cannot be lost between two inserts.
  notification: { type: require('./ReviewDelivery'), select: false },
}, { timestamps: true });
schema.index({ shop: 1, hidden: 1, deleted: 1, createdAt: -1 });
schema.index({ 'notification.status': 1, 'notification.nextAttemptAt': 1 });
module.exports = mongoose.model('Review', schema);
