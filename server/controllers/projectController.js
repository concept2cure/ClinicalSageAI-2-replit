// /server/controllers/projectController.js

import * as projectService from '../services/projectService.js';

// GET /api/projects - Get all projects
export const getAllProjects = async (req, res) => {
  try {
    // Get organization_id from authenticated user
    const organizationId = req.user?.organizationId || 1; // Default to 1 for demo
    
    const projects = await projectService.getAllProjects(organizationId);
    
    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
    });
  }
};

// GET /api/projects/:id - Get project by ID
export const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await projectService.getProjectById(id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with ID ${id} not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
    });
  }
};

// POST /api/projects - Create a new project with eCTD hierarchy
export const createProject = async (req, res) => {
  try {
    // Get organization_id from authenticated user
    const organizationId = req.user?.organizationId || 1; // Default to 1 for demo
    
    const project = await projectService.createProjectWithHierarchy(
      req.body,
      organizationId
    );

    res.status(201).json({
      success: true,
      message: 'Project created successfully with eCTD hierarchy',
      data: project,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
    });
  }
};

// DELETE /api/projects/:id - Delete a project
export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    // Implementation would go here
    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
    });
  }
};


// PUT /api/projects/:id - Update an existing project
export const updateProject = (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // In a real app, check if project exists
    // Then update in database

    res.status(200).json({
      success: true,
      message: `Project ${id} updated successfully`,
      data: {
        id,
        ...updates,
      },
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
    });
  }
};

// DELETE /api/projects/:id - Delete a project
export const deleteProject = (req, res) => {
  try {
    const { id } = req.params;

    // In a real app, check if project exists
    // Then delete from database

    res.status(200).json({
      success: true,
      message: `Project ${id} deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
    });
  }
};
