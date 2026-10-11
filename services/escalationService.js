/**
 * services/escalationService.js
 * Escalation in one sentence:
 *   "If a High/Urgent complaint is still not resolved after X hours,
 *    flag it (isEscalated = true) so the admin dashboard can push it."
 *
 * Deliberately simple - no message queue, no cron library:
 *  1. one boolean field on the complaint,
 *  2. one MongoDB query that finds old, open, high-priority complaints,
 *  3. called once at server start and then every 15 minutes (setInterval).
 */
const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');

// How many hours before a High/Urgent complaint is escalated (default 48).
const ESCALATION_HOURS = Number(process.env.ESCALATION_HOURS) || 48;

async function runEscalationCheck() {
  const cutoff = new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000);

  // Only complaints that are (a) important, (b) still open,
  // (c) older than the cut-off and (d) not escalated yet.
  const overdueComplaints = await Complaint.find({
    priority: { $in: ['High', 'Urgent'] },
    status: { $in: ['Submitted', 'Assigned', 'In Progress'] },
    isEscalated: false,
    createdAt: { $lt: cutoff },
  }).select('_id ticketId');

  if (overdueComplaints.length === 0) return 0;

  const ids = overdueComplaints.map((complaint) => complaint._id);

  // $in updates all matching documents in one query
  await Complaint.updateMany(
    { _id: { $in: ids } },
    { $set: { isEscalated: true, escalatedAt: new Date() } }
  );

  // Record WHY it was escalated in each timeline, so the story is visible
  // to the admin on the complaint page.
  const activityEntries = overdueComplaints.map((complaint) => ({
    complaint: complaint._id,
    author: null,
    authorName: 'System',
    type: 'activity',
    body: `Escalated automatically: still open after ${ESCALATION_HOURS} hours at high priority.`,
  }));
  await Comment.insertMany(activityEntries);

  console.log(`Escalation check: ${overdueComplaints.length} complaint(s) escalated.`);
  return overdueComplaints.length;
}

module.exports = { runEscalationCheck, ESCALATION_HOURS };
