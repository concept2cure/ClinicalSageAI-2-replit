/**
 * Regulatory Management API Routes
 * Comprehensive multi-agency compliance and regulatory submission management
 */

import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Mock data for demonstration - in production would use database
let regulatoryAgencies = [
  {
    id: 1,
    agencyCode: 'FDA',
    agencyName: 'U.S. Food and Drug Administration',
    region: 'North America',
    country: 'United States',
    contactInfo: { email: 'cder@fda.hhs.gov', phone: '+1-888-463-6332' },
    isActive: true,
  },
  {
    id: 2,
    agencyCode: 'EMA',
    agencyName: 'European Medicines Agency',
    region: 'Europe',
    country: 'Netherlands',
    contactInfo: { email: 'info@ema.europa.eu', phone: '+31-88-781-6000' },
    isActive: true,
  },
  {
    id: 3,
    agencyCode: 'PMDA',
    agencyName: 'Pharmaceuticals and Medical Devices Agency',
    region: 'Asia Pacific',
    country: 'Japan',
    contactInfo: { email: 'info@pmda.go.jp', phone: '+81-3-3506-9000' },
    isActive: true,
  },
  {
    id: 4,
    agencyCode: 'HC',
    agencyName: 'Health Canada',
    region: 'North America',
    country: 'Canada',
    contactInfo: { email: 'info@hc-sc.gc.ca', phone: '+1-613-957-2991' },
    isActive: true,
  },
  {
    id: 5,
    agencyCode: 'WHO',
    agencyName: 'World Health Organization',
    region: 'Global',
    country: 'Switzerland',
    contactInfo: { email: 'info@who.int', phone: '+41-22-791-2111' },
    isActive: true,
  },
  {
    id: 6,
    agencyCode: 'TGA',
    agencyName: 'Therapeutic Goods Administration',
    region: 'Asia Pacific',
    country: 'Australia',
    contactInfo: { email: 'info@tga.gov.au', phone: '+61-2-6232-8000' },
    isActive: true,
  },
];

let complianceTracking = [
  {
    id: 1,
    productId: 'BTC-2025-A',
    agencyId: 1,
    complianceStatus: 'compliant',
    complianceScore: 94.5,
    lastAssessmentDate: '2024-12-01',
    nextAssessmentDate: '2025-03-01',
    riskLevel: 'low',
    assignedTo: 'Dr. Sarah Chen',
  },
  {
    id: 2,
    productId: 'BTC-2025-A',
    agencyId: 2,
    complianceStatus: 'in_review',
    complianceScore: 89.2,
    lastAssessmentDate: '2024-11-15',
    nextAssessmentDate: '2025-02-15',
    riskLevel: 'medium',
    assignedTo: 'Dr. Michael Rodriguez',
  },
  {
    id: 3,
    productId: 'BTC-2024-B',
    agencyId: 1,
    complianceStatus: 'compliant',
    complianceScore: 96.8,
    lastAssessmentDate: '2024-10-20',
    nextAssessmentDate: '2025-01-20',
    riskLevel: 'low',
    assignedTo: 'Dr. Emily Johnson',
  },
];

let regulatorySubmissions = [
  {
    id: 1,
    submissionNumber: 'IND-123456',
    productName: 'BTC-2025-A',
    submissionType: 'IND',
    agencyId: 1,
    status: 'under_review',
    priority: 'high',
    submissionDate: '2024-11-01',
    targetDate: '2025-02-01',
    reviewDivision: 'CDER/OND/ODEII',
    progress: 75,
    milestones: [
      { name: 'FDA Receipt', date: '2024-11-01', status: 'completed' },
      { name: 'Day 30 Safety Review', date: '2024-12-01', status: 'completed' },
      { name: 'Clinical Hold Decision', date: '2025-01-01', status: 'pending' },
    ],
  },
  {
    id: 2,
    submissionNumber: 'MAA-789012',
    productName: 'BTC-2024-B',
    submissionType: 'MAA',
    agencyId: 2,
    status: 'submitted',
    priority: 'critical',
    submissionDate: '2024-10-15',
    targetDate: '2025-04-15',
    reviewDivision: 'CHMP',
    progress: 45,
    milestones: [
      { name: 'EMA Receipt', date: '2024-10-15', status: 'completed' },
      { name: 'Validation', date: '2024-11-01', status: 'completed' },
      { name: 'Day 120 Questions', date: '2025-02-14', status: 'pending' },
    ],
  },
];

