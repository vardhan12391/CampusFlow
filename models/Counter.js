/**
 * models/Counter.js
 * Generates the unique ticket numbers CF-1001, CF-1002, CF-1003 ...
 *
 * WHY do we need a counter?
 *   complaint.countDocuments() would be wrong if a complaint were ever
 *   deleted, and two requests running at the same time could pick the same
 *   number. A counter document updated with $inc is atomic, so every
 *   complaint gets a different number even under concurrency.
 *
 * HOW does it work?
 *   One document: { _id: "complaintTicket", seq: 1000 }.
 *   findOneAndUpdate({$inc: {seq: 1}}) increments and returns the NEW value
 *   in a single database operation.
 */
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 1000 }, // first ticket will be CF-1001
});

/** Returns the next ticket number (1001, 1002, 1003, ...). */
counterSchema.statics.nextTicketNumber = async function () {
  const counter = await this.findByIdAndUpdate(
    { _id: 'complaintTicket' },
    { $inc: { seq: 1 } },
    // upsert: create the document the first time it is requested
    // returnDocument 'after': return the value AFTER the increment
    { upsert: true, returnDocument: 'after' }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
