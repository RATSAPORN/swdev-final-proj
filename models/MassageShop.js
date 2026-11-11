const mongoose = require('mongoose');
const time = { type: String, required: true, match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour time)'] };
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  telephone: { type: String, alias: 'tel', required: true, trim: true, match: [/^\+?[0-9][0-9 ()-]{7,19}$/, 'Invalid telephone number'] },
  opens: { ...time, alias: 'openTime' },
  closes: { ...time, alias: 'closeTime' },
  neighborhood: String,
  description: String,
  image: String,
  tags: [String],
  // AR1: how many guests the shop can serve at the same time in one 60-minute period.
  capacity: { type: Number, default: 3, required: [true, 'Capacity is required'], min: [1, 'Capacity must be at least 1'], max: [20, 'Capacity must be 20 or fewer'], validate: { validator: Number.isInteger, message: 'Capacity must be a whole number' } },
  // AR3: Health Establishment License (ใบอนุญาตสถานประกอบการเพื่อสุขภาพ).
  // Placeholder format chosen for this project: HE-<Buddhist year>-<2-digit province code>-<5-digit number>.
  licenseNumber: { type: String, trim: true, uppercase: true, match: [/^HE-25\d{2}-\d{2}-\d{5}$/, 'License number must look like HE-2569-10-00123'] },
  licenseExpiresAt: { type: String, match: [/^\d{4}-\d{2}-\d{2}$/, 'License expiry date must be YYYY-MM-DD'] },
}, { collection: 'shops', timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
schema.pre('validate', function () {
  if (this.openTime && this.closeTime && this.openTime >= this.closeTime) {
    this.invalidate('closeTime', 'Closing time must be after opening time');
  }
});
module.exports = mongoose.model('MassageShop', schema);
