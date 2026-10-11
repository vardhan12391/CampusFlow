/**
 * middleware/auth.js
 * Session-based authentication.
 *
 * On login we only store the user's id in the session:
 *     req.session.userId = user._id
 * On every later request `loadUser` reads that id and loads the fresh user
 * document. Advantage: if an admin deactivates or re-roles an account, the
 * change takes effect on the very next request.
 */
const User = require('../models/User');

/** Puts the logged-in user on req.user (and res.locals.currentUser). */
async function loadUser(req, res, next) {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);

      if (user && user.isActive) {
        req.user = user;
        res.locals.currentUser = user;
      } else {
        req.session.destroy(() => {});
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** Blocks guests. Redirects browsers to /auth/login, answers 401 for APIs. */
function ensureLoggedIn(req, res, next) {
  if (req.user) return next();

  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ success: false, message: 'Please log in first.' });
  }

  req.session.error = 'Please log in to continue.';
  return res.redirect('/auth/login');
}

/** Blocks logged-in users from the login/register pages. */
function ensureGuest(req, res, next) {
  if (!req.user) return next();

  const dashboardByRole = { student: '/student', staff: '/staff', admin: '/admin' };
  return res.redirect(dashboardByRole[req.user.role] || '/student');
}

module.exports = { loadUser, ensureLoggedIn, ensureGuest };
