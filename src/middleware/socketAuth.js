const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware autentikasi Socket.io — memverifikasi token JWT saat handshake.
// Identitas & role diambil dari DB, BUKAN dari payload yang dikirim client,
// sehingga seseorang tidak bisa menyamar sebagai user/role lain.
async function socketAuth(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token || token === 'null' || token === 'undefined') {
      return next(new Error('SOCKET_UNAUTHORIZED: Token tidak ditemukan.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'anomia',
    });

    const user = await User.findById(decoded.sub).select('_id username role isSuspended');

    if (!user) {
      return next(new Error('SOCKET_UNAUTHORIZED: User tidak ditemukan.'));
    }
    if (user.isSuspended) {
      return next(new Error('SOCKET_UNAUTHORIZED: Akun ditangguhkan.'));
    }

    socket.user = {
      _id: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('SOCKET_UNAUTHORIZED: Sesi berakhir. Silakan login ulang.'));
    }
    return next(new Error('SOCKET_UNAUTHORIZED: Token tidak valid.'));
  }
}

module.exports = socketAuth;
