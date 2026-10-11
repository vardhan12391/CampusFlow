/**
 * controllers/complaintController.js
 * Everything that happens to a SINGLE complaint lives here:
 * create -> view -> comment -> assign -> change status -> confirm -> feedback.
 *
 * Shared helpers at the top are reused by the REST API controllers, so the
 * same rules apply whether the request comes from a form or from fetch().
 */
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const Feedback = require('../models/Feedback');
const Counter = require('../models/Counter');
const User = require('../models/User');
const { HttpError } = require('../middleware/errorHandler');
const { escapeRegex } = require('../utils/complaintQuery');


/** Loads a complaint by ticket id (CF-1042) OR by the MongoDB _id. */
async function findComplaintById(id) {
  const conditions = [{ ticketId: String(id).toUpperCase() }];
  if (mongoose.isValidObjectId(id)) conditions.push({ _id: id });

  const complaint = await Complaint.findOne({ $or: conditions })
    .populate('reportedBy', 'name email role department studentId')
    .populate('assignedTo', 'name email role jobTitle department');

  if (!complaint) throw new HttpError(404, 'Complaint not found.');
  return complaint;
}

/** Adds one automatic entry to the activity timeline. */
function logActivity(complaintId, author, body) {
  return Comment.create({
    complaint: complaintId,
    author: author ? author._id : null,
    authorName: author ? author.name : 'System',
    type: 'activity',
    body,
  });
}

/** Students see only their own complaints; staff and admin see everything. */
function canView(user, complaint) {
  if (user.role === 'staff' || user.role === 'admin') return true;
  const reporterId = complaint.reportedBy._id || complaint.reportedBy;
  return String(reporterId) === String(user._id);
}

/** The reporter is always the student who created the complaint. */
function isReporter(user, complaint) {
  const reporterId = complaint.reportedBy._id || complaint.reportedBy;
  return String(reporterId) === String(user._id);
}

/**
 * Which statuses may THIS user move THIS complaint to?
 * The workflow is the single source of truth for the whole application:
 *
 *   Submitted --(staff accepts / admin assigns)--> Assigned
 *   Assigned  --(staff starts work)-------------> In Progress
 *   Assigned / In Progress --(staff finishes)---> Resolved
 *   Resolved  --(student confirms)--------------> Closed
 *   Resolved  --(student rejects)---------------> In Progress   (reopen)
 *
 * Staff only ever get FORWARD steps in this table; the view additionally
 * lists the current status as a pre-selected (no-op) option, so the
 * "Change status" dropdown always shows where the ticket stands plus every
 * legal next move - never a single option and never a backward one.
 */
function getAllowedStatuses(user, complaint) {
  if (user.role === 'admin') {
    return Complaint.STATUSES;
  }

  if (user.role === 'staff') {
    const isAssignedToMe =
      complaint.assignedTo &&
      String(complaint.assignedTo._id || complaint.assignedTo) === String(user._id);
    if (!isAssignedToMe) return []; // cannot touch complaints assigned to someone else

    // Staff drive their OWN queue, forward only: start the work, finish it.
    // "Submitted" belongs to the accept flow, "Closed" to the student/admin
    // (smoke test asserts staff cannot close), and moving BACK to "Assigned"
    // makes no sense - the complaint is already assigned to them.
    const transitions = {
      Submitted: [],
      Assigned: ['In Progress', 'Resolved'],
      'In Progress': ['Resolved'],
      Resolved: [],
      Closed: [],
    };
    return transitions[complaint.status] || [];
  }

  return []; // students use the Confirm / Reopen / Feedback buttons
}

/**
 * Finds OPEN complaints in the same place + category.
 * This is the whole "similar issue" feature - a normal MongoDB query,
 * no external services and no background jobs involved.
 */
async function findSimilarComplaints(category, location, excludeComplaintId = null) {
  if (!category || !location || !location.trim()) return [];

  const filter = {
    category,
    location: new RegExp(`^${escapeRegex(location.trim())}$`, 'i'), // same place, any case
    status: { $nin: ['Resolved', 'Closed'] }, // only complaints that are still open
  };
  if (excludeComplaintId) filter._id = { $ne: excludeComplaintId };

  return Complaint.find(filter)
    .select('ticketId title status createdAt')
    .sort({ createdAt: -1 })
    .limit(5);
}

/**
 * Creates a complaint document + its first activity entry.
 * Reused by the HTML form and by POST /api/complaints.
 */
