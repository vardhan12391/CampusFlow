/**
 * routes/apiRoutes.js
 * Mounted at /api - the JSON / REST part of the project.
 *
 *   GET    /api/complaints          list (search, filter, sort, paginate)
 *   GET    /api/complaints/similar  duplicate check (must come before /:id!)
 *   GET    /api/complaints/:id      single complaint
 *   POST   /api/complaints          create
 *   PATCH  /api/complaints/:id      update status / priority / assignment
 *   DELETE /api/complaints/:id      delete (admin only)
 *   POST   /api/complaints/:id/comments   add a comment
 *
 * All of them are protected by session authentication: the browser sends the
 * same session cookie whether it requests an HTML page or JSON.
 */
const router = require('express').Router();

const apiController = require('../controllers/apiController');
const { ensureLoggedIn } = require('../middleware/auth');
const { complaintRules, commentRules } = require('../middleware/validators');

router.use(ensureLoggedIn); // 401 for JSON clients, redirect for browsers

router.get('/complaints', apiController.list);

// NOTE: "/similar" must be registered BEFORE "/:id"
router.get('/complaints/similar', apiController.similar);

router.post('/complaints', complaintRules, apiController.create);
router.get('/complaints/:id', apiController.show);
router.patch('/complaints/:id', apiController.update);
router.delete('/complaints/:id', apiController.remove);
router.post('/complaints/:id/comments', commentRules, apiController.addComment);

module.exports = router;
