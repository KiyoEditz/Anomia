const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  // Tolak token yang hilang atau berupa string literal "null"/"undefined"
  // yang sering terkirim dari frontend saat belum login.
  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }

  try {
    // Verifikasi kriptografi yang ketat: kunci HANYA algoritma yang kita pakai
    // (cegah algorithm-confusion / alg:none) dan wajibkan issuer yang cocok.
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'anomia',
    });
    req.userId = payload.sub;

    // Cross-check ke DB — jangan percaya payload token 100%. Role diambil dari DB.
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User tidak ditemukan' });
    if (user.isSuspended) {
      return res.status(403).json({ error: 'Akun Anda ditangguhkan karena pelanggaran ketentuan komunitas.' });
    }

    req.user = user;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesi berakhir. Silakan login ulang.' });
    }
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
