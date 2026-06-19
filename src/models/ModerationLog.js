const mongoose = require('mongoose');

const moderationLogSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    mediaUrl: { type: String, default: '' },
    mediaType: { type: String, enum: ['image', 'video', ''], default: '' },
    scanStage: { type: String, enum: ['quick', 'thorough'], required: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ['approved', 'rejected', 'flagged'], required: true },
    score: { type: Number, default: 0 },
    rawResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ModerationLog', moderationLogSchema);
