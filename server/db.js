const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Add it to your server/.env file.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB Atlas connected successfully');
  } catch (err) {
    console.error('Failed to connect to MongoDB Atlas:', err.message);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
};

module.exports = { connectDB, disconnectDB };
