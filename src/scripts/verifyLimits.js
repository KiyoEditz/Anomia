require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Post = require('../models/Post');
const PostLimit = require('../models/PostLimit');
const Notification = require('../models/Notification');

const postCooldown = require('../middleware/postCooldown');
const dailyPostLimit = require('../middleware/dailyPostLimit');
const contentDedup = require('../middleware/contentDedup');
const { incrementPostCount } = require('../services/postLimitService');

async function runTests() {
  await connectDB();
  console.log('--- Starting System Verification ---');

  // Find or create test user
  let user = await User.findOne({ username: 'limittestuser' });
  if (!user) {
    user = await User.create({
      username: 'limittestuser',
      passwordHash: 'dummy_hash',
      displayName: 'Limit Test User'
    });
    console.log('Created test user:', user.username);
  }

  // Clear previous limits and posts for this test user
  await PostLimit.deleteMany({ userId: user._id });
  await Post.deleteMany({ author: user._id });
  await Notification.deleteMany({ recipientId: user._id });
  console.log('Cleared existing records for test user.');

  const req = {
    userId: user._id,
    user: user,
    body: { content: 'This is a test post content' }
  };

  const createRes = () => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  // Test 1: Content Deduplication
  console.log('\n[Test 1] Testing Content Deduplication...');
  // Mock post creation
  const mockPostHash = require('../utils/contentHash').hashContent(req.body.content);
  await Post.create({
    author: user._id,
    content: req.body.content,
    contentHash: mockPostHash,
    status: 'published'
  });

  const res1 = createRes();
  let nextCalled = false;
  await contentDedup(req, res1, () => { nextCalled = true; });

  if (res1.statusCode === 409) {
    console.log('✅ Content Deduplication Passed: Rejected duplicate post with 409.');
  } else {
    console.error('❌ Content Deduplication Failed. Response:', res1.body, 'Code:', res1.statusCode);
  }

  // Test 2: Cooldown Middleware
  console.log('\n[Test 2] Testing Cooldown Middleware...');
  // Create a record with lastPostAt = now
  const today = require('../utils/date').getToday();
  await PostLimit.create({
    userId: user._id,
    date: today,
    postCount: 1,
    lastPostAt: new Date()
  });

  const res2 = createRes();
  nextCalled = false;
  await postCooldown(req, res2, () => { nextCalled = true; });

  if (res2.statusCode === 429 && res2.body.retryAfter) {
    console.log('✅ Cooldown Middleware Passed: Blocked consecutive posts with 429 and retryAfter.');
  } else {
    console.error('❌ Cooldown Middleware Failed. Response:', res2.body, 'Code:', res2.statusCode);
  }

  // Test 3: Daily Post Limit Warnings & Rejections
  console.log('\n[Test 3] Testing Daily Limits & Notifications...');
  // Clear again
  await PostLimit.deleteMany({ userId: user._id });
  await Notification.deleteMany({ recipientId: user._id });

  // Simulate warning at 30 posts
  console.log('Simulating incrementing posts to 30...');
  let currentRecord = await PostLimit.create({
    userId: user._id,
    date: today,
    postCount: 29,
    lastPostAt: new Date(Date.now() - 60000) // avoid cooldown
  });

  await incrementPostCount(user._id, currentRecord, 0);

  let updatedRecord = await PostLimit.findOne({ userId: user._id, date: today });
  let warnings = await Notification.find({ recipientId: user._id, type: 'system' });
  if (updatedRecord.postCount === 30 && updatedRecord.warningIssued && warnings.length === 1) {
    console.log('✅ Daily Warning passed: warningIssued set to true and system notification sent.');
  } else {
    console.error('❌ Daily Warning failed. Count:', updatedRecord.postCount, 'warningIssued:', updatedRecord.warningIssued, 'Notifications count:', warnings.length);
  }

  // Simulate limitReached at 50 posts
  console.log('Simulating incrementing posts to 50...');
  updatedRecord.postCount = 49;
  updatedRecord.lastPostAt = new Date(Date.now() - 60000);
  await updatedRecord.save();

  await incrementPostCount(user._id, updatedRecord, 0);

  updatedRecord = await PostLimit.findOne({ userId: user._id, date: today });
  let blocks = await Notification.find({ recipientId: user._id, type: 'system', message: /mencapai batas/ });
  if (updatedRecord.postCount === 50 && updatedRecord.limitReached && blocks.length === 1) {
    console.log('✅ Daily Limit Block passed: limitReached set to true and block notification sent.');
  } else {
    console.error('❌ Daily Limit Block failed. Count:', updatedRecord.postCount, 'limitReached:', updatedRecord.limitReached, 'Blocks count:', blocks.length);
  }

  // Test dailyPostLimit middleware blocking on 50 posts
  const res3 = createRes();
  nextCalled = false;
  await dailyPostLimit(req, res3, () => { nextCalled = true; });

  if (res3.statusCode === 429 && res3.body.message.includes('mencapai batas')) {
    console.log('✅ dailyPostLimit middleware passed: Rejected post 51+ with 429.');
  } else {
    console.error('❌ dailyPostLimit middleware failed. Response:', res3.body, 'Code:', res3.statusCode);
  }

  // Test 4: Rapid Post Streak Detection (Suspension)
  console.log('\n[Test 4] Testing Rapid Post Streak (Bot) Suspension...');
  await PostLimit.deleteMany({ userId: user._id });
  await Notification.deleteMany({ recipientId: user._id });

  // Create a record with rapidPostStreak = 4, and lastPostAt = 5 seconds ago
  await PostLimit.create({
    userId: user._id,
    date: today,
    postCount: 5,
    rapidPostStreak: 4,
    lastPostAt: new Date(Date.now() - 5000)
  });

  const res4 = createRes();
  nextCalled = false;
  await dailyPostLimit(req, res4, () => { nextCalled = true; });

  updatedRecord = await PostLimit.findOne({ userId: user._id, date: today });
  let suspensionNotif = await Notification.findOne({ recipientId: user._id, type: 'system', message: /dibatasi/ });

  if (res4.statusCode === 429 && updatedRecord.suspendUntil && suspensionNotif) {
    console.log('✅ Rapid Post Streak (Bot) detection passed: user suspended and system notification sent.');
  } else {
    console.error('❌ Rapid Post Streak failed. Code:', res4.statusCode, 'suspendUntil:', updatedRecord.suspendUntil, 'Notification:', suspensionNotif);
  }

  // Cleanup test user data
  await PostLimit.deleteMany({ userId: user._id });
  await Post.deleteMany({ author: user._id });
  await Notification.deleteMany({ recipientId: user._id });
  await User.deleteOne({ _id: user._id });
  console.log('\nCleaned up test data.');
  console.log('--- Verification Complete ---');

  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Verification failed with error:', err);
  process.exit(1);
});
