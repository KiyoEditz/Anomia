const router = require('express').Router();
const { authRequired } = require('../middleware/auth');
const { getForYouFeedCached, getRecentFeed, checkNewPosts } = require('../services/feedService');
const diversifyFeed = require('../utils/diversifyFeed');

router.get('/for-you', authRequired, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const before = req.query.before || null;

    const posts = await getForYouFeedCached(req.user._id, { limit, before });
    const diversified = diversifyFeed(posts);

    const nextCursor =
      diversified.length > 0
        ? diversified[diversified.length - 1].createdAt
        : null;

    res.json({ posts: diversified, nextCursor });
  } catch (e) {
    next(e);
  }
});

router.get('/recent', authRequired, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const before = req.query.before || null;

    const posts = await getRecentFeed(req.user._id, { limit, before });

    const nextCursor =
      posts.length > 0
        ? posts[posts.length - 1].createdAt
        : null;

    res.json({ posts, nextCursor });
  } catch (e) {
    next(e);
  }
});

router.get('/recent/check-new', authRequired, async (req, res, next) => {
  try {
    const { since } = req.query;
    if (!since) {
      return res.status(400).json({ error: 'Parameter "since" (ISO timestamp) wajib diisi' });
    }

    const newPostsCount = await checkNewPosts(req.user._id, since);

    res.json({ newPostsCount });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
