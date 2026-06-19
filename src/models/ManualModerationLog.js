const mongoose = require('mongoose');

const manualModerationLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['delete_post', 'delete_comment', 'assign_role', 'suspend_user'],
      required: true,
    },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    performedByRole: { type: String, required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    targetCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    reason: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ManualModerationLog', manualModerationLogSchema, 'moderation_logs');
