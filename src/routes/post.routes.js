const router = require('express').Router();
const ctrl = require('../controllers/post.controller');
const commentCtrl = require('../controllers/comment.controller');
const { authRequired } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

const requireRole = require('../middleware/requireRole');

router.post('/', authRequired, uploadSingle('file'), ctrl.create);
router.get('/', ctrl.list);
router.get('/feed', authRequired, ctrl.feed);
router.get('/user/:username', ctrl.listByUser);
router.get('/:id', ctrl.detail);
router.post('/:id/like', authRequired, ctrl.like);
router.delete('/:id/like', authRequired, ctrl.unlike);
router.delete('/:id/moderate', authRequired, requireRole('dev', 'mod'), ctrl.moderateRemove);
router.delete('/:id', authRequired, ctrl.remove);

router.get('/:id/comments', commentCtrl.list);
router.post('/:id/comments', authRequired, commentCtrl.create);
router.delete('/:id/comments/:commentId', authRequired, commentCtrl.remove);
router.post('/:id/comments/:commentId/like', authRequired, commentCtrl.like);
router.delete('/:id/comments/:commentId/like', authRequired, commentCtrl.unlike);

module.exports = router;
