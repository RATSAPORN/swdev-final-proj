// AR6: one-time LINE Login request (CSRF state, OpenID nonce, PKCE verifier) bound to the user who started it.
// MongoDB's TTL monitor removes unused records after 10 minutes; the callback also checks the age.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
}, { collection: 'line_login_states', versionKey: false });
module.exports = mongoose.model('LineLoginState', schema);
