const router = require('express').Router();
const commentCtrl = require('../controllers/comment.controller');
const { authRequired } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

router.get('/user/:username', commentCtrl.listByUser);
router.delete('/:commentId/moderate', authRequired, requireRole('dev', 'mod'), commentCtrl.moderateRemove);

module.exports = router;
