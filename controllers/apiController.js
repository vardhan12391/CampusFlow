/**
 * controllers/apiController.js
 * --------------------------------------------------------------------------
 * The JSON / REST side of CampusFlow.
 *
 * The HTML pages and these endpoints share the SAME models, middleware and
 * business rules - only the response format differs:
 *
 *   HTML route  ->  res.render('view', data)      (server renders the page)
 *   API route   ->  res.status(201).json(data)    (client renders the page)
 *
 * Status codes used here:
 *   200 OK           request succeeded
 *   201 Created      a new resource was created
 *   400 Bad Request  the client sent invalid data
 *   401 Unauthorized nobody is logged in
 *   403 Forbidden    logged in, but not allowed
 *   404 Not Found    the resource does not exist
 *   500 Server Error something broke on our side
 */
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');

const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { HttpError } = require('../middleware/errorHandler');
const { buildComplaintQuery, getPaginationPages } = require('../utils/complaintQuery');
const {
  findComplaintById,
  findSimilarComplaints,
  saveComplaintRecord,
  logActivity,
  canView,
  getAllowedStatuses,
} = require('./complaintController');

// GET /api/complaints  (search, filter, sort, paginate)
async function list(req, res, next) {
  try {
    // A student calling the API still only sees their own complaints.
    const baseFilter = req.user.role === 'student' ? { reportedBy: req.user._id } : {};
    const { filter, sort, page, limit, skip } = buildComplaintQuery(req.query, { baseFilter });

    const totalItems = await Complaint.countDocuments(filter);
    const complaints = await Complaint.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('reportedBy', 'name email')
      .populate('assignedTo', 'name jobTitle');

    res.status(200).json({
      success: true,
      count: complaints.length,
      totalItems,
      page,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      paginationPages: getPaginationPages(page, Math.max(Math.ceil(totalItems / limit), 1)),
      data: complaints,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/complaints/similar?category=...&location=...
// Used by the "similar issue" check while the student is still typing.
async function similar(req, res, next) {
  try {
    const matches = await findSimilarComplaints(req.query.category, req.query.location);
    res.status(200).json({ success: true, count: matches.length, data: matches });
  } catch (error) {
    next(error);
  }
}

// GET /api/complaints/:id
async function show(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);
    if (!canView(req.user, complaint)) {
      throw new HttpError(403, 'You are not allowed to view this complaint.');
    }
    res.status(200).json({ success: true, data: complaint });
  } catch (error) {
    next(error);
  }
}

// POST /api/complaints   body: { title, description, category, location, priority }
async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Students only: the API mirrors the permission rules of the HTML form.
    if (req.user.role !== 'student') {
      throw new HttpError(403, 'Only students can report new issues.');
    }

    const complaint = await saveComplaintRecord({ data: req.body, user: req.user });

    // 201 + Location header = "your resource was created, here is where it lives"
    res.status(201).location(`/api/complaints/${complaint.ticketId}`).json({
      success: true,
      message: 'Complaint created.',
      data: complaint,
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/complaints/:id   body: { status?, priority?, assignedTo? }
async function update(req, res, next) {
  try {
    const complaint = await findComplaintById(req.params.id);

    if (req.user.role === 'student') {
      throw new HttpError(403, 'Students cannot update complaints directly.');
    }

    const changes = [];

    // --- status (staff + admin, using the same transition table as the UI) ---
    if (req.body.status !== undefined) {
      const allowed = getAllowedStatuses(req.user, complaint);
      if (!allowed.includes(req.body.status)) {
        throw new HttpError(403, `You cannot move this complaint to "${req.body.status}".`);
      }
      complaint.status = req.body.status;
      complaint.resolvedAt = req.body.status === 'Resolved' ? new Date() : null;
      if (req.body.status === 'Closed') complaint.closedAt = new Date();
      changes.push(`status -> ${req.body.status}`);
    }

    // --- priority (admin only) ---
    if (req.body.priority !== undefined) {
      if (req.user.role !== 'admin') throw new HttpError(403, 'Only admins can change priority.');
      if (!Complaint.PRIORITIES.includes(req.body.priority)) {
        throw new HttpError(400, 'Invalid priority.');
      }
      complaint.priority = req.body.priority;
      changes.push(`priority -> ${req.body.priority}`);
    }

    // --- assignment (admin only) ---
    if (req.body.assignedTo !== undefined) {
      if (req.user.role !== 'admin') throw new HttpError(403, 'Only admins can assign complaints.');
      const staffMember = await User.findById(req.body.assignedTo);
      if (!staffMember || staffMember.role !== 'staff') {
        throw new HttpError(400, 'assignedTo must be a staff member.');
      }
      complaint.assignedTo = staffMember._id;
      if (complaint.status === 'Submitted') complaint.status = 'Assigned';
      changes.push(`assignedTo -> ${staffMember.name}`);
    }

    if (changes.length === 0) throw new HttpError(400, 'Nothing to update.');

    await complaint.save();
    await logActivity(complaint._id, req.user, `Updated via API by ${req.user.name}: ${changes.join(', ')}.`);

    const updated = await findComplaintById(complaint.ticketId);
    res.status(200).json({ success: true, message: 'Complaint updated.', data: updated });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/complaints/:id   (admin only)
async function remove(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      throw new HttpError(403, 'Only admins can delete complaints.');
    }

    const complaint = await findComplaintById(req.params.id);

    // clean up everything that points at this complaint
    await Comment.deleteMany({ complaint: complaint._id });
    await Feedback.deleteOne({ complaint: complaint._id });
    await Complaint.deleteOne({ _id: complaint._id });

    // and the uploaded image on disk (if any)
    if (complaint.imageUrl) {
      const imagePath = path.join(__dirname, '..', complaint.imageUrl.replace(/^\//, ''));
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    res.status(200).json({ success: true, message: `${complaint.ticketId} deleted.` });
  } catch (error) {
    next(error);
  }
}

// POST /api/complaints/:id/comments   body: { body: "text" }
async function addComment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const complaint = await findComplaintById(req.params.id);
    if (!canView(req.user, complaint)) {
      throw new HttpError(403, 'You are not allowed to comment on this complaint.');
    }

    const comment = await Comment.create({
      complaint: complaint._id,
      author: req.user._id,
      authorName: req.user.name,
      type: 'comment',
      body: req.body.body,
    });

    // The browser JS appends this object to the timeline - no page reload.
    res.status(201).json({
      success: true,
      data: {
        _id: comment._id,
        body: comment.body,
        type: comment.type,
        authorName: comment.authorName,
        createdAt: comment.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, similar, show, create, update, remove, addComment };
