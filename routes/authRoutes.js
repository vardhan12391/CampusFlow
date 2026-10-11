/**
 * routes/authRoutes.js
 * /auth/register, /auth/login, /auth/logout
 *
 * Every route is:  HTTP method -> middleware -> controller
 * (validation rules are the middleware in the middle)
 */
const router = require('express').Router();

const authController = require('../controllers/authController');
const { ensureGuest, ensureLoggedIn } = require('../middleware/auth');
const { registerRules, loginRules } = require('../middleware/validators');

// GET shows the page, POST submits the form
router.get('/register', ensureGuest, authController.showRegister);
router.post('/register', ensureGuest, registerRules, authController.register);

router.get('/login', ensureGuest, authController.showLogin);
router.post('/login', ensureGuest, loginRules, authController.login);

router.post('/logout', ensureLoggedIn, authController.logout);

module.exports = router;
