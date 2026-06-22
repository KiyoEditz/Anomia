const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authRequired } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/authRateLimiter');
const requestFingerprint = require('../middleware/requestFingerprint');
const honeypotCheck = require('../middleware/honeypotCheck');
const turnstileCheck = require('../middleware/turnstileCheck');

router.post('/register',
  requestFingerprint({ blockBots: true }),
  honeypotCheck,
  registerLimiter,
  turnstileCheck,
  ctrl.register
);
router.post('/login',
  requestFingerprint({ blockBots: true }),
  honeypotCheck,
  loginLimiter,
  turnstileCheck,
  ctrl.login
);
router.get('/me', authRequired, ctrl.me);

module.exports = router;
