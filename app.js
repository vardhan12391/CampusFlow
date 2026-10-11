/**
 * app.js
 * --------------------------------------------------------------------------
 * Entry point of CampusFlow. Reading top-to-bottom shows the full request
 * cycle exactly as it happens:
 *
 *   Browser  ->  middleware  ->  route  ->  controller  ->  Mongoose  ->  MongoDB
 *           <-  EJS view / JSON  <-
 *
 * Keep this file small: it only wires things together. Business logic lives
 * in controllers/, data lives in models/, HTML lives in views/.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo'); // v6 exports a named class
const helmet = require('helmet');
const methodOverride = require('method-override');

const connectDB = require('./config/db');
const { flashMessages, viewGlobals } = require('./middleware/context');
const { loadUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { runEscalationCheck } = require('./services/escalationService');

const homeController = require('./controllers/homeController');
const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const studentRoutes = require('./routes/studentRoutes');
const staffRoutes = require('./routes/staffRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// --- 1. View engine (server-side rendering with EJS) -----------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Behind a hosting proxy (Render / Railway / Heroku) the platform terminates
// HTTPS and forwards the request over plain HTTP. Express must trust the first
// proxy hop, otherwise req.secure is false and the `secure` session cookie
// would never be sent back -> login would silently break in production.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- 2. Request parsing and static files -----------------------------------
app.use(express.urlencoded({ extended: true })); // HTML form submissions
app.use(express.json()); // JSON body for the REST API
// Lets an HTML form send PATCH/DELETE by posting a hidden `_method` field.
// NOTE: a plain string getter only reads the QUERY string, so we pass a small
// function that checks the parsed body first and falls back to ?_method=.
app.use(
  methodOverride((req) => {
    if (req.body && typeof req.body === 'object' && req.body._method) {
      return req.body._method;
    }
    return req.query._method;
  })
);
app.use(express.static(path.join(__dirname, 'public'))); // /css, /js, /images
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // uploaded photos

// --- 3. Security headers (helmet sets ~15 HTTP headers for us) -------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' is only needed because a couple of EJS pages embed
        // small <script> blocks; in production use per-request nonces instead.
        // Bootstrap + Chart.js are vendored in /public/vendor, so the CSP
        // only needs to allow our own origin (no external CDN anymore).
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// --- 4. Sessions (the "remember me" mechanism behind login) ----------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    resave: false, // do not save unchanged sessions on every request
    saveUninitialized: false, // do not create a session for anonymous visitors
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }), // sessions survive restarts
    cookie: {
      httpOnly: true, // JavaScript cannot read the cookie -> XSS protection
      sameSite: 'lax', // basic CSRF protection for GET requests
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    },
  })
);

// --- 5. Per-request context: flash messages, currentUser, form constants ----
app.use(flashMessages);
app.use(loadUser);
app.use(viewGlobals);

// --- 6. Routes --------------------------------------------------------------
app.get('/', homeController.homePage);
app.use('/auth', authRoutes);
app.use('/complaints', complaintRoutes);
app.use('/student', studentRoutes);
app.use('/staff', staffRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// --- 7. Error handling (always last) ---------------------------------------
app.use(notFound);
app.use(errorHandler);

// --- 8. Server start (also used by the tests) ------------------------------
async function startServer(port = Number(process.env.PORT) || 3000) {
  await connectDB();

  // Escalation: run once now (catch up on old complaints), then every 15 min.
  runEscalationCheck().catch((error) => console.error('Escalation check failed:', error.message));
  const escalationTimer = setInterval(() => {
    runEscalationCheck().catch((error) => console.error('Escalation check failed:', error.message));
  }, 1000 * 60 * 15);
  escalationTimer.unref(); // do not keep the process alive just for this timer

  const server = app.listen(port, () => {
    console.log(`CampusFlow running at http://localhost:${port}`);
  });
  return server;
}

// Start only when executed directly (`node app.js`), not when tests import us.
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };
