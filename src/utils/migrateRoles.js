require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

async function migrate() {
  try {
    await connectDB();

    console.log('Running migration...');
    
    // Set all users without role or with 'admin' role to 'user'
    const res1 = await User.updateMany(
      { $or: [{ role: { $exists: false } }, { role: 'admin' }] },
      { $set: { role: 'user', roleAssignedBy: null, roleAssignedAt: null } }
    );
    console.log(`Updated ${res1.modifiedCount || 0} users to 'user'.`);

    // Set 'KiyoEditz' to 'dev'
    const devUser = await User.findOneAndUpdate(
      { username: 'KiyoEditz' },
      { $set: { role: 'dev', roleAssignedBy: null, roleAssignedAt: new Date() } },
      { new: true }
    );

    if (devUser) {
      console.log(`User 'KiyoEditz' updated to Developer ('dev').`);
    } else {
      console.log(`User 'KiyoEditz' not found in database.`);
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
