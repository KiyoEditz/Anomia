const rateLimit = require('express-rate-limit');

// --- Brute Force Login ---
// Maks 8 percobaan login GAGAL per IP per hari.
const loginLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 jam
  max: 8,
  skipSuccessfulRequests: true, // Login berhasil tidak menghabiskan kuota
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[Security] Brute force terdeteksi dari IP: ${req.ip}`);
    return res.status(429).json({
      error: 'Terlalu banyak percobaan login. Coba lagi besok.',
      retryAfter: '24 jam',
    });
  },
});

// --- Registrasi Massal ---
// Maks 3 akun baru per IP dalam 1 jam.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 3,
  skipSuccessfulRequests: false, // Registrasi berhasil pun dihitung
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`[Security] Registrasi massal dari IP: ${req.ip}`);
    return res.status(429).json({
      error: 'Terlalu banyak akun dibuat dari jaringan ini. Coba lagi dalam 1 jam.',
    });
  },
});

module.exports = { loginLimiter, registerLimiter };
