/**
 * models/Feedback.js
 * One feedback document = the student's rating after a complaint was resolved.
 *
 * Kept in its own collection (instead of two fields on Complaint) because:
 *  - a complaint can have at most one feedback -> unique index on `complaint`
 *  - the admin analytics page can aggregate ratings on their own
 */
const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      unique: true, // one feedback per complaint
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
    },
    comment: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Feedback', feedbackSchema);
