const { isBotUserAgent } = require('../utils/botSignatures');
const { analyzeHeaderFingerprint } = require('../utils/headerFingerprint');

const requestFingerprint = (options = {}) => {
  const {
    blockBots = true,
    logOnly = false,
  } = options;

  return (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const fingerprint = analyzeHeaderFingerprint(req.headers);
    const botUA = isBotUserAgent(userAgent);

    const isSuspicious = botUA || fingerprint.isLikelyBot;

    if (isSuspicious) {
      console.warn('[BotDetect]', {
        ip: req.ip,
        path: req.path,
        userAgent,
        issues: fingerprint.issues,
        botUA,
        time: new Date().toISOString(),
      });

      if (!logOnly && blockBots) {
        return res.status(403).json({ message: 'Akses ditolak.' });
      }
    }

    next();
  };
};

module.exports = requestFingerprint;