let agencyCorrespondence = [
  {
    id: 1,
    submissionId: 1,
    correspondenceNumber: 'FDA-IR-001',
    correspondenceType: 'IR',
    direction: 'inbound',
    agencyId: 1,
    subject: 'Information Request - Manufacturing Process',
    receivedDate: '2024-12-05',
    responseDeadline: '2025-01-05',
    status: 'pending',
    priority: 'high',
    assignedTo: 'Dr. Sarah Chen',
  },
  {
    id: 2,
    submissionId: 2,
    correspondenceNumber: 'EMA-CQ-002',
    correspondenceType: 'clarification_question',
    direction: 'inbound',
    agencyId: 2,
    subject: 'Clarification - Stability Data Package',
    receivedDate: '2024-11-28',
    responseDeadline: '2024-12-28',
    status: 'in_progress',
    priority: 'medium',
    assignedTo: 'Dr. Michael Rodriguez',
  },
];

let regulatoryIntelligence = [
  {
    id: 1,
    title: 'FDA Guidance: Quality Considerations for Continuous Manufacturing',
    summary: 'New FDA guidance on quality considerations for pharmaceutical continuous manufacturing',
    type: 'guidance',
    agencyId: 1,
    publishedDate: '2024-12-01',
    impactLevel: 'high',
    actionRequired: true,
    status: 'active',
  },
  {
    id: 2,
    title: 'EMA Reflection Paper: Real-World Evidence',
    summary: 'Updated reflection paper on the use of real-world evidence in regulatory decision-making',
    type: 'guidance',
    agencyId: 2,
    publishedDate: '2024-11-25',
    impactLevel: 'medium',
    actionRequired: false,
    status: 'active',
  },
];

let regulatoryChangeControl = [
  {
    id: 1,
    changeControlNumber: 'CC-2024-001',
    title: 'Manufacturing Site Change',
    description: 'Addition of new manufacturing site for API production',
    changeType: 'manufacturing',
    riskCategory: 'high',
    status: 'under_review',
    notificationRequired: true,
    submissionType: 'PAS',
    dueDate: '2025-02-01',
    affectedProducts: ['BTC-2025-A', 'BTC-2024-B'],
    affectedAgencies: ['FDA', 'EMA'],
  },
];

let postApprovalCommitments = [
  {
    id: 1,
    submissionId: 1,
    commitmentNumber: 'PMC-2024-001',
    title: 'Post-Market Clinical Study',
    description: 'Long-term safety study in pediatric population',
    type: 'clinical_study',
    agencyId: 1,
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-12-01',
    assignedTo: 'Dr. Clinical Lead',
  },
];

let regulatoryCalendar = [
  {
    id: 1,
    title: 'FDA Type C Meeting - BTC-2025-A',
    eventType: 'meeting',
    eventDate: '2024-12-20T14:00:00Z',
    agencyId: 1,
    submissionId: 1,
    status: 'scheduled',
    priority: 'high',
  },
  {
    id: 2,
    title: 'EMA Day 120 Response Due',
    eventType: 'deadline',
    eventDate: '2025-02-14T23:59:59Z',
    agencyId: 2,
    submissionId: 2,
    status: 'scheduled',
    priority: 'critical',
  },
];

// Validation schemas
const complianceTrackingSchema = z.object({
  productId: z.string(),
  agencyId: z.number(),
  complianceStatus: z.enum(['pending', 'compliant', 'non_compliant', 'in_review', 'under_assessment']),
  complianceScore: z.number().min(0).max(100),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  assignedTo: z.string().optional(),
});

