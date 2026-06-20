const Post = require('../models/Post');
const { hashContent } = require('../utils/contentHash');

const contentDedup = async (req, res, next) => {
  const { content } = req.body;
  if (!content || content.trim().length === 0) return next();

  try {
    const hash = hashContent(content);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const duplicate = await Post.findOne({
      author: req.userId,
      contentHash: hash,
      createdAt: { $gte: yesterday },
      status: 'published'
    });

    if (duplicate) {
      return res.status(409).json({
        message: 'Kamu sudah membuat postingan dengan konten yang sama hari ini.'
      });
    }

    req.contentHash = hash;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = contentDedup;
