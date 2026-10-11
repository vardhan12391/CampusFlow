/**
 * routes/staffRoutes.js
 * Mounted at /staff - every route here is staff-only.
 */
const router = require('express').Router();

const staffController = require('../controllers/staffController');
const { ensureLoggedIn } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(ensureLoggedIn, requireRole('staff'));

router.get('/', staffController.dashboard);
router.get('/complaints', staffController.listComplaints);

module.exports = router;
