const router = require('express').Router();
const { authRequired } = require('../middleware/auth');
const { getForYouFeedCached, getRecentFeed, checkNewPosts } = require('../services/feedService');
const diversifyFeed = require('../utils/diversifyFeed');

router.get('/for-you', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const posts = await getForYouFeedCached(req.user._id, { page, limit });
    const diversified = diversifyFeed(posts);

    res.json({ posts: diversified, page });
  } catch (e) {
    next(e);
  }
});

router.get('/recent', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const posts = await getRecentFeed(req.user._id, { page, limit });

    res.json({ posts, page });
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
