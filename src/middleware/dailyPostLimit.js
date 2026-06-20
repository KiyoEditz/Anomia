const PostLimit = require('../models/PostLimit');
const { createNotification } = require('../utils/notification');
const { DAILY_LIMIT, WARNING_THRESHOLD, RAPID_STREAK_LIMIT, SUSPEND_MINUTES } = require('../config/postLimits');
const { getToday } = require('../utils/date');

const dailyPostLimit = async (req, res, next) => {
  const userId = req.userId;
  const today = getToday();
  const now = new Date();

  try {
    // Ambil atau buat record hari ini
    let record = await PostLimit.findOneAndUpdate(
      { userId, date: today },
      { $setOnInsert: { postCount: 0, warningIssued: false, limitReached: false, rapidPostStreak: 0 } },
      { upsert: true, new: true }
    );

    // Cek suspend sementara (hasil deteksi bot)
    if (record.suspendUntil && new Date(record.suspendUntil) > now) {
      const menitSisa = Math.ceil((new Date(record.suspendUntil) - now) / 60000);
      return res.status(429).json({
        message: `Akunmu dibatasi sementara karena aktivitas mencurigakan. Coba lagi dalam ${menitSisa} menit.`,
      });
    }

    // Cek apakah sudah mencapai limit harian
    if (record.limitReached || record.postCount >= DAILY_LIMIT) {
      return res.status(429).json({
        message: 'Kamu sudah mencapai batas 50 postingan hari ini. Coba lagi besok.',
        postsToday: record.postCount,
        limit: DAILY_LIMIT
      });
    }

    // Deteksi rapid-post streak (bot behavior)
    const secondsSinceLast = record.lastPostAt
      ? (now - new Date(record.lastPostAt)) / 1000 : 999;

    const newStreak = secondsSinceLast < 30
      ? (record.rapidPostStreak || 0) + 1
      : 0;

    if (newStreak >= RAPID_STREAK_LIMIT) {
      const suspendUntil = new Date(now.getTime() + SUSPEND_MINUTES * 60 * 1000);
      await PostLimit.updateOne({ userId, date: today }, {
        $set: { suspendUntil, rapidPostStreak: 0 }
      });
      await createNotification({
        recipientId: userId,
        type: 'system',
        message: `Aktivitas akunmu terdeteksi tidak normal. Kemampuan posting dibatasi selama ${SUSPEND_MINUTES} menit.`,
      });
      return res.status(429).json({
        message: `Aktivitas mencurigakan terdeteksi. Kemampuan posting dibatasi ${SUSPEND_MINUTES} menit.`
      });
    }

    // Simpan info ke req untuk dipakai setelah post berhasil disimpan
    req.postLimitRecord = record;
    req.newRapidStreak = newStreak;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = dailyPostLimit;
