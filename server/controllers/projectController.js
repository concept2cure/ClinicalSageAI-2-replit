// /server/controllers/projectController.js

// Dummy project data (later connect to database)
const projects = [
  {
    id: 'ind-2025-034',
    name: 'BTX-331 IND Application',
    type: 'IND',
    status: 'In Progress',
    dueDate: '2025-06-15',
    progress: 65,
    client: 'Biotech Innovations',
    assignedTo: ['james.wilson', 'sarah.johnson'],
  },
  {
    id: 'csr-2024-089',
    name: 'BX-107 Clinical Study Report',
    type: 'CSR',
    status: 'In Review',
    dueDate: '2025-05-30',
    progress: 85,
    client: 'MediPharm Solutions',
    assignedTo: ['emily.chen', 'mark.wilson'],
  },
  {
    id: 'protocol-507',
    name: 'CIR-507 Protocol Amendment',
    type: 'Protocol',
    status: 'Draft',
    dueDate: '2025-07-10',
    progress: 25,
    client: 'CliniRx Research',
    assignedTo: ['john.davis', 'michael.brown'],
  },
  {
    id: 'cer-2025-012',
    name: 'MD-450 Clinical Evaluation Report',
    type: 'CER',
    status: 'Planning',
    dueDate: '2025-08-05',
    progress: 15,
    client: 'MedDevice Innovations',
    assignedTo: ['lisa.taylor', 'robert.johnson'],
  },
  {
    id: 'cmc-2025-023',
    name: 'BTX-331 CMC Documentation',
    type: 'CMC',
    status: 'In Progress',
    dueDate: '2025-06-20',
    progress: 50,
    client: 'Biotech Innovations',
    assignedTo: ['susan.williams', 'james.wilson'],
  },
];

// GET /api/projects - Get all projects
export const getAllProjects = (req, res) => {
  try {
    // In a real app, we would filter by user permissions
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
export const getProjectById = (req, res) => {
  try {
    const { id } = req.params;
    const project = projects.find(p => p.id === id);

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

// GET /api/projects/status - Get projects by status
export const getProjectsByStatus = (req, res) => {
  try {
    const { status } = req.query;
    let filteredProjects = [...projects];

    if (status) {
      filteredProjects = projects.filter(p => p.status.toLowerCase() === status.toLowerCase());
    }

    // Group projects by status
    const groupedProjects = filteredProjects.reduce((acc, project) => {
      const status = project.status;
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(project);
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: groupedProjects,
    });
  } catch (error) {
    console.error('Error fetching projects by status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects by status',
    });
  }
};

// POST /api/projects - Create a new project
export const createProject = (req, res) => {
  try {
    const newProject = req.body;

    // In a real app, validate project data
    // Then save to database

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: {
        id: `${newProject.type.toLowerCase()}-${new Date().getFullYear()}-${(projects.length + 1).toString().padStart(3, '0')}`,
        ...newProject,
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
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
