const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    senderUsername: { type: String, default: null },
    senderAvatar: { type: String, default: null },
    type: {
      type: String,
      required: true,
      enum: [
        'mention',
        'comment',
        'comment_reply',
        'comment_like',
        'post_like',
        'post_repost',
        'post_quote',
        'moderation_removed',
        'moderation_warning',
        'moderation_suspended',
        'system',
        'admin',
      ],
    },
    message: { type: String, required: true },
    deepLink: { type: String, default: null },
    refPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    refCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    refMediaPreview: { type: String, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    isBroadcast: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
