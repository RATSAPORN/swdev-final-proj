// AR6: LINE account linking.
const router = require('express').Router();
const c = require('../controllers/line');
const { protect } = require('../middleware/auth');
router.get('/status', protect, c.status);
router.get('/login', protect, c.start);
router.get('/callback', c.callback); // no session cookie arrives here; the one-time state identifies the user
router.delete('/link', protect, c.unlink);
module.exports = router;
