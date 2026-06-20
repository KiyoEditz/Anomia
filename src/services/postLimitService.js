const PostLimit = require('../models/PostLimit');
const { createNotification } = require('../utils/notification');
const { DAILY_LIMIT, WARNING_THRESHOLD } = require('../config/postLimits');
const { getToday } = require('../utils/date');

const incrementPostCount = async (userId, currentRecord, newRapidStreak) => {
  const newCount = (currentRecord.postCount || 0) + 1;
  const today = getToday();
  const now = new Date();

  const updateData = {
    postCount: newCount,
    lastPostAt: now,
    rapidPostStreak: newRapidStreak,
    suspendUntil: null
  };

  // Warning di post ke-30
  if (newCount === WARNING_THRESHOLD && !currentRecord.warningIssued) {
    updateData.warningIssued = true;
    await createNotification({
      recipientId: userId,
      type: 'system',
      message: `Kamu sudah membuat ${WARNING_THRESHOLD} postingan hari ini. Batas harian adalah ${DAILY_LIMIT} postingan.`,
    });
  }

  // Block di post ke-50
  if (newCount >= DAILY_LIMIT) {
    updateData.limitReached = true;
    await createNotification({
      recipientId: userId,
      type: 'system',
      message: `Kamu telah mencapai batas ${DAILY_LIMIT} postingan untuk hari ini. Kemampuan posting akan pulih besok.`,
    });
  }

  await PostLimit.updateOne({ userId, date: today }, { $set: updateData });
};

module.exports = { incrementPostCount };
