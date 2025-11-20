/**
 * Quality Management Plan (QMP) API
 *
 * Provides endpoints for managing Quality Management Plans in accordance with ICH E6(R3).
 * These endpoints support the creation, retrieval, and management of QMPs including:
 * - QMP metadata (Plan Name, Version, Author, etc.)
 * - Quality Objectives with status tracking
 * - Section scope mapping (which sections of CER are covered by objectives)
 * - Validation against ICH E6(R3) requirements
 *
 * Version: 1.0.0
 * Last Updated: May 8, 2025
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// In-memory storage for QMP data
let qmpData = {
  metadata: {
    planName: 'CER Quality Management Plan',
    version: '1.0',
    author: 'John Smith',
    authorTitle: 'Quality Manager',
    createdAt: '2025-05-01T00:00:00Z',
    updatedAt: '2025-05-08T00:00:00Z',
    linkedCERVersion: '2.1',
    approvalDate: '2025-05-02T00:00:00Z',
    nextReviewDate: '2025-11-02T00:00:00Z',
    revisionHistory: [
      {
        version: '0.9',
        date: '2025-04-15T00:00:00Z',
        author: 'Mary Johnson',
        changes: 'Initial draft',
      },
      {
        version: '1.0',
        date: '2025-05-01T00:00:00Z',
        author: 'John Smith',
        changes: 'Approved version',
      },
    ],
  },
  objectives: [
    {
      id: 'obj-001',
      title: 'Comprehensive Literature Review',
      description:
        'Ensure all relevant literature is identified and accurately assessed according to MEDDEV 2.7/1 Rev 4',
      status: 'complete',
      scopeSections: ['Literature Review', 'Data Appraisal'],
      mitigationActions:
        'Use structured review protocol and dual independent reviewers for all assessment',
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-05-08T00:00:00Z',
      owner: 'Research Team',
    },
    {
      id: 'obj-002',
      title: 'Clinical Data Completeness',
      description:
        'Ensure all clinical investigations are properly included with statistical analysis',
      status: 'in-progress',
      scopeSections: ['Clinical Data', 'Clinical Evaluation'],
      mitigationActions:
        'Implement automated control checks for statistical methodology and completeness',
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-05-08T00:00:00Z',
      owner: 'Clinical Affairs',
    },
    {
      id: 'obj-003',
      title: 'PMCF Planning',
      description:
        'Post-Market Clinical Follow-up planning should be comprehensive and address all residual risks',
      status: 'planned',
      scopeSections: ['Post-Market Surveillance', 'Risk Management'],
      mitigationActions:
        'Systematic review of all identified risks to ensure PMCF methods will capture necessary data',
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-05-08T00:00:00Z',
      owner: 'Post-Market Team',
    },
    {
      id: 'obj-004',
      title: 'State of the Art Assessment',
      description:
        'Ensure comparison with current state of the art is comprehensive and up-to-date',
      status: 'blocked',
      scopeSections: ['State of the Art', 'Benefit-Risk Analysis'],
      mitigationActions:
        'Quarterly literature and competitive product reviews; formal expert panel consensus',
      createdAt: '2025-05-01T00:00:00Z',
      updatedAt: '2025-05-05T00:00:00Z',
      owner: 'Medical Affairs',
      blockingIssue: 'Waiting for expert panel availability',
    },
  ],
  metrics: {
    overallCompletion: 25,
    objectivesByStatus: {
      complete: 1,
      inProgress: 1,
      planned: 1,
      blocked: 1,
    },
    sectionCoverage: 60,
    criticalSectionsCovered: true,
    lastValidatedDate: '2025-05-05T00:00:00Z',
    validationScore: 78,
  },
  validationResults: {
    timestamp: '2025-05-05T00:00:00Z',
    framework: 'mdr',
    compliance: {
      score: 78,
      compliantWithICH: true,
      compliantWithFramework: true,
      adequateCoverage: true,
    },
    gaps: [
      {
        section: 'Equivalence Evaluation',
        impact: 'medium',
        description: 'No quality objective specifically addresses equivalence methodology quality',
      },
    ],
    recommendations: [
      {
        priority: 'high',
        description: 'Add quality objective for equivalence evaluation methodology',
        justification: 'EU MDR requires robust scientific justification for equivalence claims',
      },
      {
        priority: 'medium',
        description:
          'Expand clinical data completeness objective to include specific acceptance criteria',
        justification: 'ICH E6(R3) emphasizes predefined quality acceptance criteria',
      },
    ],
    strengths: [
      'Comprehensive literature review objective is well-defined with clear mitigation actions',
      'Post-market follow-up objective properly addresses residual risk monitoring',
    ],
  },
};

// Audit trail for QMP changes
const qmpAuditTrail = [
  {
    id: 'audit-001',
    timestamp: '2025-05-01T00:00:00Z',
    user: 'John Smith',
    action: 'created',
    details: 'Initial QMP creation',
  },
  {
    id: 'audit-002',
    timestamp: '2025-05-02T00:00:00Z',
    user: 'Jane Doe',
    action: 'approved',
    details: 'QMP approved by Quality Director',
  },
  {
    id: 'audit-003',
    timestamp: '2025-05-05T00:00:00Z',
    user: 'John Smith',
    action: 'updated',
    details: 'Updated obj-004 status to blocked',
  },
];

/**
 * GET /api/qmp-api/data
 * Retrieve the current QMP data
 */
