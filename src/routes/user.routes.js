const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { authRequired } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

router.patch('/me', authRequired, ctrl.updateMe);
router.post('/me/avatar', authRequired, uploadSingle('file'), ctrl.uploadAvatar);
router.post('/me/banner', authRequired, uploadSingle('file'), ctrl.uploadBanner);
router.get('/:username', ctrl.getByUsername);
router.post('/:username/follow', authRequired, ctrl.follow);
router.delete('/:username/follow', authRequired, ctrl.unfollow);

module.exports = router;
