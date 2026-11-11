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
}, { collection: 'shops', timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
schema.pre('validate', function () {
  if (this.openTime && this.closeTime && this.openTime >= this.closeTime) {
    this.invalidate('closeTime', 'Closing time must be after opening time');
  }
});
module.exports = mongoose.model('MassageShop', schema);
