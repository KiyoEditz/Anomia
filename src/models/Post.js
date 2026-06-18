const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    embedUrl: { type: String, default: '' },
    isAnonymous: { type: Boolean, default: false },
    anonymousName: { type: String, default: '' },
    mood: { type: String, default: 'default' },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag', index: true }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

postSchema.index({ tags: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