const submissionSchema = z.object({
  submissionNumber: z.string(),
  productName: z.string(),
  submissionType: z.string(),
  agencyId: z.number(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  submissionDate: z.string().optional(),
  targetDate: z.string().optional(),
  reviewDivision: z.string().optional(),
});

const correspondenceSchema = z.object({
  submissionId: z.number().optional(),
  correspondenceNumber: z.string(),
  correspondenceType: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  agencyId: z.number(),
  subject: z.string(),
  responseDeadline: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  assignedTo: z.string().optional(),
});

// ============================================================================
// REGULATORY AGENCIES ROUTES
// ============================================================================

// Get all regulatory agencies
router.get('/agencies', (req, res) => {
  try {
    res.json({
      success: true,
      data: regulatoryAgencies,
      count: regulatoryAgencies.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulatory agencies',
      message: error.message,
    });
  }
});

// ============================================================================
// MULTI-AGENCY COMPLIANCE TRACKING ROUTES
// ============================================================================

// Get compliance tracking data
router.get('/compliance', (req, res) => {
  try {
    const { productId, agencyId } = req.query;
    let filteredData = complianceTracking;
    
    if (productId) {
      filteredData = filteredData.filter(item => item.productId === productId);
    }
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    // Enhance with agency information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: regulatoryAgencies.find(agency => agency.id === item.agencyId),
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compliance tracking data',
      message: error.message,
    });
  }
});

// Create compliance tracking entry
router.post('/compliance', (req, res) => {
  try {
    const validationResult = complianceTrackingSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid compliance tracking data',
        details: validationResult.error.format(),
      });
    }
    
    const newCompliance = {
      id: complianceTracking.length + 1,
      ...validationResult.data,
      lastAssessmentDate: new Date().toISOString().split('T')[0],
      nextAssessmentDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    complianceTracking.push(newCompliance);
    
    res.status(201).json({
      success: true,
      data: newCompliance,
      message: 'Compliance tracking entry created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create compliance tracking entry',
      message: error.message,
    });
  }
});

// Update compliance tracking entry
router.put('/compliance/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = complianceTracking.findIndex(item => item.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Compliance tracking entry not found',
      });
    }
    
    complianceTracking[index] = {
      ...complianceTracking[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      data: complianceTracking[index],
      message: 'Compliance tracking entry updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update compliance tracking entry',
      message: error.message,
    });
  }
});

// ============================================================================
// REGULATORY SUBMISSIONS ROUTES
// ============================================================================

// Get all regulatory submissions
router.get('/submissions', (req, res) => {
  try {
    const { agencyId, status, productName } = req.query;
    let filteredData = regulatorySubmissions;
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    if (status) {
      filteredData = filteredData.filter(item => item.status === status);
    }
    
    if (productName) {
      filteredData = filteredData.filter(item => 
        item.productName.toLowerCase().includes(productName.toLowerCase())
      );
    }
    
    // Enhance with agency information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: regulatoryAgencies.find(agency => agency.id === item.agencyId),
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulatory submissions',
      message: error.message,
    });
  }
});

// Create new regulatory submission
router.post('/submissions', (req, res) => {
  try {
    const validationResult = submissionSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid submission data',
        details: validationResult.error.format(),
      });
    }
    
    const newSubmission = {
      id: regulatorySubmissions.length + 1,
      ...validationResult.data,
      progress: 0,
      milestones: [],
      documents: [],
      correspondences: [],
      meetings: [],
      commitments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    regulatorySubmissions.push(newSubmission);
    
    res.status(201).json({
      success: true,
      data: newSubmission,
      message: 'Regulatory submission created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create regulatory submission',
      message: error.message,
    });
  }
});

// Update regulatory submission
router.put('/submissions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = regulatorySubmissions.findIndex(item => item.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Regulatory submission not found',
      });
    }
    
    regulatorySubmissions[index] = {
      ...regulatorySubmissions[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      data: regulatorySubmissions[index],
      message: 'Regulatory submission updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update regulatory submission',
      message: error.message,
    });
  }
});

// ============================================================================
// AGENCY CORRESPONDENCE ROUTES
// ============================================================================

// Get agency correspondence
router.get('/correspondence', (req, res) => {
  try {
    const { submissionId, agencyId, status } = req.query;
    let filteredData = agencyCorrespondence;
    
    if (submissionId) {
      filteredData = filteredData.filter(item => item.submissionId === parseInt(submissionId));
    }
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    if (status) {
      filteredData = filteredData.filter(item => item.status === status);
    }
    
    // Enhance with agency and submission information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: regulatoryAgencies.find(agency => agency.id === item.agencyId),
      submission: regulatorySubmissions.find(sub => sub.id === item.submissionId),
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agency correspondence',
      message: error.message,
    });
  }
});

