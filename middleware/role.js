/**
 * middleware/role.js
 * --------------------------------------------------------------------------
 * Role-based authorization: "who is allowed to open this route?".
 *
 * Authentication  = proving identity       (login)
 * Authorization   = checking permissions   (this middleware)
 *
 * Usage:  router.get('/users', requireRole('admin'), adminController.users)
 */
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ success: false, message: 'Please log in first.' });
      }
      req.session.error = 'Please log in to continue.';
      return res.redirect('/auth/login');
    }

    if (!allowedRoles.includes(req.user.role)) {
      // 403 = "I know who you are, but you are not allowed"
      if (req.originalUrl.startsWith('/api')) {
        return res.status(403).json({ success: false, message: 'You do not have permission to do that.' });
      }
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    next();
  };
}

module.exports = { requireRole };
