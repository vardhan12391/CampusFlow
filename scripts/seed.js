/**
 * scripts/seed.js
 * --------------------------------------------------------------------------
 * Fills MongoDB with realistic demo data so the app is useful immediately:
 *
 *   1 admin, 3 staff, 10 students, 42 complaints, comments and feedback.
 *
 * Run it with:   npm run seed
 * (it wipes those collections first - never run it against production data)
 *
 * Every person and detail below is fictional.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Comment = require('../models/Comment');
const Feedback = require('../models/Feedback');
const Counter = require('../models/Counter');

const PRIORITY_RANK = { Urgent: 1, High: 2, Medium: 3, Low: 4 };

// --- small helpers ---------------------------------------------------------
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function daysAgo(numberOfDays, extraHours = 0) {
  const date = new Date();
  date.setDate(date.getDate() - numberOfDays);
  date.setHours(date.getHours() - extraHours);
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// --- fictional people ------------------------------------------------------
const ADMIN = {
  name: 'Ananya Rao',
  email: 'admin@campusflow.edu',
  password: 'password123',
  role: 'admin',
  department: 'Administration',
  jobTitle: 'Campus Operations Head',
  year: '',
};

const STAFF = [
  { name: 'Ravi Kumar', email: 'staff@campusflow.edu', jobTitle: 'Electrician', department: 'Electrical' },
  { name: 'Meera Nair', email: 'meera@campusflow.edu', jobTitle: 'Network Engineer', department: 'Information Tech' },
  { name: 'Suresh Babu', email: 'suresh@campusflow.edu', jobTitle: 'Facilities Supervisor', department: 'Civil' },
];

const STUDENTS = [
  { name: 'Rahul Sharma', studentId: '21CS1042', department: 'Computer Science', year: '3rd' },
  { name: 'Priya Verma', studentId: '21EC1088', department: 'Electronics', year: '3rd' },
  { name: 'Aditya Singh', studentId: '22ME1017', department: 'Mechanical', year: '2nd' },
  { name: 'Sneha Iyer', studentId: '22CS1064', department: 'Computer Science', year: '2nd' },
  { name: 'Karan Malhotra', studentId: '23EE1009', department: 'Electrical', year: '1st' },
  { name: 'Nisha Reddy', studentId: '21IT1033', department: 'Information Tech', year: '3rd' },
  { name: 'Vikram Joshi', studentId: '23CE1025', department: 'Civil', year: '1st' },
  { name: 'Ishita Bose', studentId: '22CS1091', department: 'Computer Science', year: '2nd' },
  { name: 'Arjun Menon', studentId: '21EC1012', department: 'Electronics', year: '3rd' },
  { name: 'Tanvi Desai', studentId: '23IT1047', department: 'Information Tech', year: '1st' },
];

// --- complaint templates ---------------------------------------------------
const COMPLAINT_TEMPLATES = [
  { category: 'Internet/Wi-Fi', title: 'Wi-Fi not working in Lab 2', location: 'Block C, Lab 2' },
  { category: 'Internet/Wi-Fi', title: 'Frequent internet disconnection in hostel', location: 'Hostel A, Room 214' },
  { category: 'Electrical', title: 'Power socket not working near the podium', location: 'Block A, Lecture Hall 3' },
  { category: 'Electrical', title: 'Corridor lights flickering all night', location: 'Block B, 2nd floor corridor' },
  { category: 'Classroom', title: 'Projector shows a blue screen', location: 'Block A, Lecture Hall 1' },
  { category: 'Classroom', title: 'AC not cooling in the classroom', location: 'Block C, Lecture Hall 5' },
  { category: 'Laboratory', title: 'Damaged computers in the hardware lab', location: 'Block C, Hardware Lab' },
  { category: 'Laboratory', title: 'Oscilloscope calibration is wrong', location: 'Block C, Electronics Lab' },
  { category: 'Hostel', title: 'Water leakage above the sink', location: 'Hostel B, Room 108' },
  { category: 'Hostel', title: 'Mess food served cold', location: 'Hostel A, Mess Hall' },
  { category: 'Library', title: 'Reading hall fans are noisy', location: 'Library, 1st floor' },
  { category: 'Library', title: 'Barcode scanner not scanning books', location: 'Library, circulation desk' },
  { category: 'Cleaning', title: 'Restroom not cleaned since morning', location: 'Block B, ground floor' },
  { category: 'Cleaning', title: 'Trash bins overflowing in the courtyard', location: 'Main courtyard' },
  { category: 'Furniture', title: 'Broken chair with a loose leg', location: 'Block A, Lecture Hall 2' },
  { category: 'Furniture', title: 'Desk top is cracked and unstable', location: 'Library, reading room' },
  { category: 'Other', title: 'Notice board glass is broken', location: 'Main entrance' },
  { category: 'Other', title: 'Bicycle stand is jammed', location: 'Parking area' },
];

const DESCRIPTIONS = [
  'Reported by students during the morning session. The issue is reproducible and blocks normal work.',
  'This has been happening for a few days and is getting worse. Attaching the details for reference.',
  'Several students confirmed the same problem. It affects the whole area, not just one desk.',
  'Raised after the lab session. Please check at the earliest since classes resume tomorrow.',
  'Not urgent but annoying - it slows down everyday work and should be fixed this week.',
];

const STUDENT_COMMENTS = [
  'Any update on this? It is still happening.',
  'Adding more detail: the problem starts after the second class.',
  'Confirmed - my classmates face the same issue.',
  'Thanks, waiting for the staff to visit.',
];

const STAFF_COMMENTS = [
  'Checked the area, spare parts are needed.',
  'Visiting after the current class ends.',
  'Replacement part ordered, will finish today.',
  'Issue reproduced and a temporary fix is applied.',
];

// ---------------------------------------------------------------------------
async function seed() {
  await connectDB();

  console.log('Clearing old data...');
  await Promise.all([
    User.deleteMany({}),
    Complaint.deleteMany({}),
    Comment.deleteMany({}),
    Feedback.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  // --- users ---------------------------------------------------------------
  console.log('Creating users...');
  const admin = await User.create(ADMIN);

  const staffUsers = [];
  for (const staff of STAFF) {
    staffUsers.push(
      await User.create({ ...staff, password: 'password123', role: 'staff', year: '', studentId: '' })
    );
  }

  const studentUsers = [];
  for (const student of STUDENTS) {
    const firstName = student.name.split(' ')[0].toLowerCase();
    studentUsers.push(
      await User.create({
        ...student,
        email: `${firstName}@campusflow.edu`,
        password: 'password123',
        role: 'student',
        jobTitle: '',
      })
    );
  }
  console.log(`  ${1 + staffUsers.length + studentUsers.length} users created`);

  // --- complaints ----------------------------------------------------------
  console.log('Creating complaints...');
  const complaintDocs = [];
  const commentDocs = [];

  const statusPlan = [
    ...Array(6).fill('Submitted'),
    ...Array(5).fill('Assigned'),
    ...Array(8).fill('In Progress'),
    ...Array(10).fill('Resolved'),
    ...Array(13).fill('Closed'),
  ]; // 42 complaints in total

  statusPlan.forEach((status, index) => {
    const template = pick(COMPLAINT_TEMPLATES);
    const reporter = pick(studentUsers);

    const createdAt = daysAgo(randomInt(1, 175), randomInt(0, 20));
    const priority = pick(['Low', 'Medium', 'Medium', 'High', 'Urgent']);

    // everything except "Submitted" already has a staff member
    const assignedTo = status === 'Submitted' ? null : pick(staffUsers)._id;

    let resolvedAt = null;
    let closedAt = null;
    if (status === 'Resolved' || status === 'Closed') {
      resolvedAt = addDays(createdAt, Math.random() * 4 + 0.3); // 0.3 - 4.3 days
    }
    if (status === 'Closed') {
      closedAt = addDays(resolvedAt, 0.2);
    }

    complaintDocs.push({
      ticketId: `CF-${1001 + index}`,
      title: template.title,
      description: pick(DESCRIPTIONS),
      category: template.category,
      location: template.location,
      priority,
      priorityRank: PRIORITY_RANK[priority],
      status,
      reportedBy: reporter._id,
      assignedTo,
      imageUrl: null,
      isEscalated: false,
      escalatedAt: null,
      resolvedAt,
      closedAt,
      createdAt,
      updatedAt: closedAt || resolvedAt || createdAt,
    });

    // `complaintIndex` is temporary - it is swapped for the real ObjectId
    // after the complaints have been inserted.
    const pushComment = (author, body, createdAtComment, type) => {
      commentDocs.push({
        complaintIndex: index,
        author: author ? author._id : null,
        authorName: author ? author.name : 'System',
        type,
        body,
        createdAt: createdAtComment,
      });
    };

    pushComment(reporter, `Complaint created by ${reporter.name}.`, createdAt, 'activity');

    if (assignedTo) {
      const staffMember = staffUsers.find((member) => member._id.equals(assignedTo));
      const assignedAt = new Date(createdAt.getTime() + 60 * 60 * 1000 * randomInt(1, 20));
      pushComment(admin, `Assigned to ${staffMember.name} by ${admin.name}.`, assignedAt, 'activity');

      if (status === 'In Progress' || status === 'Resolved' || status === 'Closed') {
        pushComment(
          staffMember,
          `Status changed from Assigned to In Progress by ${staffMember.name}.`,
          new Date(assignedAt.getTime() + 60 * 60 * 1000 * randomInt(1, 12)),
          'activity'
        );
      }
      if (resolvedAt) {
        pushComment(
          staffMember,
          `Status changed from In Progress to Resolved by ${staffMember.name}.`,
          resolvedAt,
          'activity'
        );
      }
      if (closedAt) {
        pushComment(reporter, 'Student confirmed the issue is resolved.', closedAt, 'activity');
      }

      if (Math.random() < 0.5) {
        pushComment(
          staffMember,
          pick(STAFF_COMMENTS),
          new Date(createdAt.getTime() + 60 * 60 * 1000 * randomInt(4, 40)),
          'comment'
        );
      }
    }

    if (Math.random() < 0.5) {
      pushComment(
        reporter,
        pick(STUDENT_COMMENTS),
        new Date(createdAt.getTime() + 60 * 60 * 1000 * randomInt(2, 30)),
        'comment'
      );
    }
  });

  const insertedComplaints = await Complaint.insertMany(complaintDocs);

  // attach the real ObjectIds and store the whole timeline in one operation
  commentDocs.forEach((comment) => {
    comment.complaint = insertedComplaints[comment.complaintIndex]._id;
    delete comment.complaintIndex;
  });
  await Comment.insertMany(commentDocs);
  console.log(`  ${insertedComplaints.length} complaints, ${commentDocs.length} timeline entries`);

  // --- feedback for finished complaints ------------------------------------
  const feedbackDocs = [];
  const ratings = [5, 4, 4, 3, 5, 2, 4, 5, 3, 4];
  insertedComplaints.forEach((complaint, index) => {
    if (!['Resolved', 'Closed'].includes(complaint.status)) return;
    feedbackDocs.push({
      complaint: complaint._id,
      student: complaint.reportedBy,
      rating: ratings[index % ratings.length],
      comment: index % 3 === 0 ? 'Fixed quickly, thank you!' : '',
      createdAt: complaint.closedAt || complaint.resolvedAt,
    });
  });
  if (feedbackDocs.length > 0) await Feedback.insertMany(feedbackDocs);
  console.log(`  ${feedbackDocs.length} feedback entries`);

  // --- ticket counter ------------------------------------------------------
  // Start AFTER the seeded tickets, otherwise the next complaint created in
  // the app would try to reuse CF-1001.
  await Counter.create({ _id: 'complaintTicket', seq: 1000 + complaintDocs.length });

  console.log('---------------------------------------------');
  console.log('Seeding finished. Demo logins');
  console.log('  (password for every account: password123)');
  console.log('  Admin   : admin@campusflow.edu');
  console.log('  Staff   : staff@campusflow.edu');
  console.log('  Student : rahul@campusflow.edu');
  console.log('---------------------------------------------');

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