async function saveComplaintRecord({ data, user, imageUrl = null }) {
  const sequence = await Counter.nextTicketNumber(); // CF-1001, CF-1002, ...

  const complaint = await Complaint.create({
    ticketId: `CF-${sequence}`,
    title: data.title,
    description: data.description,
    category: data.category,
    location: data.location,
    priority: data.priority || 'Medium',
    reportedBy: user._id,
    imageUrl: imageUrl || null,
  });

  await logActivity(complaint._id, user, `Complaint created by ${user.name}.`);
  return complaint;
}


function newComplaintForm(req, res) {
  res.render('student/newComplaint', {
    title: 'Report an issue',
    old: {},
    similarComplaints: [],
    notice: null,
  });
}

// POST /complaints
async function createComplaint(req, res, next) {
  try {
    // 1. server-side validation (never trust the browser)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.locals.errors = errors.array();
      return res.status(400).render('student/newComplaint', {
        title: 'Report an issue',
        old: req.body,
        similarComplaints: [],
        notice: null,
      });
    }

    // 2. duplicate check - let the student decide, never block them silently
    const similarComplaints = await findSimilarComplaints(req.body.category, req.body.location);
    if (similarComplaints.length > 0 && req.body.confirmDuplicate !== 'yes') {
      return res.status(409).render('student/newComplaint', {
        title: 'Report an issue',
        old: req.body,
        similarComplaints,
        notice: 'A similar issue may already exist. View it instead, or create a new complaint anyway.',
      });
    }

    // 3. save (Multer already wrote the image into /uploads)
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const complaint = await saveComplaintRecord({ data: req.body, user: req.user, imageUrl });

    req.session.success = `Complaint ${complaint.ticketId} has been submitted.`;
    return res.redirect(`/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}


// GET /complaints/:id
async function showComplaint(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (!canView(req.user, complaint)) {
      throw new HttpError(403, 'You are not allowed to view this complaint.');
    }

    const comments = await Comment.find({ complaint: complaint._id })
      .sort({ createdAt: 1 }) // timeline in chronological order
      .populate('author', 'name role');

    const feedback = await Feedback.findOne({ complaint: complaint._id }).populate(
      'student',
      'name'
    );

    // the admin assign dropdown needs the staff list
    const staffMembers =
      req.user.role === 'admin'
        ? await User.find({ role: 'staff', isActive: true })
            .sort({ name: 1 })
            .select('name jobTitle department')
        : [];

    res.render('complaints/show', {
      title: `${complaint.ticketId} - ${complaint.title}`,
      complaint,
      comments,
      feedback,
      staffMembers,
      allowedStatuses: getAllowedStatuses(req.user, complaint),
      isReporter: isReporter(req.user, complaint),
    });
  } catch (error) {
    return next(error);
  }
}

// POST /complaints/:id/comments
async function addComment(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!canView(req.user, complaint)) {
      throw new HttpError(403, 'You are not allowed to comment on this complaint.');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/complaints/${complaint.ticketId}`);
    }

    await Comment.create({
      complaint: complaint._id,
      author: req.user._id,
      authorName: req.user.name,
      type: 'comment',
      body: req.body.body,
    });

    req.session.success = 'Comment added.';
    return res.redirect(`/complaints/${complaint.ticketId}#timeline`);
  } catch (error) {
    return next(error);
  }
}


