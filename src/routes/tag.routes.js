const router = require('express').Router();
const ctrl = require('../controllers/tag.controller');
const { authRequired } = require('../middleware/auth');

router.get('/categories', ctrl.categories);
router.get('/popular', ctrl.popular);
router.get('/', ctrl.search);
router.post('/', authRequired, ctrl.create);
router.get('/:slug', ctrl.detailBySlug);

module.exports = router;
