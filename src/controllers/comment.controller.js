const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');
const { createNotification } = require('../utils/notification');

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
    const { content, parentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content tidak boleh kosong' });
    }
    const post = await Post.findById(req.params.id);
    if (!post || post.status === 'removed') return res.status(404).json({ error: 'Post tidak ditemukan' });

    let parentComment = null;
    if (parentId) {
      parentComment = await Comment.findById(parentId);
      if (!parentComment) return res.status(404).json({ error: 'Comment induk tidak ditemukan' });
    }

    const comment = await Comment.create({
      post: post._id,
      author: req.userId,
      content,
      parentId: parentComment ? parentComment._id : null,
    });

    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });

    // 1. Trigger Comment/Reply Notification
    if (parentComment) {
      await createNotification({
        recipientId: parentComment.author,
        senderId: req.userId,
        type: 'comment_reply',
        message: `@${req.user.username} membalas komentarmu`,
        deepLink: `/post/${post._id}`,
        refPostId: post._id,
        refCommentId: comment._id,
        refMediaPreview: post.mediaUrl,
      });
    } else {
      await createNotification({
        recipientId: post.author,
        senderId: req.userId,
        type: 'comment',
        message: `@${req.user.username} mengomentari postinganmu`,
        deepLink: `/post/${post._id}`,
        refPostId: post._id,
        refCommentId: comment._id,
        refMediaPreview: post.mediaUrl,
      });
    }

    // 2. Trigger Mentions
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
          message: `@${req.user.username} menyebutmu di sebuah komentar`,
          deepLink: `/post/${post._id}`,
          refPostId: post._id,
          refCommentId: comment._id,
          refMediaPreview: post.mediaUrl,
        });
      }
    }

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

exports.like = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment tidak ditemukan' });

    const wasLiked = comment.likes.includes(req.userId);
    await Comment.updateOne({ _id: comment._id }, { $addToSet: { likes: req.userId } });

    if (!wasLiked) {
      const post = await Post.findById(comment.post);
      await createNotification({
        recipientId: comment.author,
        senderId: req.userId,
        type: 'comment_like',
        message: `@${req.user.username} menyukai komentarmu`,
        deepLink: `/post/${comment.post}`,
        refPostId: comment.post,
        refCommentId: comment._id,
        refMediaPreview: post ? post.mediaUrl : null,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.unlike = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment tidak ditemukan' });

    await Comment.updateOne({ _id: comment._id }, { $pull: { likes: req.userId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
