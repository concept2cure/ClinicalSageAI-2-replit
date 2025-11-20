// /server/routes/projects.js

const express = require('express');
const projectController = require('../controllers/projectController');

const router = express.Router();

// GET /api/projects/status - Get projects by status
// Note: This must be before the /:id route to avoid conflicts
router.get('/projects', projectController.getAllProjects);

// GET /api/projects - Get all projects
router.get('/projects/:id', projectController.getProjectById);

module.exports = router;
