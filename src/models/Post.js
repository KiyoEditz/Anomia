const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    mediaUrl: { type: String, default: '' },
    mediaPublicId: { type: String, default: '' },
    mediaType: { type: String, enum: ['image', 'video', ''], default: '' },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag', index: true }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentsCount: { type: Number, default: 0 },
    status: { type: String, enum: ['published', 'removed'], default: 'published', index: true },
    quickScan: {
      provider: { type: String, default: '' },
      result: { type: String, default: '' },
      score: { type: Number, default: 0 },
      checkedAt: { type: Date, default: null }
    },
    thoroughScan: {
      provider: { type: String, default: '' },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      score: { type: Number, default: 0 },
      checkedAt: { type: Date, default: null }
    },
    removedReason: { type: String, default: null },
  },
  { timestamps: true }
);

postSchema.index({ tags: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
