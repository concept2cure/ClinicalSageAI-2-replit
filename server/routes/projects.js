// /server/routes/projects.js

import express from 'express';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

// GET /api/projects - Get all projects
router.get('/', projectController.getAllProjects);

// POST /api/projects - Create a new project
router.post('/', projectController.createProject);

// GET /api/projects/:id - Get project by ID
router.get('/:id', projectController.getProjectById);

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', projectController.deleteProject);

export default router;
