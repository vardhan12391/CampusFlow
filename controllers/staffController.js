/**
 * controllers/staffController.js
 * The staff area. Staff members are the people who actually FIX things.
 *
 * Scopes of the list page:
 *   mine        -> complaints assigned to me        (default)
 *   unassigned  -> the shared pool nobody has taken yet
 *   all         -> every complaint (read-only overview)
 */
const Complaint = require('../models/Complaint');
const { buildComplaintQuery, getPaginationPages } = require('../utils/complaintQuery');

async function dashboard(req, res, next) {
  try {
    const mineFilter = { assignedTo: req.user._id };

    const statusCounts = await Complaint.aggregate([
      { $match: mineFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]);

    const countsByStatus = {};
    Complaint.STATUSES.forEach((status) => {
      countsByStatus[status] = 0;
    });
    statusCounts.forEach((entry) => {
      countsByStatus[entry.status] = entry.count;
    });

    const assignedToMe = Object.values(countsByStatus).reduce((sum, value) => sum + value, 0);

    const unassignedCount = await Complaint.countDocuments({
      assignedTo: null,
      status: 'Submitted',
    });

    const urgentOpenCount = await Complaint.countDocuments({
      assignedTo: req.user._id,
      priority: { $in: ['High', 'Urgent'] },
      status: { $nin: ['Resolved', 'Closed'] },
    });

    // Work waiting for this staff member, oldest first (best starting point)
    const openComplaints = await Complaint.find({
      assignedTo: req.user._id,
      status: { $nin: ['Resolved', 'Closed'] },
    })
      .sort({ priorityRank: 1, createdAt: 1 })
      .limit(6);

    res.render('staff/dashboard', {
      title: 'Staff Dashboard',
      countsByStatus,
      assignedToMe,
      unassignedCount,
      urgentOpenCount,
      openComplaints,
    });
  } catch (error) {
    next(error);
  }
}

async function listComplaints(req, res, next) {
  try {
    const scope = ['mine', 'unassigned', 'all'].includes(req.query.scope)
      ? req.query.scope
      : 'mine';

    const baseFilterByScope = {
      mine: { assignedTo: req.user._id },
      unassigned: { assignedTo: null, status: 'Submitted' },
      all: {},
    };

    const { filter, sort, page, limit, skip } = buildComplaintQuery(req.query, {
      baseFilter: baseFilterByScope[scope],
    });

    const totalItems = await Complaint.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    const complaints = await Complaint.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('reportedBy', 'name department')
      .populate('assignedTo', 'name jobTitle');

    res.render('staff/complaints', {
      title: 'Complaints',
      complaints,
      scope,
      totalItems,
      page,
      totalPages,
      paginationPages: getPaginationPages(page, totalPages),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { dashboard, listComplaints };
