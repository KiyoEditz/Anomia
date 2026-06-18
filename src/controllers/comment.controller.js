const Comment = require('../models/Comment');
const Post = require('../models/Post');

exports.list = async (req, res, next) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate('author', 'username displayName');
    res.json({ comments });
  } catch (e) {
    next(e);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content tidak boleh kosong' });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post tidak ditemukan' });

    const comment = await Comment.create({
      post: post._id,
      author: req.userId,
      content,
    });
    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
    const populated = await Comment.findById(comment._id).populate('author', 'username displayName');
    res.status(201).json({ comment: populated });
  } catch (e) {
    next(e);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment tidak ditemukan' });
    if (!comment.author.equals(req.userId)) {
      return res.status(403).json({ error: 'Bukan comment milik Anda' });
    }
    if (comment.post.toString() !== req.params.id) {
      return res.status(400).json({ error: 'Comment tidak cocok dengan post' });
    }
    await comment.deleteOne();
    await Post.updateOne({ _id: comment.post }, { $inc: { commentsCount: -1 } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
