/**
 * routes/adminRoutes.js
 * Mounted at /admin - every route here is admin-only.
 * The router-level guard is one line, and it protects the whole section.
 */
const router = require('express').Router();

const adminController = require('../controllers/adminController');
const { ensureLoggedIn } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(ensureLoggedIn, requireRole('admin'));

router.get('/', adminController.dashboard);
router.get('/complaints', adminController.listComplaints);

router.get('/users', adminController.users);
router.post('/users', adminController.createUser);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/status', adminController.toggleUserStatus);

router.get('/analytics', adminController.analytics);
router.get('/feedback', adminController.feedbackList);

module.exports = router;
