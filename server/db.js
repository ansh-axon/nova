const mongoose = require('mongoose');

let memoryServer = null;

const connectDB = async () => {
  let uri = process.env.MONGODB_URI;

  // Zero-setup testing: if no MONGODB_URI is provided, spin up an in-memory
  // MongoDB (downloads a small binary once, then cached). Great for local
  // testing — no Atlas account needed. NOTE: data resets when the server stops.
  if (!uri) {
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      console.log('No MONGODB_URI set — starting in-memory MongoDB for testing...');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      console.log('In-memory MongoDB ready (data is temporary / resets on restart).');
    } catch (err) {
      console.error('Could not start in-memory MongoDB:', err.message);
      console.error('Set MONGODB_URI in server/.env (e.g. a free MongoDB Atlas cluster) instead.');
      process.exit(1);
    }
  }

  try {
    await mongoose.connect(uri);
    console.log(memoryServer ? 'Connected to in-memory MongoDB' : 'MongoDB connected successfully');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    // Resilient fallback: if the configured (e.g. Atlas) database is unreachable,
    // automatically start a local in-memory MongoDB so testing can continue.
    if (!memoryServer) {
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        console.log('Primary database unreachable — falling back to in-memory MongoDB for testing...');
        memoryServer = await MongoMemoryServer.create();
        await mongoose.connect(memoryServer.getUri());
        console.log('Connected to in-memory MongoDB (temporary data, resets on restart).');
        return;
      } catch (memErr) {
        console.error('In-memory fallback also failed:', memErr.message);
      }
    }
    process.exit(1);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
};

module.exports = { connectDB, disconnectDB };
