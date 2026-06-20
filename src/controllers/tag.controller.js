const Tag = require('../models/Tag');
const Post = require('../models/Post');
const { upsertTags, splitCsv } = require('../utils/tags');

exports.categories = (req, res) => {
  res.json({ categories: Tag.schema.path('category').enumValues });
};

exports.search = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const q = {};
    if (category) q.category = category;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      q.name = { $regex: safe, $options: 'i' };
    }
    const tags = await Tag.find(q).sort({ usageCount: -1, name: 1 }).limit(20);
    res.json({ tags });
  } catch (e) {
    next(e);
  }
};

exports.popular = async (req, res, next) => {
  try {
    const tags = await Tag.find({ usageCount: { $gt: 0 } })
      .sort({ usageCount: -1 })
      .limit(30);
    res.json({ tags });
  } catch (e) {
    next(e);
  }
};

exports.detailBySlug = async (req, res, next) => {
  try {
    const tag = await Tag.findOne({ slug: req.params.slug.toLowerCase() });
    if (!tag) return res.status(404).json({ error: 'Tag tidak ditemukan' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const sort = req.query.sort === 'popular' ? { 'likesCount': -1, createdAt: -1 } : { createdAt: -1 };

    const posts = await Post.find({ tags: tag._id })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', 'username displayName avatarUrl role')
      .populate('tags', 'name slug category')
      .populate({
        path: 'repostOf',
        populate: [
          { path: 'author', select: 'username displayName avatarUrl role' },
          { path: 'tags', select: 'name slug category' }
        ]
      });

    res.json({ tag, posts, page });
  } catch (e) {
    next(e);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'name dan category wajib diisi' });
    }
    const tags = await upsertTags([{ name, category }]);
    if (tags.length === 0) {
      return res.status(400).json({ error: 'Gagal membuat tag (cek kategori valid)' });
    }
    res.status(201).json({ tag: tags[0] });
  } catch (e) {
    next(e);
  }
};
