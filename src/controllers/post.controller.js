const Post = require('../models/Post');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Comment = require('../models/Comment');
const { upsertTags, splitCsv, parseTagQuery } = require('../utils/tags');
const { uploadBuffer, destroyAsset } = require('../utils/cloudinary');
const { createNotification } = require('../utils/notification');
const { quickScan } = require('../utils/moderation');
const { sanitizePostContent } = require('../utils/sanitize');

const AUTHOR_FIELDS = 'username displayName avatarUrl role';

async function bumpTagUsage(tagIds, delta) {
  if (!tagIds || tagIds.length === 0) return;
  await Tag.updateMany({ _id: { $in: tagIds } }, { $inc: { usageCount: delta } });
}

async function buildTagFilter(req) {
  const fromQuery = parseTagQuery(req.query.q);
  const include = [...new Set([...splitCsv(req.query.tags), ...fromQuery.include])];
  const exclude = [...new Set([...splitCsv(req.query.exclude), ...fromQuery.exclude])];

  const filter = {};
  if (include.length) {
    const tags = await Tag.find({ slug: { $in: include } }).select('_id');
    if (tags.length !== include.length) {
      filter.tags = { $all: tags.map((t) => t._id), $exists: true };
      filter._impossible = tags.length < include.length;
    } else {
      filter.tags = { $all: tags.map((t) => t._id) };
    }
  }
  if (exclude.length) {
    const tags = await Tag.find({ slug: { $in: exclude } }).select('_id');
    if (tags.length) {
      filter.tags = filter.tags || {};
      filter.tags.$nin = tags.map((t) => t._id);
    }
  }
  return filter;
}

