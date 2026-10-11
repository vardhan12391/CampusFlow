/**
 * routes/complaintRoutes.js
 * Mounted at /complaints in app.js
 *
 * IMPORTANT: static paths ("/new") are declared BEFORE the parameterised one
 * ("/:id"), otherwise Express would match "new" as an id.
 */
const router = require('express').Router();

const complaintController = require('../controllers/complaintController');
const { ensureLoggedIn } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const upload = require('../middleware/upload');
const { complaintRules, commentRules } = require('../middleware/validators');

// --- student: create -------------------------------------------------------
router.get('/new', ensureLoggedIn, requireRole('student'), complaintController.newComplaintForm);

router.post(
  '/',
  ensureLoggedIn,
  requireRole('student'),
  upload.single('image'), // parses multipart form data and saves the file
  complaintRules,
  complaintController.createComplaint
);

// --- anyone logged in ------------------------------------------------------
router.get('/:id', ensureLoggedIn, complaintController.showComplaint);
router.post('/:id/comments', ensureLoggedIn, commentRules, complaintController.addComment);

// --- staff -----------------------------------------------------------------
router.post('/:id/accept', ensureLoggedIn, requireRole('staff', 'admin'), complaintController.acceptComplaint);

// status changes are role-checked INSIDE the controller (the workflow table
// depends on who is asking and who the complaint is assigned to)
router.patch('/:id/status', ensureLoggedIn, complaintController.changeStatus);

// --- admin -----------------------------------------------------------------
router.patch('/:id/assign', ensureLoggedIn, requireRole('admin'), complaintController.assignComplaint);
router.patch('/:id/priority', ensureLoggedIn, requireRole('admin'), complaintController.updatePriority);

// --- student: close / reopen / feedback ------------------------------------
router.post('/:id/confirm', ensureLoggedIn, requireRole('student'), complaintController.confirmResolution);
router.post('/:id/feedback', ensureLoggedIn, requireRole('student'), complaintController.submitFeedback);

module.exports = router;
