const mongoose = require('mongoose');

const blockedLinkSchema = new mongoose.Schema(
  {
    pattern: { type: String, required: true, trim: true, lowercase: true },
    matchType: { type: String, enum: ['exact', 'pattern'], required: true },
    reason: { type: String, default: '' },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

blockedLinkSchema.index({ pattern: 1 }, { unique: true });

module.exports = mongoose.model('BlockedLink', blockedLinkSchema);