exports.create = async (req, res, next) => {
  try {
    let { tags } = req.body;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch { tags = []; }
    }
    // Sanitasi wajib sebelum menyentuh DB — strip semua HTML dari konten user.
    const content = sanitizePostContent(req.body.content);
    if (!content) {
      return res.status(400).json({ error: 'content tidak boleh kosong' });
    }

    // Run Quick Scan on media file if it exists
    let scanResult = null;
    if (req.file) {
      try {
        scanResult = await quickScan(req.file.buffer, req.file.mimetype, content, req.userId);
      } catch (err) {
        console.error('[Moderation Error]:', err);
        return res.status(400).json({ error: 'Konten tidak dapat dipublikasikan karena terjadi kesalahan pada sistem moderasi.' });
      }

      if (!scanResult.isApproved) {
        return res.status(400).json({ error: 'Konten tidak dapat dipublikasikan karena melanggar ketentuan atau terjadi kesalahan.' });
      }
    }

    const tagDocs = Array.isArray(tags) ? await upsertTags(tags) : [];

    let mediaUrl = '';
    let mediaPublicId = '';
    let mediaType = '';
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      mediaType = isVideo ? 'video' : 'image';
      
      const uploadOptions = {
        folder: 'anomia/posts',
        resourceType: mediaType,
      };

      const webhookUrl = process.env.MODERATION_WEBHOOK_URL;
      if (webhookUrl) {
        uploadOptions.notificationUrl = webhookUrl;
        uploadOptions.moderation = isVideo ? 'google_video_moderation' : 'aws_rek';
      }

      const result = await uploadBuffer(req.file.buffer, uploadOptions);
      mediaUrl = result.secure_url;
      mediaPublicId = result.public_id;
    }

    const post = await Post.create({
      author: req.userId,
      content,
      tags: tagDocs.map((t) => t._id),
      mediaUrl,
      mediaPublicId,
      mediaType,
      status: 'published',
      contentHash: req.contentHash || null,
      quickScan: scanResult ? {
        provider: scanResult.provider,
        result: scanResult.isApproved ? 'approved' : 'rejected',
        score: scanResult.score,
        checkedAt: new Date(),
      } : undefined,
    });

    await bumpTagUsage(tagDocs.map((t) => t._id), 1);

    if (req.postLimitRecord) {
      const { incrementPostCount } = require('../services/postLimitService');
      await incrementPostCount(req.userId, req.postLimitRecord, req.newRapidStreak);
    }

    // Thorough scan simulation logic (local development / testing)
    if (req.file && !process.env.MODERATION_WEBHOOK_URL) {
      const isFlagged = content.toLowerCase().includes('test-thorough-flagged');
      const mockWebhookData = {
        public_id: mediaPublicId,
        status: isFlagged ? 'flagged' : 'approved',
        provider: 'mock-thorough-scan',
        score: isFlagged ? 95 : 0,
        reason: isFlagged ? 'Simulated thorough scan violation' : '',
      };

      setTimeout(async () => {
        try {
          console.log(`[Simulation] Triggering thorough scan webhook for post: ${post._id}`);
          const webhookCtrl = require('./webhook.controller');
          const mockReq = { body: mockWebhookData };
          const mockRes = {
            json: (data) => console.log('[Simulation Webhook Response]:', data),
            status: function (code) {
              console.log('[Simulation Webhook Status]:', code);
              return this;
            },
          };
          await webhookCtrl.moderation(mockReq, mockRes, (err) => {
            if (err) console.error('[Simulation Webhook Error]:', err);
          });
        } catch (err) {
          console.error('[Simulation Webhook Execution Error]:', err);
        }
      }, 5000);
    }

    // Parse mentions and trigger notifications
    const mentions = [...new Set(content.match(/@([a-zA-Z0-9_.]+)/g) || [])]
      .map((m) => m.slice(1))
      .filter((uname) => uname.toLowerCase() !== req.user.username.toLowerCase());

    if (mentions.length > 0) {
      const users = await User.find({ username: { $in: mentions } });
      for (const targetUser of users) {
        await createNotification({
          recipientId: targetUser._id,
          senderId: req.userId,
          type: 'mention',
          message: `@${req.user.username} menyebutmu di sebuah postingan`,
          deepLink: `/post/${post._id}`,
          refPostId: post._id,
          refMediaPreview: post.mediaUrl,
        });
      }
    }

    const populated = await Post.findById(post._id)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');

    try {
      const { emitBroadcast } = require('../utils/socket');
      emitBroadcast('new_post', populated);
    } catch (err) {
      console.error('[Socket Error]: Failed to emit new post', err);
    }

    res.status(201).json({ post: populated });
  } catch (e) {
    next(e);
  }
};

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const filter = await buildTagFilter(req);
    if (filter._impossible) return res.json({ posts: [], page });
    delete filter._impossible;
    
    // Only fetch published posts
    filter.status = 'published';

    // Support text search query
    if (req.query.search) {
      const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.content = { $regex: safe, $options: 'i' };
    }

    // Support engagement sorting
    if (req.query.sort === 'engagement') {
      const posts = await Post.aggregate([
        { $match: filter },
        {
          $addFields: {
            likesCount: { $size: { $ifNull: ['$likes', []] } },
            engagementScore: {
              $add: [
                { $size: { $ifNull: ['$likes', []] } },
                { $multiply: [{ $ifNull: ['$commentsCount', 0] }, 2] }
              ]
            }
          }
        },
        { $sort: { engagementScore: -1, createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ]);

      const populatedPosts = await Post.populate(posts, [
        { path: 'author', select: AUTHOR_FIELDS },
        { path: 'tags', select: 'name slug category' },
        {
          path: 'repostOf',
          populate: [
            { path: 'author', select: AUTHOR_FIELDS },
            { path: 'tags', select: 'name slug category' }
          ]
        }
      ]);
      return res.json({ posts: populatedPosts, page });
    }

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });
    res.json({ posts, page });
  } catch (e) {
    next(e);
  }
};

