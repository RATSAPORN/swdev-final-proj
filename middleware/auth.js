const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { fail } = require('./validation');
exports.protect = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header ? (/^Bearer (\S+)$/.exec(header)?.[1]) : req.cookies?.token;
  if (!token) fail(401, 'Please log in to continue');
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
  catch { fail(401, 'Your session has expired. Please log in again'); }
  const user = await User.findById(decoded.id).select('+tokenVersion');
  if (!user || decoded.version !== user.tokenVersion) fail(401, 'Please log in again');
  req.user = user;
  next();
};
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) fail(403, 'Admin access is required');
  next();
};
