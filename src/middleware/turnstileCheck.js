const { verifyTurnstileToken } = require('../utils/verifyTurnstile');

const turnstileCheck = async (req, res, next) => {
  if (!process.env.TURNSTILE_SECRET_KEY) return next();

  const token = req.body.turnstileToken;
  const clientIp = req.ip;

  try {
    const isHuman = await verifyTurnstileToken(token, clientIp);

    if (!isHuman) {
      return res.status(403).json({ message: 'Verifikasi gagal. Coba lagi.' });
    }
  } catch (err) {
    console.error('[Turnstile] Verification error:', err.message);
  }

  next();
};

module.exports = turnstileCheck;
