const Review = require('../models/Review');
const { SLOT_MINUTES } = require('./time');
const completed = (reservation, now = new Date()) => !!reservation.startAt &&
  new Date(reservation.startAt).getTime() + SLOT_MINUTES * 60000 <= now.getTime();
async function summaries(shopIds) {
  const rows = await Review.aggregate([
    { $match: { shop: { $in: shopIds }, hidden: false, deleted: false } },
    { $group: { _id: '$shop', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
  ]);
  return new Map(rows.map(row => [String(row._id), { averageRating: Math.round(row.averageRating * 10) / 10, reviewCount: row.reviewCount }]));
}
async function withSummaries(shops) {
  const stats = await summaries(shops.map(shop => shop._id));
  return shops.map(shop => ({ ...shop.toObject(), ...stats.get(shop.id) || { averageRating: null, reviewCount: 0 } }));
}
async function reservationState(reservations, user) {
  const reviews = await Review.find({ reservation: { $in: reservations.map(r => r._id) } }).select('reservation').lean();
  const submitted = new Set(reviews.map(r => String(r.reservation)));
  return reservations.map(r => {
    const reviewSubmitted = !!r.reviewSubmitted || submitted.has(r.id);
    const owner = String(r.user?._id || r.user) === user.id;
    return { ...r.toObject(), reviewSubmitted, canReview: owner && completed(r) && !reviewSubmitted };
  });
}
module.exports = { completed, summaries, withSummaries, reservationState };
