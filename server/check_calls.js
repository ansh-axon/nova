const mongoose = require('mongoose');

async function main() {
  const uri = 'mongodb://127.0.0.1:41150/test'; // Try 'test' or list databases
  console.log('Connecting to database:', uri);
  try {
    await mongoose.connect(uri);
    console.log('Connected!');
    
    // List all databases
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log('--- DATABASES ---', JSON.stringify(dbs, null, 2));

    // List all collections in current db
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('--- COLLECTIONS ---', collections.map(c => c.name));

    // Try to load calls and users from current connection
    const Call = mongoose.model('Call', new mongoose.Schema({}, { strict: false }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    
    const calls = await Call.find({}).lean();
    console.log('--- CALL RECORDS ---', calls.length);
    console.log(JSON.stringify(calls, null, 2));

    const users = await User.find({}).lean();
    console.log('--- USER RECORDS ---', users.length);
    console.log(JSON.stringify(users.map(u => ({ id: u._id, username: u.username, displayName: u.displayName })), null, 2));
    
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
