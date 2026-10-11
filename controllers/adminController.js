/**
 * controllers/adminController.js
 * Everything the admin sees: overview dashboard, full complaint list,
 * user management, analytics and feedback.
 */
const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const { HttpError } = require('../middleware/errorHandler');
const { buildComplaintQuery, getPaginationPages } = require('../utils/complaintQuery');
const { runEscalationCheck } = require('../services/escalationService');

const OPEN_STATUSES = ['Submitted', 'Assigned', 'In Progress'];

/** Counts documents per status -> { Submitted: 3, Assigned: 1, ... } */
async function countByStatus(baseFilter = {}) {
  const rows = await Complaint.aggregate([
    { $match: baseFilter }, // 1. narrow down to the documents we care about
    { $group: { _id: '$status', count: { $sum: 1 } } }, // 2. one row per status
    { $project: { _id: 0, status: '$_id', count: 1 } }, // 3. rename _id -> status
  ]);

  const countsByStatus = {};
  Complaint.STATUSES.forEach((status) => {
    countsByStatus[status] = 0;
  });
  rows.forEach((row) => {
    countsByStatus[row.status] = row.count;
  });
  return countsByStatus;
}

async function dashboard(req, res, next) {
  try {
    // Run the escalation check when the dashboard opens so the admin always
    // sees fresh flags (the 15-minute interval in app.js does the same job).
    await runEscalationCheck();

    const countsByStatus = await countByStatus();
    const totalComplaints = Object.values(countsByStatus).reduce((sum, value) => sum + value, 0);

    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalStaff = await User.countDocuments({ role: 'staff' });

    const escalated = await Complaint.find({
      isEscalated: true,
      status: { $in: OPEN_STATUSES },
    })
      .populate('reportedBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ priorityRank: 1, createdAt: 1 })
      .limit(5);

    const recentComplaints = await Complaint.find()
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(6);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      countsByStatus,
      totalComplaints,
      totalUsers,
      totalStudents,
      totalStaff,
      escalated,
      recentComplaints,
    });
  } catch (error) {
    next(error);
  }
}

async function listComplaints(req, res, next) {
  try {
    const { filter, sort, page, limit, skip } = buildComplaintQuery(req.query);

    const totalItems = await Complaint.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    const complaints = await Complaint.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('reportedBy', 'name department')
      .populate('assignedTo', 'name jobTitle');

    // Staff members feed the "assign to" dropdown and the filter.
    const staffMembers = await User.find({ role: 'staff', isActive: true })
      .sort({ name: 1 })
      .select('name jobTitle department');

    res.render('admin/complaints', {
      title: 'All Complaints',
      complaints,
      staffMembers,
      totalItems,
      page,
      totalPages,
      paginationPages: getPaginationPages(page, totalPages),
    });
  } catch (error) {
    next(error);
  }
}


function validateNewUser(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) {
    errors.push({ path: 'name', msg: 'Name is required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '')) {
    errors.push({ path: 'email', msg: 'Enter a valid email address.' });
  }
  if (!body.password || body.password.length < 6) {
    errors.push({ path: 'password', msg: 'Password must be at least 6 characters.' });
  }
  if (!['student', 'staff', 'admin'].includes(body.role)) {
    errors.push({ path: 'role', msg: 'Choose a valid role.' });
  }
  if (!body.department || !body.department.trim()) {
    errors.push({ path: 'department', msg: 'Department is required.' });
  }
  return errors;
}

async function users(req, res, next) {
  try {
    const roleFilter = ['student', 'staff', 'admin'].includes(req.query.role)
      ? { role: req.query.role }
      : {};

    const usersList = await User.find(roleFilter)
      .sort({ role: 1, name: 1 })
      .limit(100);

    const counts = {
      all: await User.countDocuments(),
      student: await User.countDocuments({ role: 'student' }),
      staff: await User.countDocuments({ role: 'staff' }),
      admin: await User.countDocuments({ role: 'admin' }),
    };

    res.render('admin/users', {
      title: 'User Management',
      usersList,
      counts,
      selectedRole: req.query.role || '',
      old: {},
      errors: [],
    });
  } catch (error) {
    next(error);
  }
}

// POST /admin/users  (create a staff / admin / extra student account)
async function createUser(req, res, next) {
  try {
    const errors = validateNewUser(req.body);
    if (errors.length > 0) {
      res.locals.errors = errors;
      const usersList = await User.find().sort({ role: 1, name: 1 }).limit(100);
      return res.status(400).render('admin/users', {
        title: 'User Management',
        usersList,
        counts: {},
        selectedRole: '',
        old: req.body,
        errors,
      });
    }

    await User.create({
      name: req.body.name.trim(),
      email: req.body.email.trim().toLowerCase(),
      password: req.body.password,
      role: req.body.role,
      department: req.body.department.trim(),
      jobTitle: (req.body.jobTitle || '').trim(),
      studentId: (req.body.studentId || '').trim(),
      year: (req.body.year || '').trim(),
    });

    req.session.success = `Account created for ${req.body.name}.`;
    return res.redirect('/admin/users');
  } catch (error) {
    if (error.code === 11000) {
      req.session.error = 'An account with this email already exists.';
      return res.redirect('/admin/users');
    }
    return next(error);
  }
}

// PATCH /admin/users/:id/role
async function updateUserRole(req, res, next) {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) throw new HttpError(404, 'User not found.');

    if (String(targetUser._id) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot change your own role.');
    }
    if (!['student', 'staff', 'admin'].includes(req.body.role)) {
      throw new HttpError(400, 'Invalid role.');
    }

    targetUser.role = req.body.role;
    await targetUser.save();

    req.session.success = `${targetUser.name} is now ${targetUser.role}.`;
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
}

