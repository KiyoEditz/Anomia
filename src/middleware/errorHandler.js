const multer = require('multer');
const handleMongoError = require('../utils/handleMongoError');

// Pesan generik & konsisten per status code. Detail teknis tidak pernah
// dikirim ke client — hanya masuk ke log server.
const SAFE_MESSAGES = {
  400: 'Permintaan tidak valid.',
  401: 'Unauthorized.',
  403: 'Akses ditolak.',
  404: 'Data tidak ditemukan.',
  409: 'Terjadi konflik data.',
  413: 'Ukuran file terlalu besar.',
  429: 'Terlalu banyak permintaan.',
  500: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.',
};

// Middleware error terakhir — pasang setelah semua route di server.js.
function errorHandler(err, req, res, next) {
  // Log detail lengkap HANYA ke server console — tidak pernah ke response.
  console.error('[Error]', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Error upload (multer) — pesan ringkas, tanpa detail internal.
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: SAFE_MESSAGES[status] });
  }

  // Error Mongoose/MongoDB — petakan ke pesan aman.
  const mongoMapped = handleMongoError(err);
  if (mongoMapped) {
    return res.status(mongoMapped.statusCode).json({ error: mongoMapped.message });
  }

  // Hormati status yang sudah diset (mis. err.status / err.statusCode),
  // tapi pesan ke client tetap generik sesuai status code.
  const statusCode = err.statusCode || err.status || 500;

  return res.status(statusCode).json({
    error: SAFE_MESSAGES[statusCode] || SAFE_MESSAGES[500],
  });
}

module.exports = errorHandler;
