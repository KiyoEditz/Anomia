const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
    if (user.isSuspended) {
      return res.status(403).json({ error: 'Akun Anda ditangguhkan karena pelanggaran ketentuan komunitas.' });
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || (req.user.role !== 'dev' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Akses ditolak: Hanya Developer/Admin yang diizinkan' });
  }
  next();
}

module.exports = { authRequired, adminRequired };
