// Project Status API Routes
import express from 'express';
const router = express.Router();

// Sample project data
const projects = [
  {
    id: 'ind-2025-034',
    name: 'IND-2025-034',
    client: 'NeuraTech Biomedical',
    type: 'IND',
    status: 'in_progress',
    percentComplete: 65,
    dueDate: '2025-05-20',
    missingItems: ['CMC Module 3.2'],
  },
  {
    id: 'csr-2024-089',
    name: 'CSR-2024-089',
    client: 'SynaptiCure',
    type: 'CSR',
    status: 'complete',
    percentComplete: 100,
    dueDate: 'Completed',
    missingItems: [],
  },
  {
    id: 'protocol-507',
    name: 'Protocol-507',
    client: 'GenomaCure',
    type: 'Protocol',
    status: 'at_risk',
    percentComplete: 42,
    dueDate: '2025-06-10',
    missingItems: ['Safety Section', 'IRB Letter'],
  },
];

// GET /api/projects/status
router.get('/status', (req, res) => {
  console.log('[API] Returning sample project status data');
  try {
    res.json({ success: true, projects: projects });
  } catch (error) {
    console.error('Failed to load project status:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
