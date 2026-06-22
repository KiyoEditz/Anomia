const { containsBlockedLink } = require('../services/blockedLinksService');

const linkBlocklistCheck = async (req, res, next) => {
  const { content } = req.body;

  try {
    const result = await containsBlockedLink(content);

    if (result.blocked) {
      return res.status(400).json({
        message: 'Postingan mengandung tautan yang tidak diizinkan.'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = linkBlocklistCheck;
