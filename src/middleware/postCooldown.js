const PostLimit = require('../models/PostLimit');
const { getToday } = require('../utils/date');

const COOLDOWN_SECONDS = 30;

const postCooldown = async (req, res, next) => {
  const userId = req.userId;
  const now = new Date();

  try {
    const record = await PostLimit.findOne({ userId, date: getToday() });

    if (record?.lastPostAt) {
      const secondsSinceLast = (now - new Date(record.lastPostAt)) / 1000;

      if (secondsSinceLast < COOLDOWN_SECONDS) {
        const sisaDetik = Math.ceil(COOLDOWN_SECONDS - secondsSinceLast);
        return res.status(429).json({
          message: `Posting terlalu cepat. Tunggu ${sisaDetik} detik lagi.`,
          retryAfter: sisaDetik
        });
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = postCooldown;
