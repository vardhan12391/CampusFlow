/**
 * controllers/authController.js
 * Registration, login and logout.
 *
 *   1. look up the email
 *   2. compare the typed password with the stored bcrypt hash
 *   3. store ONLY the user id in the session
 *   4. redirect to the dashboard that matches the role
 *
 * We always return the same "Invalid email or password" message so an
 * attacker cannot discover which emails exist in the system.
 */
const { validationResult } = require('express-validator');

const User = require('../models/User');

const DASHBOARD_BY_ROLE = {
  student: '/student',
  staff: '/staff',
  admin: '/admin',
};

function showRegister(req, res) {
  res.render('auth/register', { title: 'Create account', old: {} });
}

async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Re-render the form with the user's input and inline error messages.
      res.locals.errors = errors.array();
      return res.status(400).render('auth/register', {
        title: 'Create account',
        old: req.body,
      });
    }

    // Self-registration always creates a STUDENT.
    // Staff and admin accounts are created by an admin from Admin -> Users.
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password, // hashed by the pre-save hook in User.js
      role: 'student',
      studentId: req.body.studentId,
      department: req.body.department,
      year: req.body.year,
    });

    // Log the user in immediately (no second login after registering).
    req.session.userId = user._id;
    req.session.success = `Welcome to CampusFlow, ${user.name}!`;

    return res.redirect('/student');
  } catch (error) {
    // Duplicate email (MongoDB error code 11000) -> friendly message
    if (error.code === 11000) {
      res.locals.errors = [{ path: 'email', msg: 'An account with this email already exists.' }];
      return res.status(400).render('auth/register', {
        title: 'Create account',
        old: req.body,
      });
    }
    return next(error);
  }
}

function showLogin(req, res) {
  res.render('auth/login', { title: 'Login', old: {} });
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.locals.errors = errors.array();
      return res.status(400).render('auth/login', { title: 'Login', old: req.body });
    }

    // password is `select: false`, so we must ask for it explicitly.
    const user = await User.findOne({ email: req.body.email }).select('+password');

    // Same message for "no such user" and "wrong password" -> no user enumeration.
    if (!user || !(await user.comparePassword(req.body.password))) {
      res.locals.errors = [{ path: 'password', msg: 'Invalid email or password.' }];
      return res.status(401).render('auth/login', { title: 'Login', old: { email: req.body.email } });
    }

    if (!user.isActive) {
      res.locals.errors = [{ path: 'email', msg: 'This account has been deactivated. Contact the admin.' }];
      return res.status(403).render('auth/login', { title: 'Login', old: { email: req.body.email } });
    }

    // Session regeneration defends against "session fixation": an attacker
    // cannot reuse a session id they planted before the login.
    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.userId = user._id;
      req.session.success = `Welcome back, ${user.name}!`;
      return res.redirect(DASHBOARD_BY_ROLE[user.role] || '/student');
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
}

module.exports = { showRegister, register, showLogin, login, logout };
