const Post = require('../models/Post');
const User = require('../models/User');
const ModerationLog = require('../models/ModerationLog');
const { createNotification } = require('../utils/notification');
const { destroyAsset } = require('../utils/cloudinary');

exports.moderation = async (req, res, next) => {
  try {
    console.log('[Webhook] Received moderation callback:', req.body);

    const publicId = req.body.public_id || req.body.publicId;
    let status = req.body.moderation_status || req.body.status; // 'approved', 'rejected', 'flagged'
    const provider = req.body.moderation_kind || req.body.provider || 'cloudinary-addon';
    const score = req.body.score || 0;
    const reason = req.body.reason || 'Cloudinary thorough scan flagging';

    if (!publicId) {
      return res.status(400).json({ error: 'public_id atau publicId wajib ada' });
    }

    if (status === 'rejected' || status === 'flagged') {
      status = 'flagged';
    } else {
      status = 'approved';
    }

    const post = await Post.findOne({ mediaPublicId: publicId });
    if (!post) {
      console.log(`[Webhook] Post with mediaPublicId ${publicId} not found.`);
      return res.json({ ok: false, message: 'Post tidak ditemukan' });
    }

    // Log the thorough scan audit trail
    await ModerationLog.create({
      postId: post._id,
      userId: post.author,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      scanStage: 'thorough',
      provider,
      status,
      score,
      rawResponse: req.body,
      reason: status === 'flagged' ? reason : '',
    });

    post.thoroughScan = {
      provider,
      status: status === 'flagged' ? 'rejected' : 'approved',
      score,
      checkedAt: new Date(),
    };

    if (status === 'flagged') {
      console.log(`[Webhook] Flagged content detected for Post ${post._id}. Removing post...`);

      if (post.mediaPublicId) {
        try {
          await destroyAsset(post.mediaPublicId, post.mediaType || 'image');
        } catch (err) {
          console.error('[Webhook] Failed to delete Cloudinary asset:', err);
        }
      }

      post.status = 'removed';
      post.removedReason = reason;
      await post.save();

      const user = await User.findById(post.author);
      if (user) {
        user.strikeCount += 1;

        let notifType = 'moderation_warning';
        let notifMessage = 'Postingan Anda telah dihapus karena melanggar ketentuan komunitas.';
        const deepLink = '/community-guidelines';

        if (user.strikeCount >= 3) {
          user.isSuspended = true;
          user.suspendedAt = new Date();
          notifType = 'moderation_suspended';
          notifMessage = 'Akun Anda telah ditangguhkan karena menerima 3 strike pelanggaran ketentuan komunitas.';
        } else {
          notifMessage = `Peringatan ${user.strikeCount}: Postingan Anda dihapus karena melanggar ketentuan komunitas.`;
        }

        await user.save();

        await createNotification({
          recipientId: user._id,
          senderId: null,
          type: notifType,
          message: notifMessage,
          deepLink,
          refPostId: post._id,
          refMediaPreview: post.mediaUrl,
        });
      }
    } else {
      await post.save();
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