// Create new correspondence
router.post('/correspondence', (req, res) => {
  try {
    const validationResult = correspondenceSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid correspondence data',
        details: validationResult.error.format(),
      });
    }
    
    const newCorrespondence = {
      id: agencyCorrespondence.length + 1,
      ...validationResult.data,
      receivedDate: new Date().toISOString().split('T')[0],
      status: 'pending',
      documents: [],
      versionHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    agencyCorrespondence.push(newCorrespondence);
    
    res.status(201).json({
      success: true,
      data: newCorrespondence,
      message: 'Agency correspondence created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create agency correspondence',
      message: error.message,
    });
  }
});

// Update correspondence status
router.put('/correspondence/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const index = agencyCorrespondence.findIndex(item => item.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Correspondence not found',
      });
    }
    
    agencyCorrespondence[index] = {
      ...agencyCorrespondence[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      data: agencyCorrespondence[index],
      message: 'Correspondence updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update correspondence',
      message: error.message,
    });
  }
});

// ============================================================================
// REGULATORY INTELLIGENCE ROUTES
// ============================================================================

// Get regulatory intelligence updates
router.get('/intelligence', (req, res) => {
  try {
    const { type, agencyId, impactLevel } = req.query;
    let filteredData = regulatoryIntelligence;
    
    if (type) {
      filteredData = filteredData.filter(item => item.type === type);
    }
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    if (impactLevel) {
      filteredData = filteredData.filter(item => item.impactLevel === impactLevel);
    }
    
    // Enhance with agency information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: item.agencyId ? regulatoryAgencies.find(agency => agency.id === item.agencyId) : null,
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulatory intelligence',
      message: error.message,
    });
  }
});

// ============================================================================
// CHANGE CONTROL MANAGEMENT ROUTES
// ============================================================================

// Get regulatory change controls
router.get('/change-control', (req, res) => {
  try {
    const { status, riskCategory } = req.query;
    let filteredData = regulatoryChangeControl;
    
    if (status) {
      filteredData = filteredData.filter(item => item.status === status);
    }
    
    if (riskCategory) {
      filteredData = filteredData.filter(item => item.riskCategory === riskCategory);
    }
    
    res.json({
      success: true,
      data: filteredData,
      count: filteredData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch change control data',
      message: error.message,
    });
  }
});

// ============================================================================
// POST-APPROVAL COMMITMENTS ROUTES
// ============================================================================

// Get post-approval commitments
router.get('/commitments', (req, res) => {
  try {
    const { status, agencyId, submissionId } = req.query;
    let filteredData = postApprovalCommitments;
    
    if (status) {
      filteredData = filteredData.filter(item => item.status === status);
    }
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    if (submissionId) {
      filteredData = filteredData.filter(item => item.submissionId === parseInt(submissionId));
    }
    
    // Enhance with agency and submission information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: regulatoryAgencies.find(agency => agency.id === item.agencyId),
      submission: regulatorySubmissions.find(sub => sub.id === item.submissionId),
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post-approval commitments',
      message: error.message,
    });
  }
});

// ============================================================================
// REGULATORY CALENDAR ROUTES
// ============================================================================

// Get regulatory calendar events
router.get('/calendar', (req, res) => {
  try {
    const { eventType, agencyId, startDate, endDate } = req.query;
    let filteredData = regulatoryCalendar;
    
    if (eventType) {
      filteredData = filteredData.filter(item => item.eventType === eventType);
    }
    
    if (agencyId) {
      filteredData = filteredData.filter(item => item.agencyId === parseInt(agencyId));
    }
    
    if (startDate) {
      filteredData = filteredData.filter(item => 
        new Date(item.eventDate) >= new Date(startDate)
      );
    }
    
    if (endDate) {
      filteredData = filteredData.filter(item => 
        new Date(item.eventDate) <= new Date(endDate)
      );
    }
    
    // Enhance with agency and submission information
    const enhancedData = filteredData.map(item => ({
      ...item,
      agency: item.agencyId ? regulatoryAgencies.find(agency => agency.id === item.agencyId) : null,
      submission: item.submissionId ? regulatorySubmissions.find(sub => sub.id === item.submissionId) : null,
    }));
    
    res.json({
      success: true,
      data: enhancedData,
      count: enhancedData.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch regulatory calendar',
      message: error.message,
    });
  }
});

