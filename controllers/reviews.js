const Review = require('../models/Review');
const Reservation = require('../models/Reservation');
const Shop = require('../models/MassageShop');
const User = require('../models/User');
const { fail, id, fields } = require('../middleware/validation');
const { completed, summaries } = require('../utils/reviews');
function pageOptions(query) {
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) fail(400, 'Invalid pagination');
    return Number(value);
  };
  return { page: integer(query.page, 1, 100000), limit: integer(query.limit, 10, 50) };
}
function publicReview(r) {
  return { _id: r._id, rating: r.rating, comment: r.comment, createdAt: r.createdAt, author: { name: r.user?.name || 'Former guest' } };
}
exports.list = async (req, res) => {
  const shop = await Shop.findById(id(req.params.shopId));
  if (!shop) fail(404, 'Massage shop not found');
  const { page, limit } = pageOptions(req.query);
  const filter = { shop: shop._id, hidden: false, deleted: false };
  const [reviews, stats] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name'),
    summaries([shop._id]),
  ]);
  const summary = stats.get(shop.id) || { averageRating: null, reviewCount: 0 };
  res.json({ success: true, page, limit, total: summary.reviewCount, averageRating: summary.averageRating, data: reviews.map(publicReview) });
};
exports.create = async (req, res) => {
  const r = await Reservation.findById(id(req.params.id));
  if (!r) fail(404, 'Reservation not found');
  if (String(r.user) !== req.user.id) fail(403, 'Only the reservation owner can leave a review');
  if (!completed(r)) fail(400, 'Reviews are available after the 60-minute reservation ends');
  const { rating, comment } = fields(req.body, ['rating', 'comment']);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'Choose a whole-number rating from 1 to 5');
  if (typeof comment !== 'string' || !comment.trim() || comment.trim().length > 2000) fail(400, 'Comment must contain 1–2000 characters');
  if (r.reviewSubmitted || await Review.exists({ reservation: r.id })) fail(409, 'You have already reviewed this reservation');
  if (!await Shop.exists({ _id: r.shop })) fail(404, 'Massage shop not found');
  let review;
  try {
    review = await Review.create({ reservation: r.id, shop: r.shop, user: r.user, rating, comment: comment.trim(), notification: {} });
  } catch (error) {
    if (error.code === 11000) fail(409, 'You have already reviewed this reservation');
    throw error;
  }
  await Reservation.updateOne({ _id: r.id }, { $set: { reviewSubmitted: true } });
  review.user = req.user;
  res.status(201).json({ success: true, data: publicReview(review) });
};
exports.adminList = async (req, res) => {
  const { page, limit } = pageOptions(req.query);
  const filter = { deleted: false };
  if (req.query.shop) filter.shop = id(req.query.shop);
  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name').populate('shop', 'name'),
    Review.countDocuments(filter),
  ]);
  res.json({ success: true, page, limit, total, data: reviews.map(r => ({ ...publicReview(r), shop: r.shop, hidden: r.hidden, moderationReason: r.moderationReason, moderatedAt: r.moderatedAt })) });
};
exports.moderate = async (req, res) => {
  const { hidden, reason } = fields(req.body, ['hidden', 'reason']);
  if (typeof hidden !== 'boolean' || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) fail(400, 'Provide visibility and a moderation reason of 1–500 characters');
  const review = await Review.findOneAndUpdate({ _id: id(req.params.id), deleted: false }, { $set: {
    hidden, moderationReason: reason.trim(), moderatedBy: req.user.id, moderatedAt: new Date(),
  } }, { new: true });
  if (!review) fail(404, 'Review not found');
  res.json({ success: true, data: { _id: review._id, hidden: review.hidden } });
};
exports.remove = async (req, res) => {
  const review = await Review.findOneAndUpdate({ _id: id(req.params.id), deleted: false }, {
    $set: { deleted: true, hidden: true, moderatedBy: req.user.id, moderatedAt: new Date(), 'notification.status': 'skipped' },
    $unset: { comment: '', 'notification.message': '', 'notification.recipient': '' },
  });
  if (!review) fail(404, 'Review not found');
  // Keep only a private tombstone so a deleted review cannot be reposted for this visit.
  res.json({ success: true, data: {} });
};
exports.recipients = async (req, res) => {
  const admins = await User.find({ role: 'admin' }).select('name +lineUserId');
  res.json({ success: true, data: admins.map(a => ({ _id: a._id, name: a.name, lineLinked: !!a.lineUserId })) });
};
exports.settings = async (req, res) => {
  const shops = await Shop.find().select('name +notificationAdmin').sort('name');
  res.json({ success: true, data: shops.map(s => ({ _id: s._id, name: s.name, notificationAdmin: s.notificationAdmin || null })) });
};
