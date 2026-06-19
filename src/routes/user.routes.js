const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { authRequired } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const requireRole = require('../middleware/requireRole');

router.patch('/me', authRequired, ctrl.updateMe);
router.post('/me/avatar', authRequired, uploadSingle('file'), ctrl.uploadAvatar);
router.post('/me/banner', authRequired, uploadSingle('file'), ctrl.uploadBanner);
router.get('/moderators', authRequired, requireRole('dev'), ctrl.listModerators);
router.get('/moderation-logs', authRequired, requireRole('dev', 'mod'), ctrl.listModerationLogs);
router.get('/:username', ctrl.getByUsername);
router.post('/:username/follow', authRequired, ctrl.follow);
router.delete('/:username/follow', authRequired, ctrl.unfollow);
router.patch('/:userId/role', authRequired, requireRole('dev'), ctrl.assignRole);
router.patch('/:userId/suspend', authRequired, requireRole('dev'), ctrl.suspendUser);

module.exports = router;
