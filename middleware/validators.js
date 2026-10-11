/**
 * middleware/validators.js
 * Server-side validation with express-validator.
 *
 * WHY validate on the server when the browser already has `required` /
 * `pattern` attributes? Because client-side validation is only a convenience:
 * anyone can submit a request with curl/Postman and skip the HTML entirely.
 * The server is the last line of defence for data quality AND security.
 *
 * Each rule below runs in the route, then the controller reads the result
 * with validationResult(req) and re-renders the form with the errors.
 */
const { body } = require('express-validator');
const Complaint = require('../models/Complaint');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password')
    .isLength({ min: 6, max: 72 })
    .withMessage('Password must be at least 6 characters.'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match.'),
  body('role').optional().isIn(['student', 'staff']).withMessage('Invalid role.'),
  // students must fill these in
  body('studentId').trim().notEmpty().withMessage('Student ID is required.'),
  body('department').trim().notEmpty().withMessage('Department is required.'),
  body('year').trim().notEmpty().withMessage('Year is required.'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

const complaintRules = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 120 }),
  body('description').trim().notEmpty().withMessage('Description is required.').isLength({ max: 2000 }),
  body('category').isIn(Complaint.CATEGORIES).withMessage('Choose a valid category.'),
  body('location').trim().notEmpty().withMessage('Location is required.'),
  body('priority').isIn(Complaint.PRIORITIES).withMessage('Choose a valid priority.'),
];

const commentRules = [
  body('body').trim().notEmpty().withMessage('Comment cannot be empty.').isLength({ max: 1000 }),
];

const feedbackRules = [
  body('rating').toInt().isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
  body('comment').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

/**
 * Controllers call this to get a clean list:
 *   const errors = validationResult(req);
 *   if (!errors.isEmpty()) { ... re-render form ... }
 * (kept as a tiny wrapper so imports stay consistent)
 */
function validationErrors(req) {
  return require('express-validator').validationResult(req).array();
}

module.exports = {
  registerRules,
  loginRules,
  complaintRules,
  commentRules,
  feedbackRules,
  validationErrors,
};
