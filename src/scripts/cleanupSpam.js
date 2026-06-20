require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Post = require('../models/Post');
const PostLimit = require('../models/PostLimit');

async function runCleanup() {
  await connectDB();
  console.log('Running cleanup script...');

  const todayStr = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);

  // Step 1: Identify users with > 50 posts today
  const heavyPosters = await Post.aggregate([
    { $match: { createdAt: { $gte: startOfDay } } },
    { $group: { _id: "$author", count: { $sum: 1 } } },
    { $match: { count: { $gt: 50 } } },
    { $sort: { count: -1 } }
  ]);
  console.log(`Found ${heavyPosters.length} users with > 50 posts today:`, heavyPosters);

  // Step 3: Remove duplicate content (posts with identical content from the same author)
  const duplicates = await Post.aggregate([
    {
      $group: {
        _id: { author: "$author", content: "$content" },
        ids: { $push: "$_id" },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  let totalDeleted = 0;
  for (const group of duplicates) {
    const [keep, ...remove] = group.ids;
    const result = await Post.deleteMany({ _id: { $in: remove } });
    totalDeleted += result.deletedCount;
  }
  console.log(`Deleted ${totalDeleted} duplicate posts.`);

  // Step 4: Ensure indexes are created
  console.log('Building indexes...');
  await Post.createIndexes();
  await PostLimit.createIndexes();
  console.log('Indexes built successfully.');

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

runCleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
