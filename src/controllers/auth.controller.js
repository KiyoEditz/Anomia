const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

exports.register = async (req, res, next) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username dan password wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'password minimal 6 karakter' });
    }

    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'username sudah dipakai' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      passwordHash,
      displayName: displayName || username,
    });

    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username dan password wajib diisi' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'username atau password salah' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'username atau password salah' });

    const token = signToken(user._id);
    res.json({ token, user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ user: user.toPublicJSON() });
  } catch (e) {
    next(e);
  }
};
