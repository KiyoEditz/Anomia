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

    const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'image' });
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