// ============================================================================
// ANALYTICS & REPORTING ROUTES
// ============================================================================

// Get regulatory analytics dashboard data
router.get('/analytics/dashboard', (req, res) => {
  try {
    // Calculate overall compliance metrics
    const totalCompliance = complianceTracking.length;
    const compliantCount = complianceTracking.filter(item => item.complianceStatus === 'compliant').length;
    const overallComplianceRate = totalCompliance > 0 ? (compliantCount / totalCompliance) * 100 : 0;
    
    // Calculate average compliance score
    const averageComplianceScore = totalCompliance > 0 
      ? complianceTracking.reduce((sum, item) => sum + item.complianceScore, 0) / totalCompliance 
      : 0;
    
    // Count submissions by status
    const submissionsByStatus = regulatorySubmissions.reduce((acc, sub) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1;
      return acc;
    }, {});
    
    // Count pending correspondence
    const pendingCorrespondence = agencyCorrespondence.filter(item => 
      item.status === 'pending' || item.status === 'in_progress'
    ).length;
    
    // Count overdue items
    const today = new Date();
    const overdueCorrespondence = agencyCorrespondence.filter(item => 
      item.responseDeadline && new Date(item.responseDeadline) < today && item.status !== 'responded'
    ).length;
    
    const overdueCommitments = postApprovalCommitments.filter(item =>
      item.dueDate && new Date(item.dueDate) < today && item.status !== 'completed'
    ).length;
    
    // Agency distribution
    const agencyDistribution = regulatorySubmissions.reduce((acc, sub) => {
      const agency = regulatoryAgencies.find(a => a.id === sub.agencyId);
      if (agency) {
        acc[agency.agencyCode] = (acc[agency.agencyCode] || 0) + 1;
      }
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        compliance: {
          overallRate: Math.round(overallComplianceRate * 100) / 100,
          averageScore: Math.round(averageComplianceScore * 100) / 100,
          totalTracked: totalCompliance,
          compliantCount,
          nonCompliantCount: totalCompliance - compliantCount,
        },
        submissions: {
          total: regulatorySubmissions.length,
          byStatus: submissionsByStatus,
          byAgency: agencyDistribution,
        },
        correspondence: {
          total: agencyCorrespondence.length,
          pending: pendingCorrespondence,
          overdue: overdueCorrespondence,
        },
        commitments: {
          total: postApprovalCommitments.length,
          overdue: overdueCommitments,
          active: postApprovalCommitments.filter(c => c.status === 'in_progress').length,
        },
        riskMetrics: {
          highRiskCompliance: complianceTracking.filter(c => c.riskLevel === 'high').length,
          criticalRiskCompliance: complianceTracking.filter(c => c.riskLevel === 'critical').length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics dashboard data',
      message: error.message,
    });
  }
});

// ============================================================================
// REGULATORY CORRESPONDENCE MANAGEMENT ROUTES
// ============================================================================

// Mock data for regulatory questions and responses
let regQuestions = [
  {
    id: 1,
    correspondenceId: 1,
    questionText: 'Please provide additional stability data for the drug product stored at 25°C/60% RH.',
    sectionReference: 'Module 3.2.P.8',
    priority: 'high',
    severity: 'MAJOR',
    status: 'pending',
    region: 'FDA',
    dueDate: '2025-01-05',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    correspondenceId: 1,
    questionText: 'Clarify the impurity specifications and justify the limits.',
    sectionReference: 'Module 3.2.P.5.5',
    priority: 'medium',
    severity: 'MAJOR',
    status: 'in_progress',
    region: 'FDA',
    dueDate: '2025-01-05',
    createdAt: new Date().toISOString(),
  },
];

let regResponses = [
  {
    id: 1,
    questionId: 2,
    responseText: '**Response to Impurity Specifications:**\n\nThe impurity specifications have been established based on ICH Q3B(R2) guidelines...',
    evidenceUsed: [{ type: 'study', reference: 'Stability Study ST-001' }],
    version: 1,
    status: 'draft',
    draftedBy: 'Dr. Sarah Chen',
    createdAt: new Date().toISOString(),
  },
];

