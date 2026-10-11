/**
 * middleware/errorHandler.js
 * --------------------------------------------------------------------------
 * Two special middleware that must be registered LAST in app.js:
 *
 *  - notFound    : runs when no route matched        -> 404
 *  - errorHandler: runs when a controller calls next(err) -> 400/500
 *
 * Express decides this automatically: error middleware always receives
 * four arguments (err, req, res, next).
 */
const mongoose = require('mongoose');

/** Small helper so controllers can write: next(new HttpError(404, 'Complaint not found')) */
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function wantsJson(req) {
  return req.originalUrl.startsWith('/api') || req.headers.accept === 'application/json';
}

function notFound(req, res, next) {
  if (wantsJson(req)) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong on the server.';

  // Mongoose validation error (e.g. missing title) -> client mistake -> 400
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((fieldError) => fieldError.message)
      .join(' ');
  }

  // Mongoose duplicate key (e.g. registering with an existing email) -> 400
  if (error.code === 11000) {
    statusCode = 400;
    const field = Object.keys(error.keyValue || { field: '' })[0];
    message = `That ${field} is already in use.`;
  }

  // Bad ObjectId in the URL -> treat as "not found" instead of a crash
  if (error.name === 'CastError') {
    statusCode = 404;
    message = 'The requested record was not found.';
  }

  // Only server bugs reach the 500 branch - log them for debugging.
  if (statusCode === 500) {
    console.error(error);
  }

  if (res.headersSent) return;

  if (wantsJson(req)) {
    return res.status(statusCode).json({ success: false, message });
  }

  if (statusCode === 404) {
    return res.status(404).render('errors/404', { title: 'Page not found' });
  }

  if (statusCode === 403) {
    return res.status(403).render('errors/403', { title: 'Access denied', message });
  }

  res.status(statusCode).render('errors/500', {
    title: statusCode === 500 ? 'Server error' : 'Request failed',
    statusCode,
    message,
  });
}

module.exports = { notFound, errorHandler, HttpError };
