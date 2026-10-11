/**
 * middleware/context.js
 * Runs on EVERY request, before any route, and prepares the values that
 * views need. This is what makes `res.locals.currentUser` available in EJS.
 *
 *  1. flashMessages - one-time success/error messages stored in the session.
 *                     They are read here and then deleted, so an alert is
 *                     shown exactly once (after a redirect).
 *  2. viewGlobals   - constants for the forms + the logged-in user.
 */
const Complaint = require('../models/Complaint');

function flashMessages(req, res, next) {
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;

  // clear so the alert does not appear again on the next page
  delete req.session.success;
  delete req.session.error;

  next();
}

function viewGlobals(req, res, next) {
  res.locals.currentUser = req.user || null;

  // Option lists used by the forms, defined once in models/Complaint.js
  res.locals.categories = Complaint.CATEGORIES;
  res.locals.priorities = Complaint.PRIORITIES;
  res.locals.statuses = Complaint.STATUSES;

  // Needed by the filter bar to keep the selected values after a search
  res.locals.query = req.query;
  res.locals.currentPath = req.originalUrl.split('?')[0];

  // Validation errors: controllers assign res.locals.errors before rendering,
  // then views call fieldError('name') to show the message under an input.
  res.locals.errors = [];
  res.locals.fieldError = function (fieldName) {
    const found = res.locals.errors.find((error) => error.path === fieldName);
    return found ? found.msg : null;
  };

  // Builds a link to another page of the CURRENT list while keeping every
  // active filter: /admin/complaints?status=Assigned&page=3
  res.locals.pageUrl = function (targetPage) {
    const params = new URLSearchParams(req.query);
    params.set('page', String(targetPage));
    return `${req.originalUrl.split('?')[0]}?${params.toString()}`;
  };

  // Small date helpers so every page formats dates the same way
  res.locals.formatDate = function (value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };
  res.locals.formatDay = function (value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  };

  next();
}

module.exports = { flashMessages, viewGlobals };
