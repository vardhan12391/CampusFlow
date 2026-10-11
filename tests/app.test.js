/**
 * tests/app.test.js
 * End-to-end checks that run against a SEPARATE database (campusflow_test)
 * and a separate port.
 *
 *   npm test
 *
 * Framework: the built-in `node:test` module - no extra dependency.
 * Every test drives the real HTTP server with fetch(), exactly like a
 * browser would: request -> middleware -> controller -> MongoDB -> response.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/campusflow_test';
process.env.SESSION_SECRET = 'test_secret_not_for_production';
process.env.ESCALATION_HOURS = '48';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startServer } = require('../app');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const Feedback = require('../models/Feedback');
const Counter = require('../models/Counter');

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

class Session {
  constructor() {
    this.cookies = {};
  }

  get cookieHeader() {
    return Object.entries(this.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  storeCookies(response) {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    setCookies.forEach((raw) => {
      const [pair] = raw.split(';');
      const separatorIndex = pair.indexOf('=');
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      this.cookies[name] = value;
    });
  }

  async request(method, path, options = {}) {
    const headers = {};
    if (this.cookies) headers.Cookie = this.cookieHeader;

    let body;
    if (options.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    }
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }

    const response = await fetch(BASE + path, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
    this.storeCookies(response);

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = null;
    }

    return {
      status: response.status,
      location: response.headers.get('location'),
      text,
      json,
    };
  }

  get(path, options) {
    return this.request('GET', path, options);
  }
  post(path, options) {
    return this.request('POST', path, options);
  }
  patch(path, options) {
    return this.request('PATCH', path, options);
  }
  delete(path, options) {
    return this.request('DELETE', path, options);
  }
}

const guest = new Session();
const student = new Session();
const otherStudent = new Session();
const staff = new Session();
const admin = new Session();

let server;

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([
    User.deleteMany({}),
    Complaint.deleteMany({}),
    Comment.deleteMany({}),
    Feedback.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  await User.create({
    name: 'Test Student',
    email: 'student@test.edu',
    password: 'password123',
    role: 'student',
    studentId: '21CS0001',
    department: 'Computer Science',
    year: '3rd',
  });
  await User.create({
    name: 'Other Student',
    email: 'other@student.edu',
    password: 'password123',
    role: 'student',
    studentId: '21CS0002',
    department: 'Computer Science',
    year: '2nd',
  });
  await User.create({
    name: 'Test Staff',
    email: 'staff@test.edu',
    password: 'password123',
    role: 'staff',
    department: 'Electrical',
    jobTitle: 'Electrician',
  });
  await User.create({
    name: 'Test Admin',
    email: 'admin@test.edu',
    password: 'password123',
    role: 'admin',
    department: 'Administration',
  });

  server = await startServer(PORT);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

test('guest is redirected away from protected pages', async () => {
  const response = await guest.get('/student');
  assert.equal(response.status, 302);
  assert.match(response.location, /\/auth\/login/);
});

test('guest gets 401 from the JSON API', async () => {
  const response = await guest.get('/api/complaints');
  assert.equal(response.status, 401);
});

// A second guest session: the register/login tests below must run as a
// logged-OUT visitor, because /auth/* redirects anyone who is already signed in.
const freshGuest = new Session();

test('registration creates a student account', async () => {
  const response = await guest.post('/auth/register', {
    form: {
      name: 'New Student',
      email: 'new.student@test.edu',
      password: 'secret123',
      confirmPassword: 'secret123',
      studentId: '22CS0099',
      department: 'Computer Science',
      year: '1st',
    },
  });

  assert.equal(response.status, 302);
  assert.match(response.location, /\/student/);

  // password is select:false, so ask for it explicitly to check the hash
  const created = await User.findOne({ email: 'new.student@test.edu' }).select('+password');
  assert.ok(created, 'account should exist');
  assert.equal(created.role, 'student');
  // the password must be stored as a hash, never as plain text
  assert.notEqual(created.password, 'secret123');
  assert.match(created.password, /^\$2[aby]\$/);
});

test('registration with invalid data returns 400', async () => {
  const response = await freshGuest.post('/auth/register', {
    form: { name: '', email: 'not-an-email', password: '123' },
  });
  assert.equal(response.status, 400);
});

test('login with wrong password fails with 401', async () => {
  const response = await freshGuest.post('/auth/login', {
    form: { email: 'student@test.edu', password: 'wrong-password' },
  });
  assert.equal(response.status, 401);
});

test('login with correct credentials redirects to the student dashboard', async () => {
  const response = await student.post('/auth/login', {
    form: { email: 'student@test.edu', password: 'password123' },
  });
  assert.equal(response.status, 302);
  assert.match(response.location, /\/student/);

  const dashboard = await student.get('/student');
  assert.equal(dashboard.status, 200);
});

test('staff and admin login reach their own dashboards', async () => {
  const staffLogin = await staff.post('/auth/login', {
    form: { email: 'staff@test.edu', password: 'password123' },
  });
  assert.match(staffLogin.location, /\/staff/);

  const adminLogin = await admin.post('/auth/login', {
    form: { email: 'admin@test.edu', password: 'password123' },
  });
  assert.match(adminLogin.location, /\/admin/);

  const secondStudent = await otherStudent.post('/auth/login', {
    form: { email: 'other@student.edu', password: 'password123' },
  });
  assert.equal(secondStudent.status, 302);
});

test('student cannot open admin pages (403)', async () => {
  const response = await student.get('/admin');
  assert.equal(response.status, 403);
});

test('staff cannot open admin pages (403)', async () => {
  const response = await staff.get('/admin/analytics');
  assert.equal(response.status, 403);
});

test('admin can open admin pages (200)', async () => {
  const response = await admin.get('/admin');
  assert.equal(response.status, 200);
});

test('admin cannot open student-only pages (403)', async () => {
  const response = await admin.get('/student');
  assert.equal(response.status, 403);
});

let createdTicket;

test('student creates a complaint and receives a ticket id', async () => {
  const response = await student.post('/complaints', {
    form: {
      title: 'Tube light broken in class',
      description: 'The tube light near the window is flickering constantly.',
      category: 'Electrical',
      location: 'Block A, Lecture Hall 4',
      priority: 'High',
    },
  });

  assert.equal(response.status, 302);
  assert.match(response.location, /\/complaints\/CF-\d+/);
  createdTicket = response.location.split('/').pop();

  const complaint = await Complaint.findOne({ ticketId: createdTicket });
  assert.ok(complaint);
  assert.equal(complaint.status, 'Submitted');
  assert.equal(complaint.priority, 'High');
});

test('duplicate detection warns before creating a second complaint', async () => {
  const response = await student.post('/complaints', {
    form: {
      title: 'Another tube light problem',
      description: 'Same issue again.',
      category: 'Electrical',
      location: 'Block A, Lecture Hall 4', // same category + location
      priority: 'Medium',
    },
  });

  assert.equal(response.status, 409); // "conflict" - similar complaint exists
  assert.match(response.text, /similar issue/i);
});

test('student can force-create after seeing the duplicate warning', async () => {
  const response = await student.post('/complaints', {
    form: {
      title: 'Another tube light problem',
      description: 'Same issue again.',
      category: 'Electrical',
      location: 'Block A, Lecture Hall 4',
      priority: 'Medium',
      confirmDuplicate: 'yes',
    },
  });
  assert.equal(response.status, 302);
});

test('another student cannot read someone else\'s complaint (403)', async () => {
  const response = await otherStudent.get(`/complaints/${createdTicket}`);
  assert.equal(response.status, 403);
});

test('the reporter can open the complaint page', async () => {
  const response = await student.get(`/complaints/${createdTicket}`);
  assert.equal(response.status, 200);
  assert.match(response.text, /Tube light broken in class/);
});

test('invalid complaint id returns 404', async () => {
  const response = await student.get('/complaints/THIS-IS-NOT-A-TICKET');
  assert.equal(response.status, 404);
});

test('admin assigns the complaint to staff', async () => {
  const staffUser = await User.findOne({ role: 'staff' });
  const complaint = await Complaint.findOne({ ticketId: createdTicket });

  const response = await admin.patch(`/complaints/${complaint._id}/assign`, {
    form: { assignedTo: String(staffUser._id) },
  });
  assert.equal(response.status, 302);

  const updated = await Complaint.findById(complaint._id);
  assert.equal(String(updated.assignedTo), String(staffUser._id));
  assert.equal(updated.status, 'Assigned');
});

test('admin changes the priority', async () => {
  const complaint = await Complaint.findOne({ ticketId: createdTicket });

  // POST + _method=PATCH proves method-override works like a real form
  const response = await admin.post(`/complaints/${complaint._id}/priority`, {
    form: { _method: 'PATCH', priority: 'Urgent' },
  });
  assert.equal(response.status, 302);

  const updated = await Complaint.findById(complaint._id);
  assert.equal(updated.priority, 'Urgent');
  assert.equal(updated.priorityRank, 1); // synced by the model hook
});

test('staff moves the complaint through the workflow', async () => {
  const complaint = await Complaint.findOne({ ticketId: createdTicket });

  const started = await staff.patch(`/complaints/${complaint._id}/status`, {
    form: { status: 'In Progress' },
  });
  assert.equal(started.status, 302);

  const resolved = await staff.patch(`/complaints/${complaint._id}/status`, {
    form: { status: 'Resolved' },
  });
  assert.equal(resolved.status, 302);

  const updated = await Complaint.findById(complaint._id);
  assert.equal(updated.status, 'Resolved');
  assert.ok(updated.resolvedAt, 'resolvedAt must be stored for the analytics');
});

test('student reopens the complaint, then closes it again', async () => {
  const reopen = await student.post(`/complaints/${createdTicket}/confirm`, {
    form: { action: 'reopen' },
  });
  assert.equal(reopen.status, 302);
  let complaint = await Complaint.findOne({ ticketId: createdTicket });
  assert.equal(complaint.status, 'In Progress');

  // put it back into Resolved so it can be closed
  await staff.patch(`/complaints/${complaint._id}/status`, { form: { status: 'Resolved' } });

  const close = await student.post(`/complaints/${createdTicket}/confirm`, {
    form: { action: 'close' },
  });
  assert.equal(close.status, 302);
  complaint = await Complaint.findOne({ ticketId: createdTicket });
  assert.equal(complaint.status, 'Closed');
  assert.ok(complaint.closedAt);
});

test('student leaves feedback after closing', async () => {
  const response = await student.post(`/complaints/${createdTicket}/feedback`, {
    form: { rating: '5', comment: 'Fixed the same day, great work.' },
  });
  assert.equal(response.status, 302);

  const stored = await Feedback.find({ rating: 5 });
  assert.ok(stored.length >= 1, 'feedback should be stored');
});

test('comments are stored and shown on the page', async () => {
  const response = await student.post(`/complaints/${createdTicket}/comments`, {
    form: { body: 'Thanks for the quick fix!' },
  });
  assert.equal(response.status, 302);

  const comment = await Comment.findOne({ body: 'Thanks for the quick fix!' });
  assert.ok(comment, 'comment document should exist');
  assert.equal(comment.type, 'comment');
});

test('admin can search complaints', async () => {
  const response = await admin.get('/admin/complaints?search=tube light');
  assert.equal(response.status, 200);
  // createdTicket is a plain string, so wrap it in a RegExp (assert.match
  // treats a string second argument as a REGEX SOURCE, not a literal).
  assert.match(response.text, new RegExp(createdTicket));
});

test('admin can filter by status and priority', async () => {
  const byStatus = await admin.get('/admin/complaints?status=Closed');
  assert.equal(byStatus.status, 200);

  const byPriority = await admin.get('/admin/complaints?priority=Urgent&sort=priority');
  assert.equal(byPriority.status, 200);
});

test('pagination returns page 2 without errors', async () => {
  const response = await admin.get('/admin/complaints?page=2');
  assert.equal(response.status, 200);

  const firstPage = await admin.get('/admin/complaints?page=1');
  assert.equal(firstPage.status, 200);
});

test('GET /api/complaints returns JSON with pagination info', async () => {
  const response = await admin.get('/api/complaints?page=1');
  assert.equal(response.status, 200);
  assert.equal(response.json.success, true);
  assert.ok(Array.isArray(response.json.data));
  assert.ok(response.json.page >= 1);
  assert.ok(response.json.totalItems >= 1);
});

test('POST /api/complaints creates a complaint as JSON', async () => {
  const response = await student.post('/api/complaints', {
    json: {
      title: 'API created complaint',
      description: 'Created through the REST API during tests.',
      category: 'Library',
      location: 'Library, 2nd floor',
      priority: 'Low',
    },
  });

  assert.equal(response.status, 201);
  assert.equal(response.json.success, true);
  assert.match(response.json.data.ticketId, /^CF-\d+$/);
});

test('POST /api/complaints with bad data returns 400', async () => {
  const response = await student.post('/api/complaints', {
    json: { title: '', description: '', category: 'Nope', location: '' },
  });
  assert.equal(response.status, 400);
  assert.equal(response.json.success, false);
});

test('student cannot PATCH a complaint through the API (403)', async () => {
  const complaint = await Complaint.findOne({ ticketId: createdTicket });
  const response = await student.patch(`/api/complaints/${complaint._id}`, {
    json: { status: 'Closed' },
  });
  assert.equal(response.status, 403);
});

test('admin updates a complaint through the API', async () => {
  const complaint = await Complaint.findOne({ ticketId: createdTicket });
  const response = await admin.patch(`/api/complaints/${complaint._id}`, {
    json: { priority: 'Medium' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.data.priority, 'Medium');
});

test('DELETE /api/complaints is admin only', async () => {
  const complaint = await Complaint.findOne({ ticketId: createdTicket });

  const forbidden = await student.delete(`/api/complaints/${complaint._id}`);
  assert.equal(forbidden.status, 403);

  const allowed = await admin.delete(`/api/complaints/${complaint._id}`);
  assert.equal(allowed.status, 200);

  const gone = await Complaint.findById(complaint._id);
  assert.equal(gone, null);
});

test('logout destroys the session', async () => {
  const logout = await student.post('/auth/logout');
  assert.equal(logout.status, 302);

  const dashboard = await student.get('/student');
  assert.equal(dashboard.status, 302);
  assert.match(dashboard.location, /\/auth\/login/);
});

test('unknown routes return 404', async () => {
  const response = await admin.get('/this-page-does-not-exist');
  assert.equal(response.status, 404);
});
