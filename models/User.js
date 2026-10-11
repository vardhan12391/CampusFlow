/**
 * models/User.js
 * --------------------------------------------------------------------------
 * One document in the `users` collection = one account (student, staff, admin).
 *
 * Important fields:
 *  - password : stored as a bcrypt hash, NEVER plain text.
 *               `select: false` keeps it out of every normal query, so a hash
 *               can never leak into a view or an API response by accident.
 *  - role     : drives role-based authorization (student | staff | admin).
 *  - studentId / department / year  : only used for students.
 *  - jobTitle / department          : only used for staff (e.g. "Electrician").
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['student', 'staff', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // creates a unique index -> no duplicate accounts
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // excluded unless we explicitly ask for it
    },
    role: { type: String, enum: ROLES, default: 'student' },

    // --- student only ---
    studentId: { type: String, trim: true, default: '' },
    year: { type: String, trim: true, default: '' }, // "1st", "2nd", ...

    // --- shared: students = department, staff = working department ---
    department: { type: String, trim: true, default: '' },

    // --- staff only ---
    jobTitle: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true }, // admin can deactivate a user
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

/**
 * Mongoose "pre-save hook": runs automatically before a user document is saved.
 * This is the single place where plain-text passwords become hashes.
 *
 * NOTE: async hooks do NOT receive a `next` callback - you simply return.
 */
userSchema.pre('save', async function () {
  // isModified('password') is false when we update e.g. only the name
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10); // salt = random data so equal passwords hash differently
  this.password = await bcrypt.hash(this.password, salt);
});

/** Instance method: compare a plain password with the stored hash. */
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/** Instance method: whenever this document is turned to JSON, drop the hash. */
userSchema.methods.toJSON = function () {
  const safeUser = this.toObject();
  delete safeUser.password;
  return safeUser;
};

const User = mongoose.model('User', userSchema);
User.ROLES = ROLES;

module.exports = User;
