const rateLimit = require('express-rate-limit');
const { getRealIp } = require('../utils/realIp');

// Limit global: semua endpoint
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 menit
  max: 200,                   // maks 200 request per IP per 15 menit
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRealIp(req),
  message: { message: 'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.' }
});

// Limit spesifik untuk endpoint post (lebih ketat)
const postEndpointLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 menit
  max: 10,              // maks 10 request ke POST /api/posts per menit per IP
  keyGenerator: (req) => getRealIp(req),
  message: { message: 'Terlalu banyak permintaan posting. Tunggu sebentar.' }
});

module.exports = { globalLimiter, postEndpointLimiter };
