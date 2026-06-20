const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_]([a-zA-Z0-9_.]*[a-zA-Z0-9_])?$/,
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, trim: true, maxlength: 50 },
    bio: { type: String, maxlength: 280, default: '' },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' },
    bannerUrl: { type: String, default: '' },
    bannerPublicId: { type: String, default: '' },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    strikeCount: { type: Number, default: 0 },
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    role: { type: String, enum: ['user', 'mod', 'dev'], default: 'user' },
    roleAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    roleAssignedAt: { type: Date, default: null },
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    username: this.username,
    displayName: this.displayName,
    bio: this.bio,
    avatarUrl: this.avatarUrl,
    bannerUrl: this.bannerUrl,
    followersCount: this.followers.length,
    followingCount: this.following.length,
    followers: this.followers,
    following: this.following,
    role: this.role,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
