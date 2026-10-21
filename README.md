# CampusFlow — College Operations & Complaint Management System

A full-stack, server-rendered web application where college students report
campus problems (broken lights, Wi-Fi, hostel issues…), maintenance staff
resolve them, and administrators track everything with live analytics.

Built with **Node.js + Express + MongoDB + EJS + Bootstrap 5** — no frontend
framework, no TypeScript, no build step. Every file is small, commented and
written so a beginner can explain it line by line in an interview.

---

## Live Demo

https://campusflow-y6o6.onrender.com/

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Project Overview](#2-project-overview)
3. [Features](#3-features)
4. [Tech Stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [Database Schema](#6-database-schema)
7. [Authentication & Authorization Flow](#7-authentication--authorization-flow)
8. [REST API Endpoints](#8-rest-api-endpoints)
9. [Roles & Permissions](#9-roles--permissions)
10. [Installation](#10-installation)
11. [Environment Variables](#11-environment-variables)
12. [Running the Project](#12-running-the-project)
13. [Seeding Demo Data](#13-seeding-demo-data)
14. [Testing](#14-testing)
15. [Deployment](#15-deployment)
16. [Screenshots](#16-screenshots)
17. [Future Improvements](#17-future-improvements)
18. [Interview Talking Points](#18-interview-talking-points)
19. [Suggested Git History](#19-suggested-git-history)
20. [Project Structure](#20-project-structure)

---

## 1. Problem Statement

College campuses handle student complaints over WhatsApp groups, phone calls and
paper registers. Problems:

- **Nothing is tracked.** Nobody knows how many complaints are open or who
  owns them.
- **No accountability.** A complaint is "reported" but never followed up, so
  it stays unresolved for weeks.
- **Duplicates.** Fifty students report the same broken fan in the same hall.
- **No data.** The administration cannot see *which* department is slow or
  *which* building breaks most often.

**CampusFlow solves this** by giving every complaint a unique ticket
(`CF-1042`), a status workflow, an owner, a deadline-based escalation, and a
dashboard that turns the data into decisions.

---

## 2. Project Overview

| Who           | What they can do                                                                  |
| ------------- | --------------------------------------------------------------------------------- |
| **Student**   | Register, submit complaints with photo proof, track status, comment, rate the fix |
| **Staff**     | See complaints assigned to their department, accept / progress / resolve them     |
| **Admin**     | Assign staff, change priority, manage users, view analytics, read all feedback    |
| **Guest**     | Read the landing page, register or log in                                         |

Everything is **server-rendered**: Express renders EJS templates and sends
complete HTML. Progressive enhancement (Bootstrap + a little vanilla JS) adds
duplicate detection, live search hints and Chart.js graphs.

The whole request cycle in one line:

```
Browser → middleware (session, auth, validation) → route → controller → Mongoose → MongoDB
        ←            EJS HTML / JSON            ←
```

---

## 3. Features

### Authentication & security
- Register / login / logout with **bcrypt** password hashing (`select: false` so hashes never leak)
- Session-based auth stored in **MongoDB** (`connect-mongo`) so logins survive restarts
- Session regeneration on login (defends against session fixation)
- Role-based authorization middleware (`student | staff | admin`)
- Server-side validation with **express-validator** (client-side `required` is only a convenience)
- **Helmet** with an explicit Content-Security-Policy
- Uniform error messages ("Invalid email or password") → no user enumeration

### Complaint lifecycle
- Unique human-friendly ticket IDs `CF-1001`, `CF-1002` … from an **atomic counter**
- Workflow: `Submitted → Assigned → In Progress → Resolved → Closed` (with reopen)
- Allowed transitions differ per role (student can only close/reopen their own)
- **Duplicate detection**: before creating, similar open complaints (same location + category) are shown; the user must confirm
- Photo upload with **Multer** (2 MB, images only, random filenames)
- Priority (`Low/Medium/High/Urgent`) with a numeric `priorityRank` kept in sync by model hooks
- **Auto-escalation**: High/Urgent complaints still open after 48 h are flagged and logged in the timeline
- Full **activity timeline** (comments + automatic activity entries) on every complaint

### Lists, search & pagination
- One shared query builder (`utils/complaintQuery.js`) → identical search / filter / sort / pagination on all three list pages
- Search across ticket id, title, description and location (regex is escaped)
- Filters: status, category, priority, escalated, assigned-to
- Ellipsis pagination bar (`1 … 4 5 [6] 7 8 … 20`)

### Analytics (admin)
- Doughnut: complaints per category
- Bar: complaints per status
- Line: complaints per month (last 6 months, missing months filled with 0)
- Table: average resolution hours per category
- KPI cards: average resolution days, average rating, open / resolved / escalated counts
- All numbers come from **MongoDB aggregation pipelines**, rendered with **Chart.js**

### Extras
- Feedback with 1–5 star rating after closing (one per complaint, unique index)
- Admin user management: create staff accounts, change roles, activate/deactivate
- Flash messages, empty states, 404 / 403 / 500 error pages
- Seed script with realistic fictional data
- 34 end-to-end tests running against a **separate test database**

---

## 4. Tech Stack

| Layer            | Choice                | Why this one                                              |
| ---------------- | --------------------- | --------------------------------------------------------- |
| Runtime          | Node.js               | One language across the stack, huge ecosystem             |
| Web framework    | Express 5             | Minimal, middleware-based, the industry default           |
| Database         | MongoDB + Mongoose 9  | Flexible documents fit complaints with embedded timelines |
| Template engine  | EJS                   | Plain HTML + `<% %>` — easiest SSR to read                |
| CSS framework    | Bootstrap 5 (vendored)| Responsive UI without a build step or external CDN        |
| Charts           | Chart.js (vendored)   | Canvas charts from plain JSON                             |
| Sessions         | express-session       | Server-side sessions, cookie holds only the session id    |
| Session store    | connect-mongo         | Sessions live in the DB → survive restarts                |
| Password hashing | bcryptjs              | Salted, slow-by-design hashing (pure JS, no build tools)  |
| Validation       | express-validator     | Declarative rules right in the route                      |
| File uploads     | multer                | The standard multipart parser for Express                 |
| Security         | helmet                | Sets ~15 safe HTTP headers for us                         |
| Method spoofing  | method-override       | HTML forms can send PATCH/DELETE                          |
| Tests            | node:test             | Built-in test runner — zero extra dependencies            |
| Env config       | dotenv                | Keeps secrets out of the source code                      |

**Deliberately NOT used:** React, TypeScript, Redux, GraphQL, Tailwind, Docker —
the goal is a project whose every line a fresher can explain.

---

## 5. Architecture

 MVC (Model–View–Controller) with a thin service/util layer:

```
Browser request
     │
     ▼
┌──────────────────────────── app.js ────────────────────────────┐
│ urlencoded → json → method-override → static → helmet          │
│ → session → flash → loadUser → viewGlobals                     │
└────────────────────────────────────────────────────────────────┘
     │
     ▼
 routes/     "which URL goes where?"  (+ one-line role guards)
     │
     ▼
 controllers/ "what should happen?"   (validation, redirects, renders)
     │
     ├──► models/       Mongoose schemas, hooks, indexes, enums
     ├──► services/     background jobs (escalation)
     ├──► utils/        pure helpers (query builder, pagination)
     └──► middleware/   auth, roles, validation, uploads, errors
     │
     ▼
 views/      EJS templates + partials (server-rendered HTML)
```

**Rules of thumb used here**

- `app.js` only *wires* things — business logic never lives in it.
- Controllers never write raw SQL/Mongo queries for common lists: they call `buildComplaintQuery()`.
- Views never decide permissions — middleware and controllers do.
- Route files are short: `router.use(ensureLoggedIn, requireRole('admin'))` protects a whole section in one line.

**Middleware order matters** (a classic interview question):

1. body parsers — before method-override, because it reads `req.body._method`
2. static files — cheap responses first
3. helmet — headers on every response
4. session — must exist before anything reads `req.user`
5. `loadUser` → `viewGlobals` — every route may need the current user
6. routes
7. `notFound` → `errorHandler` — always last

---

## 6. Database Schema

### `users`
| Field        | Type    | Notes                                              |
| ------------ | ------- | -------------------------------------------------- |
| name         | String  | required                                            |
| email        | String  | unique index, lowercased                           |
| password     | String  | bcrypt hash, `select: false`, min 6 chars          |
| role         | String  | enum `student \| staff \| admin`                   |
| studentId    | String  | student only (`21CS0001`)                          |
| department   | String  | student = course department, staff = work department |
| year         | String  | student only (`1st` … `4th`)                       |
| jobTitle     | String  | staff only (`Electrician`)                         |
| isActive     | Boolean | admin can deactivate → force logout                |
| timestamps   | —       | `createdAt`, `updatedAt`                           |

Hooks: `pre('save')` hashes the password only when it changed;
`comparePassword()` uses `bcrypt.compare`; `toJSON()` strips the hash.

### `complaints`
| Field        | Type     | Notes                                             |
| ------------ | -------- | ------------------------------------------------- |
| ticketId     | String   | unique `CF-1042`, from the atomic counter         |
| title        | String   | max 120                                           |
| description  | String   | max 2000                                          |
| category     | String   | enum (Electrical, Internet/Wi-Fi, Hostel, …)      |
| location     | String   | free text, e.g. "Block A, Lecture Hall 4"         |
| priority     | String   | enum `Low \| Medium \| High \| Urgent` (default Medium) |
| priorityRank | Number   | 1 = Urgent … 4 = Low, synced by model hooks       |
| status       | String   | enum `Submitted → Assigned → In Progress → Resolved → Closed` |
| reportedBy   | ObjectId | ref `users`                                       |
| assignedTo   | ObjectId | ref `users`, `null` = unassigned                  |
| imageUrl     | String   | `/uploads/1712-abc.png`                           |
| isEscalated  | Boolean  | set by the escalation service                     |
| resolvedAt / closedAt / escalatedAt | Date | drive the analytics                 |
| timestamps   | —        | `createdAt`, `updatedAt`                          |

Indexes: `{status, createdAt}`, `{reportedBy, createdAt}`,
`{assignedTo, status}`, `{location, category, status}` (duplicate detection).

### `comments` — the timeline
`complaint` (indexed), `author` (nullable), `authorName` (denormalised so a
deleted account still shows a name), `body`, `type: 'comment' | 'activity'`.
Comments live in their own collection so complaint documents stay small and
each timeline can be paginated independently.

### `feedback`
`complaint` (**unique** → one rating per complaint), `student`, `rating` 1–5,
`comment`. Own collection so the analytics page can aggregate ratings alone.

### `counters`
`{ _id: 'complaintTicket', seq: 1000 }` — `findOneAndUpdate({$inc:{seq:1}},
{upsert, returnDocument:'after'})` gives every complaint a unique number even
when two requests arrive at the same instant.

---

## 7. Authentication & Authorization Flow

```
POST /auth/login
   → express-validator (400 if the input is invalid)
   → User.findOne({email}).select('+password')      ← password is select:false
   → bcrypt.compare(plain, hash)                     ← same error for wrong
   → req.session.regenerate()  (anti session-fixation)   email and password
   → req.session.userId = user._id                   ← only the id is stored
   → redirect /student | /staff | /admin
```

On every later request:

```
loadUser():  session.userId → User.findById() → req.user + res.locals.currentUser
             (deactivated or deleted account? destroy the session → forced logout)
requireRole('admin'):  not logged in → 401 JSON / redirect to login
                       wrong role    → 403 page
```

Why store only the **id** in the session? The user document is re-read on each
request, so an admin deactivating an account takes effect on the *next* request
instead of after a token expiry.

**401 vs 403 vs 302** (interview favourite):
- `302 → /auth/login` — a browser with no session (send it to the login page)
- `401` — an API client with no session (JSON clients cannot "see" a redirect)
- `403` — the requester is authenticated, but not allowed on this route

---

## 8. REST API Endpoints

All under `/api`, all JSON, all protected by the **same session cookie** the
HTML pages use (one auth system, not two).

| Method   | Endpoint                     | Role          | Purpose                                  |
| -------- | ---------------------------- | ------------- | ---------------------------------------- |
| `GET`    | `/api/complaints`            | any logged-in | List: `?search=&status=&category=&priority=&sort=&page=` |
| `GET`    | `/api/complaints/similar`    | any logged-in | Duplicate check (`?category=&location=`) — registered **before** `/:id` |
| `GET`    | `/api/complaints/:id`        | any logged-in | One complaint (by `CF-1042` or ObjectId) |
| `POST`   | `/api/complaints`            | student       | Create (validated, 400 on bad data)      |
| `PATCH`  | `/api/complaints/:id`        | staff/admin   | Update status / priority / assignment    |
| `DELETE` | `/api/complaints/:id`        | admin         | Delete a complaint                       |
| `POST`   | `/api/complaints/:id/comments` | any logged-in | Add a comment                          |

Responses always follow the same envelope:

```jsonc
// 200
{ "success": true, "data": { ... }, "pagination": { "page": 1, "totalPages": 12, "total": 95 } }

// 4xx
{ "success": false, "message": "Validation failed", "errors": [{ "field": "title", "message": "Title is required." }] }
```

It can also be called from the browser console (a logged-in session is required first):

```js
const r = await fetch('/api/complaints?status=Open', { credentials: 'same-origin' });
(await r.json()).data;
```

---

## 9. Roles & Permissions

| Action                              | Student | Staff | Admin |
| ----------------------------------- | :-----: | :---: | :---: |
| Register / login                    |   ✅    |  ✅   |  ✅   |
| Create complaint (with photo)       |   ✅    |  ❌   |  ❌   |
| View **own** complaints             |   ✅    |  ❌   |  ✅   |
| View complaints assigned to them    |   ❌    |  ✅   |  ✅   |
| View **all** complaints             |   ❌    |  ❌   |  ✅   |
| Comment on a visible complaint      |   ✅    |  ✅   |  ✅   |
| Accept / progress / resolve         |   ❌    |  ✅   |  ✅   |
| Close or reopen own complaint       |   ✅    |  ❌   |  ❌   |
| Rate the resolution (1–5)           |   ✅    |  ❌   |  ❌   |
| Assign staff / change priority      |   ❌    |  ❌   |  ✅   |
| Manage users & roles                |   ❌    |  ❌   |  ✅   |
| Analytics & feedback overview       |   ❌    |  ❌   |  ✅   |
| Delete a complaint                  |   ❌    |  ❌   |  ✅   |

Enforced in **two** places: `requireRole()` at the route level, and ownership /
workflow checks inside the controller (a student may only close *their own*
complaint, and only from `Resolved`).

---

## 10. Installation

**Prerequisites:** Node.js 18+ and a running MongoDB (local `mongod` or an
Atlas URI).

```bash
# 1. get the code
git clone https://github.com/<username>/campusflow.git
cd campusflow

# 2. install dependencies
npm install

# 3. configure the environment
cp .env.example .env          # then edit the values (see below)

# 4. seed demo data (creates 14 users, 42 complaints, timelines, feedback)
npm run seed

# 5. start the server
npm start                     # → http://localhost:3000
```

No build step: EJS is rendered on the server, and Bootstrap + Chart.js are
vendored in `public/vendor/` so every page styles instantly (even offline).

---

## 11. Environment Variables

`.env` is **git-ignored**; `.env.example` documents every key.

| Key              | Example                                              | Purpose                                      |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| `PORT`           | `3000`                                               | Port the server listens on (host injects it in production) |
| `MONGODB_URI`    | `mongodb://127.0.0.1:27017/campusflow`               | Local DB; use `mongodb+srv://…` for Atlas     |
| `SESSION_SECRET` | `9f2c…` (long random string)                         | Signs the session cookie — **must never be committed** |
| `ESCALATION_HOURS` | `48`                                               | Open High/Urgent complaints older than this get escalated |
| `NODE_ENV`       | `development` / `production`                         | `production` enables secure cookies + trust proxy |

---

## 12. Running the Project

```bash
npm start        # normal start
npm run dev      # auto-restart on file changes (node --watch)
```

The app runs at <http://localhost:3000>; seeded accounts are:

| Role    | Email                  | Password    |
| ------- | ---------------------- | ----------- |
| Admin   | `admin@campusflow.edu` | `password123` |
| Staff   | `staff@campusflow.edu` | `password123` |
| Student | `rahul@campusflow.edu` | `password123` |

(Or click **Register** to create a new student account.)

---

## 13. Seeding Demo Data

```bash
npm run seed
```

**What it creates** (all fictional):

- 1 admin, 3 staff, 10 students — password for everyone is `password123`
- 42 complaints spread over the last 6 months, across all categories,
  priorities and statuses (some resolved, some escalated, some closed)
- ~180 timeline entries (creation, assignment, status changes, comments)
- 23 feedback entries with 1–5 star ratings
- The ticket counter, so new complaints continue at `CF-1043`

`npm run seed` **wipes those collections first**, so it must never be run
against data that matters. That is also why the tests use their own database
(`campusflow_test`).

---

## 14. Testing

```bash
npm test
# → 34 tests, 34 pass, ~2 s
```

- Framework: Node's built-in `node:test` — no test dependency to install.
- Each test drives the **real HTTP server** with `fetch()` and a cookie jar,
  exactly like a browser: request → middleware → controller → MongoDB → response.
- Runs on port **3100** against database **`campusflow_test`**, so the seeded
  dev data is untouched.
- Covers: registration/login/logout, 401/403/404 guards, the full complaint
  lifecycle (create → duplicate 409 → assign → priority → workflow → reopen →
  close → feedback → comments), search/filter/pagination, and every REST API
  endpoint including its error codes.

### Route smoke test - every route × every role

```bash
npm start        # terminal 1 - dev server on :3000
npm run smoke    # terminal 2 - 97 checks, exit 0 = all green
```

- [`scripts/smoke.sh`](scripts/smoke.sh) drives the **running dev server** over
  real HTTP (curl): every page as guest/student/staff/admin, the whole complaint
  lifecycle including the Multer image upload, admin user management, the REST
  API, the escalation job and the auth flows (302/400/401/403/404/409).
- It creates its own data and **deletes it again** (complaints through the API,
  the temporary user straight from the database), so the seed stays clean.
- Needs `curl` + bash (Git Bash on Windows).

Example:

```js
test('duplicate detection warns before creating a second complaint', async () => {
  const response = await student.post('/complaints', { form: { /* same location+category */ } });
  assert.equal(response.status, 409); // "conflict" — a similar issue exists
  assert.match(response.text, /similar issue/i);
});
```

---


## 15. Screenshots

These pages are captured after `npm run seed`, with the images saved into
`docs/screenshots/`:

| File                    | Page                                                     |
| ----------------------- | -------------------------------------------------------- |
| `landing.png`           | `/` — hero, feature cards, footer                        |
| `login.png` / `register.png` | auth pages with inline validation errors            |
| `student-dashboard.png` | `/student` — stat cards, recent complaints               |
| `new-complaint.png`     | `/complaints/new` — form + duplicate-warning modal |
| `complaint-detail.png`  | `/complaints/CF-1042` — timeline, comments, photo        |
| `staff-dashboard.png`   | `/staff` — assigned queue with status workflow buttons   |
| `admin-dashboard.png`   | `/admin` — KPI cards, escalated list, quick links        |
| `admin-complaints.png`  | `/admin/complaints` — search + filters + pagination      |
| `analytics.png`         | `/admin/analytics` — doughnut / bar / line charts        |
| `users.png`             | `/admin/users` — role & status management                |

Fastest way to capture them (Chrome → DevTools → `Cmd/Ctrl+Shift+P` →
"Capture full size screenshot"), or an agent can open the preview panel
and screenshot each route.

---

## 16. Future Improvements

1. **Image storage in the cloud** — uploads currently use the local disk, which
   is wiped on redeploy. Move to S3 / Cloudinary with signed upload URLs.
2. **Rate limiting + CSRF tokens** — add `express-rate-limit` on `/auth` and
   `csurf`-style double-submit tokens for form POSTs (sessions are already
   SameSite=Lax).
3. **Email / in-app notifications** — send a mail when a complaint is assigned
   or resolved (Nodemailer or a provider API).
4. **Real job queue** — move the escalation `setInterval` to a scheduled worker
   (BullMQ / Render Cron) so it runs exactly once across multiple instances.
5. **WebSockets for live updates** — Socket.IO so the admin dashboard refreshes
   without polling.
6. **Refresh token / OAuth login** — Google sign-in for the college domain.
7. **Elasticsearch for search** — text search across thousands of complaints
   with typo tolerance.
8. **Offline-first PWA** — service worker so students can file complaints with
   no network.
9. **Accessibility & i18n** — ARIA audit and a second language.
10. **Observability** — structured logs (pino) + a `/health` endpoint for the
    host's uptime check.

---



## 17. Project Structure

```
campusflow/
├── app.js                    # wires middleware → routes → error handlers (kept tiny)
├── config/
│   └── db.js                 # Mongoose connection
├── models/                   # schemas, hooks, indexes, enums
│   ├── User.js  Complaint.js  Comment.js  Feedback.js  Counter.js
├── middleware/               # auth, roles, validation, uploads, errors, view helpers
│   ├── auth.js  role.js  validators.js  upload.js  errorHandler.js  context.js
├── controllers/              # one file per area
│   ├── homeController.js  authController.js  complaintController.js
│   ├── studentController.js  staffController.js  adminController.js  apiController.js
├── routes/                   # URL → controller (+ one-line role guards)
│   ├── authRoutes.js  complaintRoutes.js  studentRoutes.js
│   ├── staffRoutes.js  adminRoutes.js  apiRoutes.js
├── views/                    # EJS templates
│   ├── partials/             # head, navbar, sidebar, statCard, complaintTable, …
│   ├── auth/  student/  staff/  admin/  complaints/  errors/
├── services/
│   └── escalationService.js  # background job: flag complaints open > 48 h
├── utils/
│   └── complaintQuery.js     # shared search / filter / sort / pagination builder
├── public/                   # css, js (vanilla progressive enhancement)
├── scripts/seed.js           # realistic demo data
├── tests/app.test.js         # 34 end-to-end tests (own DB, own port)
├── uploads/                  # user photos (git-ignored)
├── DEPLOYMENT.md  INTERVIEW_PREP.md  CODE_EXPLANATIONS.md
└── .env.example              # template for .env — .env is never committed
```

---

