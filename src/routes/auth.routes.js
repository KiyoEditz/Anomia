const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authRequired } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/authRateLimiter');

router.post('/register', registerLimiter, ctrl.register);
router.post('/login', loginLimiter, ctrl.login);
router.get('/me', authRequired, ctrl.me);

module.exports = router;
