const User = require('../models/User');
const { uploadBuffer, destroyAsset } = require('../utils/cloudinary');

exports.updateMe = async (req, res, next) => {
  try {
    const { displayName, bio } = req.body;
    const update = {};
    if (displayName !== undefined) update.displayName = String(displayName).slice(0, 50);
    if (bio !== undefined) update.bio = String(bio).slice(0, 280);
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
};

exports.getByUsername = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
};

exports.follow = async (req, res, next) => {
  try {
    const target = await User.findOne({ username: req.params.username });
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (target._id.equals(req.userId)) {
      return res.status(400).json({ error: 'Tidak bisa follow diri sendiri' });
    }

    await User.updateOne({ _id: req.userId }, { $addToSet: { following: target._id } });
    await User.updateOne({ _id: target._id }, { $addToSet: { followers: req.userId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

exports.unfollow = async (req, res, next) => {
  try {
    const target = await User.findOne({ username: req.params.username });
    if (!target) return res.status(404).json({ error: 'User tidak ditemukan' });

    await User.updateOne({ _id: req.userId }, { $pull: { following: target._id } });
    await User.updateOne({ _id: target._id }, { $pull: { followers: req.userId } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

async function uploadProfileMedia(req, res, next, { field, folder }) {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'File harus berupa gambar' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const uploadOptions = { folder, resourceType: 'image' };
    if (req.file.mimetype === 'image/gif') {
      uploadOptions.format = 'webp';
    }

    const result = await uploadBuffer(req.file.buffer, uploadOptions);
    const oldPublicId = user[`${field}PublicId`];

    user[`${field}Url`] = result.secure_url;
    user[`${field}PublicId`] = result.public_id;
    await user.save();

    if (oldPublicId) destroyAsset(oldPublicId, 'image');

    res.json({ user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
}

exports.uploadAvatar = (req, res, next) =>
  uploadProfileMedia(req, res, next, { field: 'avatar', folder: 'anomia/avatars' });

exports.uploadBanner = (req, res, next) =>
  uploadProfileMedia(req, res, next, { field: 'banner', folder: 'anomia/banners' });

const ManualModerationLog = require('../models/ManualModerationLog');
const { createNotification } = require('../utils/notification');

// PATCH /api/users/:userId/role (Developer only)
exports.assignRole = async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!role || !['user', 'mod'].includes(role)) {
      return res.status(400).json({ error: 'Role harus mod atau user' });
    }

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    if (targetUser.role === 'dev') {
      return res.status(403).json({ error: 'Role Developer tidak bisa diubah.' });
    }

    targetUser.role = role;
    targetUser.roleAssignedBy = req.userId;
    targetUser.roleAssignedAt = new Date();
    await targetUser.save();

    // Log the manual moderation action
    await ManualModerationLog.create({
      action: 'assign_role',
      performedBy: req.userId,
      performedByRole: req.user.role,
      targetUserId: targetUser._id,
      reason: `Mengubah role ke ${role}`,
    });

    res.json({
      message: 'Role berhasil diperbarui.',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        role: targetUser.role,
      },
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/users/moderators (Developer only)
exports.listModerators = async (req, res, next) => {
  try {
    const moderators = await User.find({ role: { $in: ['mod', 'dev'] } })
      .populate('roleAssignedBy', 'username displayName');
    
    res.json({ moderators });
  } catch (e) {
    next(e);
  }
};

// PATCH /api/users/:userId/suspend (Developer only)
exports.suspendUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Alasan penangguhan wajib diisi' });
    }

    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    if (targetUser.role === 'dev') {
      return res.status(403).json({ error: 'Tidak dapat menangguhkan Developer.' });
    }

    targetUser.isSuspended = true;
    targetUser.suspendedAt = new Date();
    await targetUser.save();

    // Log action
    await ManualModerationLog.create({
      action: 'suspend_user',
      performedBy: req.userId,
      performedByRole: req.user.role,
      targetUserId: targetUser._id,
      reason,
    });

    // Notify user
    await createNotification({
      recipientId: targetUser._id,
      senderId: null,
      type: 'moderation_suspended',
      message: `Akun Anda ditangguhkan secara manual oleh Developer. Alasan: ${reason}`,
    });

    res.json({ message: 'Akun user berhasil ditangguhkan.' });
  } catch (e) {
    next(e);
  }
};

// GET /api/users/moderation-logs (dev + mod only)
exports.listModerationLogs = async (req, res, next) => {
  try {
    const logs = await ManualModerationLog.find()
      .sort({ createdAt: -1 })
      .populate('performedBy', 'username displayName')
      .populate('targetUserId', 'username displayName')
      .populate('targetPostId')
      .populate('targetCommentId');
    res.json({ logs });
  } catch (e) {
    next(e);
  }
};