let regAttachments = [
  {
    id: 1,
    correspondenceId: 1,
    fileName: 'FDA_IR_001_Manufacturing.pdf',
    fileType: 'PDF',
    fileSize: 1024000,
    uploadedBy: 'Dr. Sarah Chen',
    extractedText: 'Full text of IR...',
    createdAt: new Date().toISOString(),
  },
];

// Get all questions
router.get('/questions', (req, res) => {
  try {
    const { correspondenceId, status } = req.query;
    let filteredQuestions = regQuestions;
    
    if (correspondenceId) {
      filteredQuestions = filteredQuestions.filter(q => q.correspondenceId === parseInt(correspondenceId));
    }
    
    if (status) {
      filteredQuestions = filteredQuestions.filter(q => q.status === status);
    }
    
    res.json({
      success: true,
      data: filteredQuestions,
      count: filteredQuestions.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions',
      message: error.message,
    });
  }
});

// Extract questions from uploaded document
router.post('/questions/extract', async (req, res) => {
  try {
    const { correspondenceId, documentText, fileName, region, dueDate } = req.body;
    
    // Import AI service
    const { aiExtractQuestions } = await import('../src/services/ai/regulatory.js');
    
    // Extract questions using AI
    const extractedQuestions = await aiExtractQuestions(documentText, { region, due: dueDate });
    
    // Save attachment
    const newAttachment = {
      id: regAttachments.length + 1,
      correspondenceId,
      fileName,
      fileType: fileName.split('.').pop().toUpperCase(),
      extractedText: documentText,
      uploadedBy: req.body.uploadedBy || 'Unknown',
      createdAt: new Date().toISOString(),
    };
    regAttachments.push(newAttachment);
    
    // Save questions
    const savedQuestions = extractedQuestions.map((q, index) => {
      const newQuestion = {
        id: regQuestions.length + index + 1,
        correspondenceId,
        attachmentId: newAttachment.id,
        questionText: q.text,
        sectionReference: q.section_suggest,
        priority: 'medium',
        severity: q.severity || 'MAJOR',
        status: 'pending',
        region: q.region || region,
        dueDate: q.due_date || dueDate,
        createdAt: new Date().toISOString(),
      };
      regQuestions.push(newQuestion);
      return newQuestion;
    });
    
    res.json({
      success: true,
      data: {
        attachment: newAttachment,
        questions: savedQuestions,
      },
      message: `Extracted ${savedQuestions.length} questions from document`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to extract questions',
      message: error.message,
    });
  }
});

// Get responses for a question
router.get('/responses/:questionId', (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    const responses = regResponses.filter(r => r.questionId === questionId);
    
    res.json({
      success: true,
      data: responses,
      count: responses.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch responses',
      message: error.message,
    });
  }
});

// Draft a new response
router.post('/responses', async (req, res) => {
  try {
    const { questionId, evidence, tone = 'Neutral' } = req.body;
    
    // Find the question
    const question = regQuestions.find(q => q.id === questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
      });
    }
    
    // Import AI service
    const { aiDraftResponse } = await import('../src/services/ai/regulatory.js');
    
    // Draft response using AI
    const aiResponse = await aiDraftResponse(question.questionText, evidence, tone);
    
    // Save response
    const newResponse = {
      id: regResponses.length + 1,
      questionId,
      responseText: aiResponse.md,
      evidenceUsed: aiResponse.used,
      version: 1,
      status: 'draft',
      draftedBy: req.body.draftedBy || 'AI Assistant',
      createdAt: new Date().toISOString(),
    };
    regResponses.push(newResponse);
    
    // Update question status
    const questionIndex = regQuestions.findIndex(q => q.id === questionId);
    if (questionIndex !== -1) {
      regQuestions[questionIndex].status = 'in_progress';
    }
    
    res.status(201).json({
      success: true,
      data: newResponse,
      message: 'Response drafted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to draft response',
      message: error.message,
    });
  }
});

// Update a response
router.put('/responses/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const responseIndex = regResponses.findIndex(r => r.id === id);
    
    if (responseIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Response not found',
      });
    }
    
    regResponses[responseIndex] = {
      ...regResponses[responseIndex],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    
    res.json({
      success: true,
      data: regResponses[responseIndex],
      message: 'Response updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update response',
      message: error.message,
    });
  }
});

export default router;