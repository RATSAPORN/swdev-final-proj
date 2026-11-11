const Shop = require('../models/MassageShop');
const Reservation = require('../models/Reservation');
const { fields, id, fail } = require('../middleware/validation');
exports.getShops = async (req, res) => {
  const data = await Shop.find().sort('name');
  res.json({ success: true, count: data.length, data });
};
exports.getShop = async (req, res) => {
  const data = await Shop.findById(id(req.params.id));
  if (!data) fail(404, 'Massage shop not found');
  res.json({ success: true, data });
};
exports.createShop = async (req, res) => {
  const data = await Shop.create(fields(req.body, ['name', 'address', 'tel', 'openTime', 'closeTime']));
  res.status(201).json({ success: true, data });
};
exports.updateShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  Object.assign(shop, fields(req.body, ['name', 'address', 'tel', 'openTime', 'closeTime']));
  await shop.save();
  res.json({ success: true, data: shop });
};
exports.deleteShop = async (req, res) => {
  const shop = await Shop.findById(id(req.params.id));
  if (!shop) fail(404, 'Massage shop not found');
  if (await Reservation.exists({ shop: shop.id })) fail(409, 'Delete this shop’s reservations before deleting the shop');
  await shop.deleteOne();
  res.json({ success: true, data: {} });
};
