/**
 * controllers/studentController.js
 * --------------------------------------------------------------------------
 * The student area: dashboard + personal complaint list.
 *
 * Every query in this file starts with `{ reportedBy: req.user._id }`,
 * which is what keeps students inside their own data.
 */
const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const { buildComplaintQuery, getPaginationPages } = require('../utils/complaintQuery');

// GET /student
async function dashboard(req, res, next) {
  try {
    // One aggregation pipeline instead of four separate count queries:
    //   $match  -> keep only my complaints
    //   $group  -> count how many fall into each status
    //   $project-> turn the result into the shape the view expects
    const statusCounts = await Complaint.aggregate([
      { $match: { reportedBy: req.user._id } },
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

    const total = Object.values(countsByStatus).reduce((sum, value) => sum + value, 0);
    const pending = countsByStatus.Submitted + countsByStatus.Assigned;
    const openEscalations = await Complaint.countDocuments({
      reportedBy: req.user._id,
      isEscalated: true,
      status: { $nin: ['Resolved', 'Closed'] },
    });

    // 5 newest complaints for the "recent activity" card
    const recentComplaints = await Complaint.find({ reportedBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('student/dashboard', {
      title: 'Student Dashboard',
      countsByStatus,
      total,
      pending,
      openEscalations,
      recentComplaints,
    });
  } catch (error) {
    next(error);
  }
}

// GET /student/complaints
async function listComplaints(req, res, next) {
  try {
    // Same filter/sort/pagination logic as staff and admin, but the base
    // filter forces the query to only ever return this student's complaints.
    const { filter, sort, page, limit, skip } = buildComplaintQuery(req.query, {
      baseFilter: { reportedBy: req.user._id },
    });

    const totalItems = await Complaint.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    const complaints = await Complaint.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'name jobTitle');

    res.render('student/complaints', {
      title: 'My Complaints',
      complaints,
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
