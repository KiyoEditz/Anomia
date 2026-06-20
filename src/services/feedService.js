const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');

const WEIGHTS = { engagement: 1.0, recency: 100, affinity: 1.0 };
const AUTHOR_FIELDS = 'username displayName avatarUrl role';
const POPULATE_PIPELINE = [
  {
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      pipeline: [{ $project: { username: 1, displayName: 1, avatarUrl: 1, role: 1 } }],
      as: 'author',
    },
  },
  { $unwind: '$author' },
  {
    $lookup: {
      from: 'tags',
      localField: 'tags',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1, slug: 1, category: 1 } }],
      as: 'tags',
    },
  },
  {
    $lookup: {
      from: 'posts',
      localField: 'repostOf',
      foreignField: '_id',
      pipeline: [
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            pipeline: [{ $project: { username: 1, displayName: 1, avatarUrl: 1, role: 1 } }],
            as: 'author',
          },
        },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'tags',
            localField: 'tags',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1, slug: 1, category: 1 } }],
            as: 'tags',
          },
        },
      ],
      as: 'repostOf',
    },
  },
  {
    $addFields: {
      repostOf: { $ifNull: [{ $arrayElemAt: ['$repostOf', 0] }, null] },
    },
  },
];

async function getRecentInteractionAuthors(userId) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const likedPosts = await Post.find(
    { likes: userId, createdAt: { $gte: sevenDaysAgo } },
    { author: 1 }
  ).lean();

  const commentedPosts = await Comment.find(
    { author: userId, createdAt: { $gte: sevenDaysAgo } },
    { post: 1 }
  ).lean();

  let commentedPostAuthors = [];
  if (commentedPosts.length > 0) {
    const postIds = commentedPosts.map((c) => c.post);
    const posts = await Post.find({ _id: { $in: postIds } }, { author: 1 }).lean();
    commentedPostAuthors = posts.map((p) => p.author.toString());
  }

  const authorIds = new Set([
    ...likedPosts.map((p) => p.author.toString()),
    ...commentedPostAuthors,
  ]);
  authorIds.delete(userId.toString());
  return [...authorIds];
}

const getForYouFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const now = new Date();
  const currentUser = await User.findById(userId).select('following followers').lean();
  const followingIds = (currentUser.following || []).map((id) => new mongoose.Types.ObjectId(id));
  const followerIds = new Set((currentUser.followers || []).map((id) => id.toString()));

  const isNewUser = followingIds.length === 0;
  const weights = isNewUser ? { ...WEIGHTS, engagement: 1.5 } : WEIGHTS;

  const recentInteractionAuthors = isNewUser
    ? []
    : await getRecentInteractionAuthors(userId);
  const recentInteractionSet = new Set(recentInteractionAuthors);

  const affinityBranches = [];
  if (followingIds.length > 0) {
    affinityBranches.push({
      case: {
        $and: [
          { $in: ['$author', followingIds] },
          {
            $in: [
              { $toString: '$author' },
              [...followerIds].filter((id) => followingIds.some((fid) => fid.toString() === id)),
            ],
          },
        ],
      },
      then: 8,
    });
    affinityBranches.push({
      case: { $in: ['$author', followingIds] },
      then: 5,
    });
  }
  if (followerIds.size > 0) {
    affinityBranches.push({
      case: { $in: [{ $toString: '$author' }, [...followerIds]] },
      then: 3,
    });
  }
  if (recentInteractionAuthors.length > 0) {
    affinityBranches.push({
      case: {
        $in: [
          { $toString: '$author' },
          recentInteractionAuthors,
        ],
      },
      then: 2,
    });
  }

  const mutualFollowIds = followingIds
    .filter((fid) => followerIds.has(fid.toString()))
    .map((id) => id.toString());

  const affinityField =
    affinityBranches.length > 0
      ? {
          affinityScore: {
            $add: [
              { $cond: [{ $in: ['$author', followingIds] }, 5, 0] },
              { $cond: [{ $in: [{ $toString: '$author' }, [...followerIds]] }, 3, 0] },
              {
                $cond: [
                  {
                    $in: [
                      { $toString: '$author' },
                      recentInteractionAuthors,
                    ],
                  },
                  2,
                  0,
                ],
              },
            ],
          },
        }
      : { affinityScore: { $literal: 0 } };

  const pipeline = [
    { $match: { status: 'published' } },
    {
      $addFields: {
        ageInHours: {
          $divide: [{ $subtract: [now, '$createdAt'] }, 3600000],
        },
      },
    },
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $multiply: [{ $size: { $ifNull: ['$likes', []] } }, 1] },
            { $multiply: [{ $ifNull: ['$commentsCount', 0] }, 2] },
            { $multiply: [{ $size: { $ifNull: ['$reposts', []] } }, 3] },
          ],
        },
      },
    },
    {
      $addFields: {
        recencyScore: {
          $divide: [1, { $pow: [{ $add: ['$ageInHours', 2] }, 1.5] }],
        },
      },
    },
    { $addFields: affinityField },
    {
      $addFields: {
        totalScore: {
          $add: [
            { $multiply: ['$engagementScore', weights.engagement] },
            { $multiply: ['$recencyScore', weights.recency] },
            { $multiply: ['$affinityScore', weights.affinity] },
          ],
        },
      },
    },
    { $sort: { totalScore: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    ...POPULATE_PIPELINE,
  ];

  return Post.aggregate(pipeline);
};

const getRecentFeed = async (userId, { page = 1, limit = 20 } = {}) => {
  const currentUser = await User.findById(userId).select('following').lean();
  const authorIds = [...(currentUser.following || []), new mongoose.Types.ObjectId(userId)];

  return Post.find({ author: { $in: authorIds }, status: 'published' })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('author', AUTHOR_FIELDS)
    .populate('tags', 'name slug category')
    .populate({
      path: 'repostOf',
      populate: [
        { path: 'author', select: AUTHOR_FIELDS },
        { path: 'tags', select: 'name slug category' },
      ],
    });
};

const checkNewPosts = async (userId, since) => {
  const currentUser = await User.findById(userId).select('following').lean();
  const authorIds = [...(currentUser.following || []), new mongoose.Types.ObjectId(userId)];

  return Post.countDocuments({
    author: { $in: authorIds },
    status: 'published',
    createdAt: { $gt: new Date(since) },
  });
};

// --- In-memory cache ---
const feedCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getForYouFeedCached = async (userId, options) => {
  const cacheKey = `${userId}_${options.page || 1}`;
  const cached = feedCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await getForYouFeed(userId, options);
  feedCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  if (feedCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of feedCache) {
      if (val.expiresAt <= now) feedCache.delete(key);
    }
  }

  return data;
};

module.exports = { getForYouFeed, getForYouFeedCached, getRecentFeed, checkNewPosts };