// POST /complaints/:id/accept  - staff takes ownership of an unassigned ticket
async function acceptComplaint(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (complaint.assignedTo) {
      throw new HttpError(400, 'This complaint is already assigned.');
    }
    if (complaint.status !== 'Submitted') {
      throw new HttpError(400, 'Only complaints in "Submitted" status can be accepted.');
    }

    complaint.assignedTo = req.user._id;
    complaint.status = 'Assigned';
    await complaint.save();

    await logActivity(complaint._id, req.user, `${req.user.name} accepted this complaint.`);

    req.session.success = `You accepted ${complaint.ticketId}.`;
    return res.redirect(`/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}

// PATCH /complaints/:id/status
async function changeStatus(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);
    const newStatus = req.body.status;

    if (!Complaint.STATUSES.includes(newStatus)) {
      throw new HttpError(400, 'Invalid status.');
    }

    const oldStatus = complaint.status;

    // Re-selecting the current status (the dropdown pre-selects it) is a
    // no-op: acknowledge it instead of logging a pointless "X -> X" entry.
    // Runs BEFORE the transition table - forward steps never contain the
    // current status - but only for people who may view the complaint, so
    // anyone else still gets the 403.
    if (newStatus === oldStatus && canView(req.user, complaint)) {
      req.session.success = `${complaint.ticketId} is already "${newStatus}".`;
      return res.redirect(`/complaints/${complaint.ticketId}`);
    }

    const allowed = getAllowedStatuses(req.user, complaint);
    if (!allowed.includes(newStatus)) {
      throw new HttpError(403, `You cannot move this complaint to "${newStatus}".`);
    }

    complaint.status = newStatus;

    // Timestamps feed the "average resolution time" analytics.
    complaint.resolvedAt = newStatus === 'Resolved' ? new Date() : null;
    if (newStatus === 'Closed') complaint.closedAt = new Date();

    await complaint.save();
    await logActivity(
      complaint._id,
      req.user,
      `Status changed from ${oldStatus} to ${newStatus} by ${req.user.name}.`
    );

    req.session.success = `${complaint.ticketId} is now "${newStatus}".`;
    return res.redirect(`/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}


// PATCH /complaints/:id/assign
async function assignComplaint(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    const staffMember = await User.findById(req.body.assignedTo).catch(() => null);
    if (!staffMember || staffMember.role !== 'staff') {
      throw new HttpError(400, 'Choose a valid staff member.');
    }

    const previousStaff = complaint.assignedTo;
    complaint.assignedTo = staffMember._id;
    if (complaint.status === 'Submitted') complaint.status = 'Assigned';
    await complaint.save();

    const action = previousStaff ? 'Reassigned' : 'Assigned';
    await logActivity(
      complaint._id,
      req.user,
      `${action} to ${staffMember.name} by ${req.user.name}.`
    );

    req.session.success = `${complaint.ticketId} assigned to ${staffMember.name}.`;
    return res.redirect(req.body.redirect || `/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}

// PATCH /complaints/:id/priority
async function updatePriority(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (!Complaint.PRIORITIES.includes(req.body.priority)) {
      throw new HttpError(400, 'Invalid priority.');
    }

    const oldPriority = complaint.priority;
    complaint.priority = req.body.priority; // priorityRank is synced by the model hook
    await complaint.save();

    await logActivity(
      complaint._id,
      req.user,
      `Priority changed from ${oldPriority} to ${complaint.priority} by ${req.user.name}.`
    );

    req.session.success = `Priority of ${complaint.ticketId} set to ${complaint.priority}.`;
    return res.redirect(req.body.redirect || `/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}


// POST /complaints/:id/confirm   body: action = close | reopen
async function confirmResolution(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (!isReporter(req.user, complaint)) {
      throw new HttpError(403, 'Only the student who reported this complaint can confirm it.');
    }
    if (complaint.status !== 'Resolved') {
      throw new HttpError(400, 'This complaint is not waiting for confirmation.');
    }

    if (req.body.action === 'close') {
      complaint.status = 'Closed';
      complaint.closedAt = new Date();
      await complaint.save();
      await logActivity(complaint._id, req.user, 'Student confirmed the issue is resolved.');
      req.session.success = 'Great! Complaint closed - please share your feedback below.';
    } else if (req.body.action === 'reopen') {
      complaint.status = 'In Progress';
      complaint.resolvedAt = null; // it is open again, so the clock restarts
      complaint.closedAt = null;
      await complaint.save();
      await logActivity(complaint._id, req.user, 'Student reopened the complaint - issue not fixed.');
      req.session.success = 'Complaint reopened. Staff has been notified.';
    } else {
      throw new HttpError(400, 'Unknown action.');
    }

    return res.redirect(`/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}

// POST /complaints/:id/feedback
async function submitFeedback(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (!isReporter(req.user, complaint)) {
      throw new HttpError(403, 'Only the reporter can leave feedback.');
    }
    if (!['Resolved', 'Closed'].includes(complaint.status)) {
      throw new HttpError(400, 'Feedback can be given after the complaint is resolved.');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array()[0].msg;
      return res.redirect(`/complaints/${complaint.ticketId}`);
    }

    // upsert = "insert if missing, otherwise update" (one feedback per complaint)
    await Feedback.findOneAndUpdate(
      { complaint: complaint._id },
      {
        complaint: complaint._id,
        student: req.user._id,
        rating: Number(req.body.rating),
        comment: (req.body.comment || '').trim(),
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await logActivity(
      complaint._id,
      req.user,
      `Student rated the resolution ${req.body.rating}/5.`
    );

    req.session.success = 'Thanks for your feedback!';
    return res.redirect(`/complaints/${complaint.ticketId}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  newComplaintForm,
  createComplaint,
  showComplaint,
  addComment,
  acceptComplaint,
  changeStatus,
  assignComplaint,
  updatePriority,
  confirmResolution,
  submitFeedback,
  // reused by the REST API and by the duplicate-detection endpoint
  findComplaintById,
  findSimilarComplaints,
  saveComplaintRecord,
  logActivity,
  canView,
  isReporter,
  getAllowedStatuses,
};