exports.feed = async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).select('following');
    const authorIds = [...me.following, req.userId];
    const baseFilter = await buildTagFilter(req);
    if (baseFilter._impossible) return res.json({ posts: [], nextCursor: null });
    delete baseFilter._impossible;

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const before = req.query.before || null;

    const filter = {
      ...baseFilter,
      author: { $in: authorIds },
      status: 'published',
    };
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });

    const nextCursor =
      posts.length > 0
        ? posts[posts.length - 1].createdAt
        : null;

    res.json({ posts, nextCursor });
  } catch (e) {
    next(e);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username displayName bio avatarUrl role')
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });
    if (!post || post.status !== 'published') return res.status(404).json({ error: 'Post tidak ditemukan' });
    res.json({ post });
  } catch (e) {
    next(e);
  }
};

exports.listByUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;

    const posts = await Post.find({ author: user._id, status: 'published' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });
    res.json({ posts, page });
  } catch (e) {
    next(e);
  }
};

exports.like = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.status === 'removed') return res.status(404).json({ error: 'Post tidak ditemukan' });
    
    const wasLiked = post.likes.includes(req.userId);
    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: req.userId } });

    if (!wasLiked) {
      await createNotification({
        recipientId: post.author,
        senderId: req.userId,
        type: 'post_like',
        message: `@${req.user.username} menyukai postinganmu`,
        deepLink: `/post/${post._id}`,
        refPostId: post._id,
        refMediaPreview: post.mediaUrl,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.unlike = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.status === 'removed') return res.status(404).json({ error: 'Post tidak ditemukan' });
    await Post.updateOne({ _id: post._id }, { $pull: { likes: req.userId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });
    if (!post.author.equals(req.userId)) {
      return res.status(403).json({ error: 'Bukan post milik Anda' });
    }
    const tagIds = [...(post.tags || [])];
    const mediaPublicId = post.mediaPublicId;
    const mediaType = post.mediaType;
    await Comment.deleteMany({ post: post._id });
    await post.deleteOne();
    await bumpTagUsage(tagIds, -1);
    if (mediaPublicId) destroyAsset(mediaPublicId, mediaType || 'image');
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

const ManualModerationLog = require('../models/ManualModerationLog');

exports.moderateRemove = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });

    const reason = req.body.reason || 'Melanggar ketentuan komunitas.';
    const tagIds = [...(post.tags || [])];
    const mediaPublicId = post.mediaPublicId;
    const mediaType = post.mediaType;

    // Delete comments
    await Comment.deleteMany({ post: post._id });
    
    // Set status to removed_by_mod
    post.status = 'removed_by_mod';
    post.removedReason = reason;
    await post.save();

    // Bump tag usage
    await bumpTagUsage(tagIds, -1);

    // Destroy asset
    if (mediaPublicId) {
      try {
        destroyAsset(mediaPublicId, mediaType || 'image');
      } catch (err) {
        console.error('Failed to destroy asset:', err);
      }
    }

    // Log the manual action
    await ManualModerationLog.create({
      action: 'delete_post',
      performedBy: req.userId,
      performedByRole: req.user.role,
      targetUserId: post.author,
      targetPostId: post._id,
      reason,
    });

    // Notify post author
    await createNotification({
      recipientId: post.author,
      senderId: req.userId,
      type: 'moderation_removed',
      message: `Postingan Anda telah dihapus oleh moderator. Alasan: ${reason}`,
      refPostId: post._id,
      refMediaPreview: post.mediaUrl,
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// POST /api/posts/:id/bookmark
exports.bookmark = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.status === 'removed') return res.status(404).json({ error: 'Post tidak ditemukan' });
    await User.updateOne({ _id: req.userId }, { $addToSet: { bookmarks: post._id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// DELETE /api/posts/:id/bookmark
exports.unbookmark = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.userId }, { $pull: { bookmarks: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// GET /api/posts/bookmarks
exports.listBookmarks = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'bookmarks',
      match: { status: 'published' },
      populate: [
        { path: 'author', select: AUTHOR_FIELDS },
        { path: 'tags', select: 'name slug category' },
        {
          path: 'repostOf',
          populate: [
            { path: 'author', select: AUTHOR_FIELDS },
            { path: 'tags', select: 'name slug category' }
          ]
        }
      ]
    });
    res.json({ posts: user ? user.bookmarks : [] });
  } catch (e) {
    next(e);
  }
};

// POST /api/posts/:id/repost
exports.repost = async (req, res, next) => {
  try {
    const originalPost = await Post.findById(req.params.id);
    if (!originalPost || originalPost.status !== 'published') {
      return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    }

    const alreadyReposted = originalPost.reposts.includes(req.userId);
    if (alreadyReposted) {
      return res.status(400).json({ error: 'Sudah di-repost' });
    }

    // Add user to original post's reposts list
    await Post.updateOne({ _id: originalPost._id }, { $addToSet: { reposts: req.userId } });

    // Create a new post representing the repost
    const repost = await Post.create({
      author: req.userId,
      content: '', // Repost doesn't have its own content
      status: 'published',
      repostOf: originalPost._id,
    });

    // Notify author of original post
    if (String(originalPost.author) !== String(req.userId)) {
      await createNotification({
        recipientId: originalPost.author,
        senderId: req.userId,
        type: 'post_repost',
        message: `@${req.user.username} me-repost postinganmu`,
        deepLink: `/post/${originalPost._id}`,
        refPostId: originalPost._id,
        refMediaPreview: originalPost.mediaUrl,
      });
    }

    const populated = await Post.findById(repost._id)
      .populate('author', AUTHOR_FIELDS)
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });

    res.status(201).json({ post: populated });
  } catch (e) {
    next(e);
  }
};

