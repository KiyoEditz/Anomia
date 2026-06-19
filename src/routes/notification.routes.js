const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authRequired, adminRequired } = require('../middleware/auth');

router.get('/', authRequired, ctrl.list);
router.get('/unread-count', authRequired, ctrl.unreadCount);
router.patch('/read-all', authRequired, ctrl.readAll);
router.patch('/:id/read', authRequired, ctrl.read);
router.delete('/:id', authRequired, ctrl.remove);
router.post('/admin', authRequired, adminRequired, ctrl.createAdminNotification);

module.exports = router;
