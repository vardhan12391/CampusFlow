/**
 * models/Complaint.js
 * The core document of CampusFlow: one document = one reported issue.
 *
 * Design notes worth quoting in an interview:
 *  - `ticketId` is a human-friendly unique id (CF-1001, CF-1002, ...) created
 *    by models/Counter.js so two complaints can never share a number.
 *  - `reportedBy` / `assignedTo` are REFERENCES (ObjectIds) to `users`.
 *    We store only the id and use .populate() when we need the actual user.
 *  - `status` follows a fixed workflow:
 *      Submitted -> Assigned -> In Progress -> Resolved -> Closed
 *    The enum in the schema is the safety net that stops invalid statuses
 *    from ever reaching the database.
 *  - `isEscalated` is a plain boolean set by services/escalationService.js.
 *    A simple field + a periodic query is enough; no message queue needed.
 */
const mongoose = require('mongoose');

const CATEGORIES = [
  'Electrical',
  'Internet/Wi-Fi',
  'Classroom',
  'Laboratory',
  'Hostel',
  'Library',
  'Cleaning',
  'Furniture',
  'Other',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// 1 is the most important - used for sorting by priority
const PRIORITY_RANK = { Urgent: 1, High: 2, Medium: 3, Low: 4 };

const STATUSES = ['Submitted', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

const complaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true, // fast lookups like /complaints/CF-1042
      uppercase: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title is too long'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description is too long'],
    },
    category: { type: String, required: true, enum: CATEGORIES },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
      maxlength: [120, 'Location is too long'],
    },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },

    // "High" < "Low" < "Medium" < "Urgent" when sorted as plain text, so we
    // keep a numeric rank next to the label: 1 = Urgent ... 4 = Low.
    // This is what makes `sort=priority` on the list pages work correctly.
    priorityRank: { type: Number, default: 3 },

    status: { type: String, enum: STATUSES, default: 'Submitted' },

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = not assigned yet
    },

    // path of the uploaded image, e.g. "/uploads/1712345678-ab12.png"
    imageUrl: { type: String, default: null },

    // escalation
    isEscalated: { type: Boolean, default: false },
    escalatedAt: { type: Date, default: null },

    // timestamps for the "average resolution time" analytics
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes = extra hints that make common queries fast.
// List page always filters by status and sorts newest first.
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ reportedBy: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
// Duplicate detection looks for open complaints in the same place + category.
complaintSchema.index({ location: 1, category: 1, status: 1 });

/**
 * Keeps priorityRank in sync whenever the document is saved or validated.
 * Async hooks return a promise instead of using a `next` callback.
 */
complaintSchema.pre('validate', async function () {
  if (this.isModified('priority') || !this.priorityRank) {
    this.priorityRank = PRIORITY_RANK[this.priority] || 3;
  }
});

/**
 * Keeps priorityRank in sync for updateOne() / findOneAndUpdate() as well
 * (the admin priority form uses an update, not a save).
 */
function syncPriorityRank() {
  const update = this.getUpdate();

  if (update.$set && update.$set.priority) {
    update.$set.priorityRank = PRIORITY_RANK[update.$set.priority] || 3;
  } else if (!update.$set && update.priority) {
    update.priorityRank = PRIORITY_RANK[update.priority] || 3;
  }
}
complaintSchema.pre('updateOne', syncPriorityRank);
complaintSchema.pre('findOneAndUpdate', syncPriorityRank);

const Complaint = mongoose.model('Complaint', complaintSchema);

// Attach the option lists to the model so controllers and views can use them
// (e.g. Complaint.CATEGORIES in a form, or to populate res.locals).
Complaint.CATEGORIES = CATEGORIES;
Complaint.PRIORITIES = PRIORITIES;
Complaint.STATUSES = STATUSES;

module.exports = Complaint;