// DELETE /api/posts/:id/repost
exports.unrepost = async (req, res, next) => {
  try {
    const originalPost = await Post.findById(req.params.id);
    if (!originalPost) return res.status(404).json({ error: 'Postingan tidak ditemukan' });

    // Remove user from original post's reposts list
    await Post.updateOne({ _id: originalPost._id }, { $pull: { reposts: req.userId } });

    // Delete the repost post created by this user
    await Post.deleteOne({ author: req.userId, repostOf: originalPost._id });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// POST /api/posts/:id/quote
exports.quote = async (req, res, next) => {
  try {
    const { tags } = req.body;
    const originalPost = await Post.findById(req.params.id);
    if (!originalPost || originalPost.status !== 'published') {
      return res.status(404).json({ error: 'Postingan tidak ditemukan' });
    }

    const content = sanitizePostContent(req.body.content);
    if (!content) {
      return res.status(400).json({ error: 'Konten quote tidak boleh kosong' });
    }

    let parsedTags = tags;
    if (typeof tags === 'string') {
      try { parsedTags = JSON.parse(tags); } catch { parsedTags = []; }
    }
    const tagDocs = Array.isArray(parsedTags) ? await upsertTags(parsedTags) : [];

    const quotePost = await Post.create({
      author: req.userId,
      content,
      tags: tagDocs.map((t) => t._id),
      status: 'published',
      repostOf: originalPost._id,
    });

    await bumpTagUsage(tagDocs.map((t) => t._id), 1);

    // Notify original post's author
    if (String(originalPost.author) !== String(req.userId)) {
      await createNotification({
        recipientId: originalPost.author,
        senderId: req.userId,
        type: 'post_quote',
        message: `@${req.user.username} mengutip postinganmu`,
        deepLink: `/post/${quotePost._id}`,
        refPostId: quotePost._id,
        refMediaPreview: quotePost.mediaUrl,
      });
    }

    const populated = await Post.findById(quotePost._id)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: AUTHOR_FIELDS },
          { path: 'tags', select: 'name slug category' }
        ]
      });

    res.status(201).json({ post: populated });
  } catch (e) {
    next(e);
  }
};
