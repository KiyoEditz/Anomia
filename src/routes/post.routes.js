const router = require('express').Router();
const ctrl = require('../controllers/post.controller');
const commentCtrl = require('../controllers/comment.controller');
const { authRequired, authOptional } = require('../middleware/auth');

router.post('/', authRequired, ctrl.create);
router.get('/', authOptional, ctrl.list);
router.get('/feed', authRequired, ctrl.feed);
router.get('/user/:username', authOptional, ctrl.listByUser);
router.get('/:id', authOptional, ctrl.detail);
router.post('/:id/like', authRequired, ctrl.like);
router.delete('/:id/like', authRequired, ctrl.unlike);
router.delete('/:id', authRequired, ctrl.remove);

router.get('/:id/comments', commentCtrl.list);
router.post('/:id/comments', authRequired, commentCtrl.create);
router.delete('/:id/comments/:commentId', authRequired, commentCtrl.remove);

module.exports = router;
