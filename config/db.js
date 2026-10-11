/**
 * config/db.js
 * --------------------------------------------------------------------------
 * Responsible for ONE thing: opening the connection to MongoDB.
 *
 * We keep it in its own file so app.js stays readable, and so the same
 * function can be reused by the seed script and by the tests.
 */
const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is missing. Copy .env.example to .env first.');
    }

    // mongoose.connect returns a connection promise
    await mongoose.connect(uri);

    console.log('MongoDB connected:', mongoose.connection.name);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    // If the database is down, starting the server is pointless -> exit.
    process.exit(1);
  }
}

module.exports = connectDB;
