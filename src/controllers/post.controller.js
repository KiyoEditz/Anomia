const Post = require('../models/Post');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Comment = require('../models/Comment');
const { upsertTags, splitCsv, parseTagQuery } = require('../utils/tags');
const { uploadBuffer, destroyAsset } = require('../utils/cloudinary');

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

const ANONYMOUS_PSEUDONYMS = [
  'Pena Misterius',
  'Siluet Malam',
  'Penjelajah Sunyi',
  'Gema Angin',
  'Bayang Senja',
  'Bisikan Malam',
  'Pembaca Sandi',
  'Pemikir Bebas',
  'Arwah Digital',
  'Kabut Pagi'
];

function anonymizePost(post, currentUserId) {
  if (!post) return null;
  const postObj = post.toObject ? post.toObject() : post;
  
  const authorId = postObj.author && (postObj.author._id || postObj.author);
  const isMine = currentUserId ? String(authorId) === String(currentUserId) : false;
  
  if (postObj.isAnonymous) {
    postObj.author = {
      _id: 'anonim',
      username: 'anonim',
      displayName: postObj.anonymousName || 'Bisikan Misterius',
      avatarUrl: '',
      bio: 'Akun anonim di Anonimbuz.'
    };
  }
  
  postObj.isMine = isMine;
  return postObj;
}

exports.create = async (req, res, next) => {
  try {
    const { content, embedUrl, isAnonymous, mood } = req.body;
    let { tags } = req.body;
    if (typeof tags === 'string') {
      try { tags = JSON.parse(tags); } catch { tags = []; }
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content tidak boleh kosong' });
    }
    const tagDocs = Array.isArray(tags) ? await upsertTags(tags) : [];

    const anonName = isAnonymous
      ? ANONYMOUS_PSEUDONYMS[Math.floor(Math.random() * ANONYMOUS_PSEUDONYMS.length)]
      : '';

    const post = await Post.create({
      author: req.userId,
      content,
      tags: tagDocs.map((t) => t._id),
      embedUrl: embedUrl || '',
      isAnonymous: !!isAnonymous,
      anonymousName: anonName,
      mood: mood || 'default',
    });
    await bumpTagUsage(tagDocs.map((t) => t._id), 1);
    const populated = await Post.findById(post._id)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    res.status(201).json({ post: anonymizePost(populated, req.userId) });
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
    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    
    const anonymized = posts.map((p) => anonymizePost(p, req.userId));
    res.json({ posts: anonymized, page });
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
    const posts = await Post.find({ ...baseFilter, author: { $in: authorIds } })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    
    const anonymized = posts.map((p) => anonymizePost(p, req.userId));
    res.json({ posts: anonymized });
  } catch (e) {
    next(e);
  }
};

exports.detail = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username displayName bio avatarUrl')
      .populate('tags', 'name slug category');
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });
    res.json({ post: anonymizePost(post, req.userId) });
  } catch (e) {
    next(e);
  }
};

exports.listByUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    
    const query = { author: user._id };
    if (String(user._id) !== String(req.userId)) {
      query.isAnonymous = false;
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('author', AUTHOR_FIELDS)
      .populate('tags', 'name slug category');
    
    const anonymized = posts.map((p) => anonymizePost(p, req.userId));
    res.json({ posts: anonymized });
  } catch (e) {
    next(e);
  }
};

exports.like = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });
    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: req.userId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.unlike = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });
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
