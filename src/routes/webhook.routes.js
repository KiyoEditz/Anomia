const router = require('express').Router();
const ctrl = require('../controllers/webhook.controller');

router.post('/moderation', ctrl.moderation);

module.exports = router;
