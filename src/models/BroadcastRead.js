const mongoose = require('mongoose');

const broadcastReadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, index: true },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

broadcastReadSchema.index({ userId: 1, broadcastId: 1 }, { unique: true });

module.exports = mongoose.model('BroadcastRead', broadcastReadSchema);
