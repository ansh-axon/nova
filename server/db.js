const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

const connectDB = async () => {
  try {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'nova-chat'
      }
    });
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log(`MongoDB Memory Server started & connected at: ${uri}`);
  } catch (err) {
    console.error('Failed to connect to MongoDB Memory Server:', err);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (err) {
    console.error('Error disconnecting database:', err);
  }
};

module.exports = { connectDB, disconnectDB };