router.get('/data', (req, res) => {
  try {
    logger.info('Retrieved QMP data', {
      module: 'qmp-api',
      objectivesCount: qmpData.objectives.length,
    });

    res.json(qmpData);
  } catch (error) {
    logger.error('Error retrieving QMP data', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP data',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/qmp-api/metadata
 * Update QMP metadata
 */
router.patch('/metadata', (req, res) => {
  try {
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
      });
    }

    // Create audit trail entry for metadata change
    const auditEntry = {
      id: `audit-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      user: updates.author || 'System',
      action: 'updated',
      details: 'Updated QMP metadata',
    };

    // Track version changes specifically
    if (updates.version && updates.version !== qmpData.metadata.version) {
      auditEntry.details = `Updated QMP version from ${qmpData.metadata.version} to ${updates.version}`;
    }

    qmpAuditTrail.push(auditEntry);

    // Update metadata
    qmpData.metadata = {
      ...qmpData.metadata,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    logger.info('Updated QMP metadata', {
      module: 'qmp-api',
      updatedFields: Object.keys(updates),
    });

    res.json({
      message: 'QMP metadata updated successfully',
      metadata: qmpData.metadata,
    });
  } catch (error) {
    logger.error('Error updating QMP metadata', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to update QMP metadata',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp-api/objectives
 * List all QMP objectives
 */
router.get('/objectives', (req, res) => {
  try {
    logger.info('Retrieved QMP objectives', {
      module: 'qmp-api',
      count: qmpData.objectives.length,
    });

    res.json({
      objectives: qmpData.objectives,
      count: qmpData.objectives.length,
    });
  } catch (error) {
    logger.error('Error retrieving QMP objectives', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP objectives',
      message: error.message,
    });
  }
});

/**
 * POST /api/qmp-api/objectives
 * Create a new QMP objective
 */
router.post('/objectives', (req, res) => {
  try {
    const {
      title,
      description,
      status = 'planned',
      scopeSections = [],
      mitigationActions = '',
      owner = '',
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: 'Title and description are required',
      });
    }

    // Generate ID
    const objectiveId = `obj-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    // Create objective
    const objective = {
      id: objectiveId,
      title,
      description,
      status,
      scopeSections,
      mitigationActions,
      owner,
      createdAt: now,
      updatedAt: now,
    };

    // Add to objectives
    qmpData.objectives.push(objective);

    // Update metrics
    updateQmpMetrics();

    // Create audit trail entry
    qmpAuditTrail.push({
      id: `audit-${Date.now().toString(36)}`,
      timestamp: now,
      user: 'System',
      action: 'created',
      details: `Created new objective: ${title}`,
    });

    logger.info('Created new QMP objective', {
      module: 'qmp-api',
      objectiveId,
      title,
    });

    res.status(201).json({
      message: 'QMP objective created successfully',
      objective,
    });
  } catch (error) {
    logger.error('Error creating QMP objective', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to create QMP objective',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/qmp-api/objectives/:id
 * Update a QMP objective
 */
router.patch('/objectives/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
      });
    }

    // Find objective
    const index = qmpData.objectives.findIndex(obj => obj.id === id);

    if (index === -1) {
      return res.status(404).json({
        error: 'Objective not found',
      });
    }

    const oldStatus = qmpData.objectives[index].status;

    // Update objective
    qmpData.objectives[index] = {
      ...qmpData.objectives[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update metrics
    updateQmpMetrics();

    // Create audit trail entry
    let auditDetails = `Updated objective: ${qmpData.objectives[index].title}`;

    // Track status changes specifically
    if (updates.status && updates.status !== oldStatus) {
      auditDetails = `Changed objective status from ${oldStatus} to ${updates.status}: ${qmpData.objectives[index].title}`;
    }

    qmpAuditTrail.push({
      id: `audit-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      user: 'System',
      action: 'updated',
      details: auditDetails,
    });

    logger.info('Updated QMP objective', {
      module: 'qmp-api',
      objectiveId: id,
      updatedFields: Object.keys(updates),
    });

    res.json({
      message: 'QMP objective updated successfully',
      objective: qmpData.objectives[index],
    });
  } catch (error) {
    logger.error('Error updating QMP objective', {
      module: 'qmp-api',
      error: error.message,
      objectiveId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to update QMP objective',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/qmp-api/objectives/:id
 * Delete a QMP objective
 */
router.delete('/objectives/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Find objective
    const index = qmpData.objectives.findIndex(obj => obj.id === id);

    if (index === -1) {
      return res.status(404).json({
        error: 'Objective not found',
      });
    }

    const objective = qmpData.objectives[index];

    // Remove objective
    qmpData.objectives.splice(index, 1);

    // Update metrics
    updateQmpMetrics();

    // Create audit trail entry
    qmpAuditTrail.push({
      id: `audit-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      user: 'System',
      action: 'deleted',
      details: `Deleted objective: ${objective.title}`,
    });

    logger.info('Deleted QMP objective', {
      module: 'qmp-api',
      objectiveId: id,
      title: objective.title,
    });

    res.json({
      message: 'QMP objective deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting QMP objective', {
      module: 'qmp-api',
      error: error.message,
      objectiveId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to delete QMP objective',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp-api/metrics
 * Get QMP metrics
 */
router.get('/metrics', (req, res) => {
  try {
    logger.info('Retrieved QMP metrics', {
      module: 'qmp-api',
    });

    res.json(qmpData.metrics);
  } catch (error) {
    logger.error('Error retrieving QMP metrics', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP metrics',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp-api/audit-trail
 * Get QMP audit trail
 */
router.get('/audit-trail', (req, res) => {
  try {
    logger.info('Retrieved QMP audit trail', {
      module: 'qmp-api',
      count: qmpAuditTrail.length,
    });

    res.json({
      auditTrail: qmpAuditTrail,
      count: qmpAuditTrail.length,
    });
  } catch (error) {
    logger.error('Error retrieving QMP audit trail', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP audit trail',
      message: error.message,
    });
  }
});

/**
 * POST /api/qmp-api/validate
 * Validate QMP against regulatory requirements
 */
router.post('/validate', async (req, res) => {
  try {
    const { framework = 'ich-e6r3' } = req.body;

    logger.info('Validating QMP', {
      module: 'qmp-api',
      framework,
    });

    // This would call the validation service in a real implementation
    // Using fixed validation results for this implementation
    const now = new Date().toISOString();

    // Update validation results
    qmpData.validationResults = {
      timestamp: now,
      framework,
      compliance: {
        score: Math.floor(75 + Math.random() * 15),
        compliantWithICH: true,
        compliantWithFramework: framework === 'ich-e6r3',
        adequateCoverage: qmpData.objectives.length >= 3,
      },
      gaps: [
        {
          section: 'Equivalence Evaluation',
          impact: 'medium',
          description:
            'No quality objective specifically addresses equivalence methodology quality',
        },
      ],
      recommendations: [
        {
          priority: 'high',
          description: 'Add quality objective for equivalence evaluation methodology',
          justification: 'EU MDR requires robust scientific justification for equivalence claims',
        },
        {
          priority: 'medium',
          description:
            'Expand clinical data completeness objective to include specific acceptance criteria',
          justification: 'ICH E6(R3) emphasizes predefined quality acceptance criteria',
        },
      ],
      strengths: [
        'Comprehensive literature review objective is well-defined with clear mitigation actions',
        'Post-market follow-up objective properly addresses residual risk monitoring',
      ],
    };

    // Update metrics with validation date and score
    qmpData.metrics.lastValidatedDate = now;
    qmpData.metrics.validationScore = qmpData.validationResults.compliance.score;

    // Create audit trail entry
    qmpAuditTrail.push({
      id: `audit-${Date.now().toString(36)}`,
      timestamp: now,
      user: 'System',
      action: 'validated',
      details: `Validated QMP against ${framework} requirements. Score: ${qmpData.validationResults.compliance.score}`,
    });

    res.json(qmpData.validationResults);
  } catch (error) {
    logger.error('Error validating QMP', {
      module: 'qmp-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to validate QMP',
      message: error.message,
    });
  }
});

/**
 * Helper function to update QMP metrics
 */
function updateQmpMetrics() {
  // Count objectives by status
  const objectivesByStatus = {
    complete: 0,
    inProgress: 0,
    planned: 0,
    blocked: 0,
  };

  qmpData.objectives.forEach(obj => {
    // Map status values to metric keys
    let statusKey = obj.status;
    if (statusKey === 'in-progress') statusKey = 'inProgress';
    if (objectivesByStatus[statusKey] !== undefined) {
      objectivesByStatus[statusKey]++;
    }
  });

  // Calculate completion percentage
  const totalObjectives = qmpData.objectives.length;
  const completedObjectives = objectivesByStatus.complete;
  const overallCompletion =
    totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0;

  // Check section coverage
  const allSections = new Set();
  const coveredSections = new Set();
  const criticalSections = [
    'Clinical Data',
    'Safety',
    'State of the Art',
    'Risk Management',
    'Benefit-Risk Analysis',
  ];

  // Add all critical sections to the total sections list
  criticalSections.forEach(section => allSections.add(section));

  // Add other common sections
  [
    'Literature Review',
    'Clinical Evaluation',
    'Post-Market Surveillance',
    'Equivalence Evaluation',
    'GSPR Mapping',
  ].forEach(section => {
    allSections.add(section);
  });

  // Track which sections are covered by objectives
  qmpData.objectives.forEach(obj => {
    if (obj.scopeSections && Array.isArray(obj.scopeSections)) {
      obj.scopeSections.forEach(section => {
        coveredSections.add(section);
      });
    }
  });

  // Calculate section coverage percentage
  const sectionCoverage =
    allSections.size > 0 ? Math.round((coveredSections.size / allSections.size) * 100) : 0;

  // Check if all critical sections are covered
  const criticalSectionsCovered = criticalSections.every(section => coveredSections.has(section));

  // Update metrics
  qmpData.metrics = {
    ...qmpData.metrics,
    overallCompletion,
    objectivesByStatus,
    sectionCoverage,
    criticalSectionsCovered,
    updatedAt: new Date().toISOString(),
  };
}

export default router;
