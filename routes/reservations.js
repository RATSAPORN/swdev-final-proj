const router = require('express').Router({ mergeParams: true });
const c = require('../controllers/reservations');
const { protect } = require('../middleware/auth');
router.use(protect);
router.route('/').get(c.getReservations).post(c.addReservation);
router.route('/:id').get(c.getReservation).put(c.updateReservation).delete(c.deleteReservation);
module.exports = router;
