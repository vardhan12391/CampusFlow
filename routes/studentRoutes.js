/**
 * routes/studentRoutes.js
 * Mounted at /student - every route here is student-only.
 */
const router = require('express').Router();

const studentController = require('../controllers/studentController');
const { ensureLoggedIn } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// One line protects the whole section.
router.use(ensureLoggedIn, requireRole('student'));

router.get('/', studentController.dashboard);
router.get('/complaints', studentController.listComplaints);

module.exports = router;
