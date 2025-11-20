// /server/controllers/actionsController.js

// Dummy next actions data (later connect to database)
const nextActions = [
  {
    id: 1,
    title: 'Review Protocol Draft',
    description: 'Review draft protocol for BTX-331 Phase 1 study',
    dueDate: '2025-05-05',
    priority: 'high',
    status: 'pending',
    projectId: 'ind-2025-034',
    assignedTo: 'james.wilson',
    createdAt: '2025-04-20T10:15:00Z',
    updatedAt: '2025-04-20T10:15:00Z',
  },
  {
    id: 2,
    title: 'Complete Safety Narrative',
    description: 'Finalize safety narrative for CSR section 12.3',
    dueDate: '2025-05-08',
    priority: 'medium',
    status: 'in-progress',
    projectId: 'csr-2024-089',
    assignedTo: 'emily.chen',
    createdAt: '2025-04-21T09:30:00Z',
    updatedAt: '2025-04-25T14:45:00Z',
  },
  {
    id: 3,
    title: 'IB Risk Assessment Review',
    description: "Review risk assessment section in Investigator's Brochure",
    dueDate: '2025-05-12',
    priority: 'medium',
    status: 'pending',
    projectId: 'protocol-507',
    assignedTo: 'john.davis',
    createdAt: '2025-04-22T14:20:00Z',
    updatedAt: '2025-04-22T14:20:00Z',
  },
  {
    id: 4,
    title: 'CMC Section Review',
    description: 'Review updated CMC section with recent stability data',
    dueDate: '2025-05-01',
    priority: 'high',
    status: 'pending',
    projectId: 'ind-2025-034',
    assignedTo: 'susan.williams',
    createdAt: '2025-04-18T11:05:00Z',
    updatedAt: '2025-04-18T11:05:00Z',
  },
  {
    id: 5,
    title: 'Device Technical Specification',
    description: 'Finalize technical specifications for medical device CER',
    dueDate: '2025-05-15',
    priority: 'low',
    status: 'in-progress',
    projectId: 'cer-2025-012',
    assignedTo: 'robert.johnson',
    createdAt: '2025-04-23T09:15:00Z',
    updatedAt: '2025-04-26T16:30:00Z',
  },
];

// GET /api/next-actions - Get all next actions
export const getAllActions = (req, res) => {
  try {
    // In a real app, we would filter by user permissions
    res.status(200).json({
      success: true,
      data: nextActions,
    });
  } catch (error) {
    console.error('Error fetching actions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch actions',
    });
  }
};

// GET /api/next-actions/user/:userId - Get actions for a specific user
export const getActionsByUser = (req, res) => {
  try {
    const { userId } = req.params;
    const userActions = nextActions.filter(action => action.assignedTo === userId);

    res.status(200).json({
      success: true,
      data: userActions,
    });
  } catch (error) {
    console.error('Error fetching user actions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user actions',
    });
  }
};

// GET /api/next-actions/project/:projectId - Get actions for a specific project
export const getActionsByProject = (req, res) => {
  try {
    const { projectId } = req.params;
    const projectActions = nextActions.filter(action => action.projectId === projectId);

    res.status(200).json({
      success: true,
      data: projectActions,
    });
  } catch (error) {
    console.error('Error fetching project actions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project actions',
    });
  }
};

// GET /api/next-actions/priority/:level - Get actions by priority level
export const getActionsByPriority = (req, res) => {
  try {
    const { level } = req.params;
    const priorityActions = nextActions.filter(action => action.priority === level);

    res.status(200).json({
      success: true,
      data: priorityActions,
    });
  } catch (error) {
    console.error('Error fetching priority actions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch priority actions',
    });
  }
};

// POST /api/next-actions - Create a new action
export const createAction = (req, res) => {
  try {
    const newAction = req.body;

    // In a real app, validate action data
    // Then save to database

    res.status(201).json({
      success: true,
      message: 'Action created successfully',
      data: {
        id: nextActions.length + 1,
        ...newAction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create action',
    });
  }
};

// PUT /api/next-actions/:id - Update an existing action
export const updateAction = (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // In a real app, check if action exists
    // Then update in database

    res.status(200).json({
      success: true,
      message: `Action ${id} updated successfully`,
      data: {
        id: parseInt(id),
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update action',
    });
  }
};

// DELETE /api/next-actions/:id - Delete an action
export const deleteAction = (req, res) => {
  try {
    const { id } = req.params;

    // In a real app, check if action exists
    // Then delete from database

    res.status(200).json({
      success: true,
      message: `Action ${id} deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete action',
    });
  }
};

// PUT /api/next-actions/:id/complete - Mark an action as complete
export const completeAction = (req, res) => {
  try {
    const { id } = req.params;

    // In a real app, check if action exists
    // Then update in database

    res.status(200).json({
      success: true,
      message: `Action ${id} marked as complete`,
      data: {
        id: parseInt(id),
        status: 'completed',
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error completing action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete action',
    });
  }
};
