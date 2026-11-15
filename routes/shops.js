const router = require('express').Router();
const c = require('../controllers/shops');
const { protect, authorize } = require('../middleware/auth');
router.use('/:shopId/reservations', require('./reservations'));
router.get('/:shopId/reviews', require('../controllers/reviews').list);
router.route('/').get(c.getShops).post(protect, authorize('admin'), c.createShop);
router.get('/:id/availability', c.getAvailability);
router.route('/:id').get(c.getShop).put(protect, authorize('admin'), c.updateShop).delete(protect, authorize('admin'), c.deleteShop);
module.exports = router;
