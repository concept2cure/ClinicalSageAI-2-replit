// /server/routes/actions.js

import express from 'express';
import * as actionsController from '../controllers/actionsController.js';

const router = express.Router();

// GET /api/next-actions - Get all next actions
router.get('/', actionsController.getAllActions);

// GET /api/next-actions/user/:userId - Get actions for a specific user
router.get('/user/:userId', actionsController.getActionsByUser);

// GET /api/next-actions/project/:projectId - Get actions for a specific project
router.get('/project/:projectId', actionsController.getActionsByProject);

// GET /api/next-actions/priority/:level - Get actions by priority level
router.get('/priority/:level', actionsController.getActionsByPriority);

// POST /api/next-actions - Create a new action
router.post('/', actionsController.createAction);

// PUT /api/next-actions/:id - Update an existing action
router.put('/:id', actionsController.updateAction);

// DELETE /api/next-actions/:id - Delete an action
router.delete('/:id', actionsController.deleteAction);

// PUT /api/next-actions/:id/complete - Mark an action as complete
router.put('/:id/complete', actionsController.completeAction);

export default router;
