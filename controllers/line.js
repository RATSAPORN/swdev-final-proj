// AR6: link a LINE account to the logged-in user via LINE Login. Email/password login is unchanged.
const crypto = require('crypto');
const User = require('../models/User');
const LineLoginState = require('../models/LineLoginState');
const line = require('../services/line');

const STATE_COOKIE = 'line_state';
const STATE_TTL_MS = 10 * 60000;
// The session cookie is SameSite=Strict, so it is not sent when LINE redirects back (a cross-site navigation).
// The state record identifies the user; this Lax cookie binds the callback to the browser that started it.
const stateCookie = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/v1/line' });
const backToApp = (res, result) => res.redirect(`/?line=${result}#reservations`);
const sameValue = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

exports.status = async (req, res) => {
  const linked = await User.exists({ _id: req.user._id, lineUserId: { $type: 'string' } });
  res.json({ success: true, data: {
    linked: !!linked,
    loginMode: line.loginMode(),
    messagingMode: line.messagingMode(),
    addFriendUrl: process.env.LINE_OA_ADD_FRIEND_URL || null,
  } });
};

exports.start = async (req, res) => {
  const mode = line.loginMode();
  if (mode === 'off') return backToApp(res, 'unavailable');
  const request = line.newLoginRequest();
  await LineLoginState.create({ ...request, user: req.user._id });
  res.cookie(STATE_COOKIE, request.state, { ...stateCookie(), maxAge: STATE_TTL_MS });
  res.redirect(mode === 'mock' ? line.mockCallbackPath(request.state) : line.authorizeUrl(request));
};

exports.callback = async (req, res) => {
  const { state, code, error } = req.query;
  const cookieState = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, stateCookie());
  if (typeof state !== 'string' || typeof cookieState !== 'string' || !sameValue(state, cookieState)) return backToApp(res, 'invalid');
  const record = await LineLoginState.findOneAndDelete({ state }); // single use
  if (!record || Date.now() - record.createdAt.getTime() > STATE_TTL_MS) return backToApp(res, 'expired');
  if (error !== undefined) return backToApp(res, 'cancelled');
  if (typeof code !== 'string' || !code) return backToApp(res, 'invalid');
  let sub;
  try {
    ({ sub } = await line.verifyLogin({ code, codeVerifier: record.codeVerifier, nonce: record.nonce, userId: String(record.user) }));
  } catch (err) {
    line.logError('LINE Login', err);
    return backToApp(res, 'error');
  }
  try {
    const result = await User.updateOne({ _id: record.user }, { $set: { lineUserId: sub } });
    if (!result.matchedCount) return backToApp(res, 'invalid');
  } catch (err) {
    if (err.code === 11000) return backToApp(res, 'taken');
    throw err;
  }
  backToApp(res, 'linked');
};

exports.unlink = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { lineUserId: '' } });
  res.json({ success: true, data: { linked: false } });
};
