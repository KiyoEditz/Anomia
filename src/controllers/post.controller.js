const Post = require('../models/Post');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Comment = require('../models/Comment');
const { upsertTags, splitCsv, parseTagQuery } = require('../utils/tags');
const { uploadBuffer, destroyAsset } = require('../utils/cloudinary');
const { createNotification } = require('../utils/notification');
const { quickScan } = require('../utils/moderation');

const AUTHOR_FIELDS = 'username displayName avatarUrl';

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
    const { content } = req.body;
    let { tags } = req.body;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch { tags = []; }
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content tidak boleh kosong' });
    }

    // Run Quick Scan on media file if it exists
    let scanResult = null;
    if (req.file) {
      scanResult = await quickScan(req.file.buffer, req.file.mimetype, content, req.userId);
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
      const result = await uploadBuffer(req.file.buffer, {
        folder: 'anomia/posts',
        resourceType: mediaType,
      });
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
      quickScan: scanResult ? {
        provider: scanResult.provider,
        result: scanResult.isApproved ? 'approved' : 'rejected',
        score: scanResult.score,
        checkedAt: new Date(),
      } : undefined,
    });

    await bumpTagUsage(tagDocs.map((t) => t._id), 1);

    // Parse mentions and trigger notifications
    const mentions = [...new Set(content.match(/@([a-zA-Z0-9_]+)/g) || [])]
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

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
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
    if (baseFilter._impossible) return res.json({ posts: [] });
    delete baseFilter._impossible;

    const posts = await Post.find({
      ...baseFilter,
      author: { $in: authorIds },
      status: 'published',
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    res.json({ posts });
  } catch (e) {
    next(e);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username displayName bio avatarUrl')
      .populate('tags', 'name slug category');
    if (!post || post.status === 'removed') return res.status(404).json({ error: 'Post tidak ditemukan' });
    res.json({ post });
  } catch (e) {
    next(e);
  }
};

exports.listByUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    const posts = await Post.find({ author: user._id, status: 'published' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    res.json({ posts });
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
