/**
 * Simple API Server for Development Testing
 *
 * This is a standalone Express server that serves our API endpoints
 * without the complexity of the main application.
 */

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 4000; // Use a different port from main app

// Middleware
app.use(cors());
app.use(express.json());

// Vault documents endpoint
app.get('/api/vault/recent-docs', (req, res) => {
  const recentDocs = [
    {
      id: 1,
      name: 'IND-2025-034-Protocol.docx',
      type: 'Protocol',
      uploadedAt: '2025-04-26',
      uploadedBy: 'Sarah Johnson',
    },
    {
      id: 2,
      name: 'CSR-2024-089-Draft.pdf',
      type: 'CSR Draft',
      uploadedAt: '2025-04-25',
      uploadedBy: 'Mark Wilson',
    },
    {
      id: 3,
      name: 'Investigator_Brochure_v2.pdf',
      type: 'IB',
      uploadedAt: '2025-04-24',
      uploadedBy: 'Emily Chen',
    },
    {
      id: 4,
      name: 'BTX-331-SummaryStats.xlsx',
      type: 'Statistics',
      uploadedAt: '2025-04-23',
      uploadedBy: 'David Lee',
    },
    {
      id: 5,
      name: 'CIR-507-Amendment-Draft.docx',
      type: 'Protocol Amendment',
      uploadedAt: '2025-04-22',
      uploadedBy: 'Jennifer Smith',
    },
  ];

  res.status(200).json({
    success: true,
    data: recentDocs,
  });
});

// Next actions endpoint
app.get('/api/next-actions', (req, res) => {
  const actions = [
    {
      id: 1,
      title: 'Review Protocol Draft',
      description: 'Review draft protocol for BTX-331 Phase 1 study',
      dueDate: '2025-05-05',
      priority: 'high',
      status: 'pending',
      projectId: 'ind-2025-034',
      assignedTo: 'james.wilson',
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
    },
  ];

  res.status(200).json({
    success: true,
    data: actions,
  });
});

// Analytics metrics endpoint
app.get('/api/analytics/metrics', (req, res) => {
  const analyticsMetrics = {
    submissionsLast90Days: 8,
    avgReviewTimeDays: 32,
    delayRiskPercent: 25,
  };

  res.status(200).json({
    success: true,
    data: analyticsMetrics,
  });
});

// Projects endpoint
app.get('/api/projects', (req, res) => {
  const projects = [
    {
      id: 'ind-2025-034',
      name: 'BTX-331 IND Application',
      type: 'IND',
      status: 'In Progress',
      dueDate: '2025-06-15',
      progress: 65,
      client: 'Biotech Innovations',
    },
    {
      id: 'csr-2024-089',
      name: 'BX-107 Clinical Study Report',
      type: 'CSR',
      status: 'In Review',
      dueDate: '2025-05-30',
      progress: 85,
      client: 'MediPharm Solutions',
    },
    {
      id: 'protocol-507',
      name: 'CIR-507 Protocol Amendment',
      type: 'Protocol',
      status: 'Draft',
      dueDate: '2025-07-10',
      progress: 25,
      client: 'CliniRx Research',
    },
  ];

  res.status(200).json({
    success: true,
    data: projects,
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Simple API server running on port ${PORT}`);
});
