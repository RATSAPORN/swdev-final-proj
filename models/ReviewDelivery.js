const mongoose = require('mongoose');
module.exports = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed', 'not-linked', 'skipped'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  retryKey: String,
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  claim: String,
  deliveredAt: Date,
  // Freeze the first attempted payload: LINE retries require identical recipients and content.
  recipient: String,
  message: String,
  firstAttemptAt: Date,
}, { _id: false });