// PATCH /admin/users/:id/status   (activate / deactivate)
async function toggleUserStatus(req, res, next) {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) throw new HttpError(404, 'User not found.');

    if (String(targetUser._id) === String(req.user._id)) {
      throw new HttpError(400, 'You cannot deactivate your own account.');
    }

    targetUser.isActive = !targetUser.isActive;
    await targetUser.save();

    const state = targetUser.isActive ? 'activated' : 'deactivated';
    req.session.success = `${targetUser.name} ${state}.`;
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
}


async function analytics(req, res, next) {
  try {
    const byCategory = await Complaint.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, category: '$_id', count: 1 } },
    ]);

    const statusRows = await Complaint.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);
    const byStatus = Complaint.STATUSES.map((status) => ({
      status,
      count: (statusRows.find((row) => row.status === status) || {}).count || 0,
    }));

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    const monthRows = await Complaint.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // fill missing months with 0 so the line chart has no gaps
    const monthLabels = [];
    const monthCounts = [];
    for (let i = 0; i < 6; i += 1) {
      const date = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const found = monthRows.find((row) => row._id === key);
      monthLabels.push(date.toLocaleDateString('en-IN', { month: 'short' }));
      monthCounts.push(found ? found.count : 0);
    }

    const resolutionByCategory = await Complaint.aggregate([
      { $match: { resolvedAt: { $ne: null } } }, // only complaints that were resolved
      {
        $project: {
          // hours between creating and resolving
          category: 1,
          hours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
        },
      },
      { $group: { _id: '$category', avgHours: { $avg: '$hours' }, resolvedCount: { $sum: 1 } } },
      { $sort: { avgHours: 1 } }, // fastest category first
      { $project: { _id: 0, category: '$_id', avgHours: 1, resolvedCount: 1 } },
    ]);

    const overallResolution = await Complaint.aggregate([
      { $match: { resolvedAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgHours: {
            $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
          },
        },
      },
    ]);

    const ratingStats = await Feedback.aggregate([
      { $group: { _id: null, averageRating: { $avg: '$rating' }, total: { $sum: 1 } } },
    ]);

    const resolvedCount = await Complaint.countDocuments({ resolvedAt: { $ne: null } });
    const escalatedCount = await Complaint.countDocuments({ isEscalated: true });
    const openCount = await Complaint.countDocuments({ status: { $in: OPEN_STATUSES } });

    res.render('admin/analytics', {
      title: 'Analytics',
      byCategory,
      byStatus,
      monthLabels,
      monthCounts,
      resolutionByCategory,
      averageResolutionDays: overallResolution[0]
        ? (overallResolution[0].avgHours / 24).toFixed(1)
        : '0.0',
      averageRating: ratingStats[0] ? ratingStats[0].averageRating.toFixed(1) : '0.0',
      feedbackCount: ratingStats[0] ? ratingStats[0].total : 0,
      resolvedCount,
      escalatedCount,
      openCount,
    });
  } catch (error) {
    next(error);
  }
}

async function feedbackList(req, res, next) {
  try {
    const feedbackItems = await Feedback.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('student', 'name department')
      .populate({ path: 'complaint', select: 'ticketId title category status assignedTo', populate: { path: 'assignedTo', select: 'name' } });

    const ratingRows = await Feedback.aggregate([
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const countsByRating = {};
    for (let rating = 1; rating <= 5; rating += 1) {
      const row = ratingRows.find((entry) => entry._id === rating);
      countsByRating[rating] = row ? row.count : 0;
    }

    res.render('admin/feedback', {
      title: 'Student Feedback',
      feedbackItems,
      countsByRating,
      totalFeedback: feedbackItems.length,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  dashboard,
  listComplaints,
  users,
  createUser,
  updateUserRole,
  toggleUserStatus,
  analytics,
  feedbackList,
};
