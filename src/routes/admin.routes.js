const router = require('express').Router();
const notificationCtrl = require('../controllers/notification.controller');
const { authRequired, adminRequired } = require('../middleware/auth');

router.post('/notifications', authRequired, adminRequired, notificationCtrl.createAdminNotification);

module.exports = router;
