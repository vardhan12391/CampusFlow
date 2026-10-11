/**
 * models/Comment.js
 * Every message AND every automatic status update of a complaint is one
 * document in the `comments` collection. Together they form the timeline
 * shown on the complaint details page:
 *
 *   10:30  Complaint created by Rahul        <- type: "activity"
 *   11:10  Assigned to Maintenance Staff     <- type: "activity"
 *   11:30  "Any update on this?"             <- type: "comment"
 *   12:20  Staff started working            <- type: "activity"
 *
 * Why a separate collection instead of an array inside Complaint?
 *  1. Complaint documents stay small -> the list page stays fast.
 *  2. Comments can be paginated / sorted on their own.
 *  3. Deleting a comment never rewrites the whole complaint document.
 * The trade-off: we must .populate() when we want the author's name.
 */
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true, // "give me the timeline of this complaint"
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = system-generated activity entry
    },
    authorName: {
      type: String,
      default: 'System',
      trim: true,
      // denormalised copy of the author's name, so the timeline still shows
      // a readable name even if the account is later deleted
    },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    type: {
      type: String,
      enum: ['comment', 'activity'],
      default: 'comment',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
