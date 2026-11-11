const User = require('../models/User');
const { fail, fields } = require('../middleware/validation');
exports.register = async (req, res) => {
  const data = fields(req.body, ['name', 'email', 'password', 'tel']);
  for (const key of ['name', 'email', 'password', 'tel']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) fail(400, `${key} is required`);
  }
  const user = await User.create({ ...data, role: 'user' });
  sendTokenResponse(user, 201, res);
};
exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !password) fail(400, 'Please provide an email and password');
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +tokenVersion');
  if (!user || !(await user.matchPassword(password))) fail(401, 'Invalid email or password');
  sendTokenResponse(user, 200, res);
};
const cookieOptions = () => ({ httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
function sendTokenResponse(user, status, res) {
  const token = user.getSignedJwtToken();
  res.status(status).cookie('token', token, { ...cookieOptions(), maxAge: Number(process.env.JWT_COOKIE_EXPIRE || 1) * 86400000 }).json({ success: true, token });
}
exports.getMe = async (req, res) => {
  const { _id, name, email, tel, role } = req.user;
  res.json({ success: true, data: { _id, name, email, tel, role } });
};
exports.logout = async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  res.clearCookie('token', cookieOptions()).json({ success: true, message: 'Logged out of all sessions' });
};
