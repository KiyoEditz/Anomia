const mongoose = require('mongoose');

const postLimitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format "YYYY-MM-DD"
    postCount: { type: Number, default: 0 },
    warningIssued: { type: Boolean, default: false },
    limitReached: { type: Boolean, default: false },
    lastPostAt: { type: Date, default: null },
    rapidPostStreak: { type: Number, default: 0 },
    suspendUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

postLimitSchema.index({ userId: 1, date: 1 }, { unique: true });
postLimitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('PostLimit', postLimitSchema);
