/**
 * CER (Clinical Evaluation Report) API Routes
 * 
 * MDR/IVDR compliant CER generation and management
 */

import express from 'express';
import cerGenerationService from '../services/cerGenerationService';
import { db } from '../db/index.js';
import { cerReports, cerClinicalEvidence, cerTemplates, cerVersionHistory, cerEssentialRequirements } from '../../shared/schema.js';
import { eq, and, desc, like, sql } from 'drizzle-orm';
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

// Generate new CER report
router.post('/generate', authenticateJWT, async (req, res) => {
  try {
    const {
      deviceId,
      templateId,
      regulatoryFramework,
      notifiedBodyId
    } = req.body;

    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const userId = req.user.id;
    
    if (!userId || !organizationId) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    if (!deviceId || !regulatoryFramework) {
      return res.status(400).json({
        error: 'Device ID and regulatory framework are required'
      });
    }

    const cerReport = await cerGenerationService.generateCER({
      deviceId,
      templateId,
      organizationId,
      userId,
      regulatoryFramework,
      notifiedBodyId
    });

    res.status(201).json({
      success: true,
      data: cerReport,
      message: 'CER report generated successfully'
    });
  } catch (error) {
    console.error('Error generating CER:', error);
    res.status(500).json({
      error: 'Failed to generate CER report',
      details: error.message
    });
  }
});

// Get all CER reports for organization
router.get('/reports', authenticateJWT, async (req, res) => {
  try {
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const { status, deviceId, search, limit = 50, offset = 0 } = req.query;

    let query = db
      .select()
      .from(cerReports)
      .where(eq(cerReports.organizationId, organizationId));

    // Apply filters
    const conditions = [eq(cerReports.organizationId, organizationId)];
    
    if (status) {
      conditions.push(eq(cerReports.cerStatus, status));
    }
    
    if (deviceId) {
      conditions.push(eq(cerReports.deviceId, parseInt(deviceId)));
    }
    
    if (search) {
      conditions.push(
        sql`${cerReports.cerNumber} ILIKE ${`%${search}%`} OR ${cerReports.deviceName} ILIKE ${`%${search}%`}`
      );
    }

    const reports = await db
      .select({
        id: cerReports.id,
        cerNumber: cerReports.cerNumber,
        cerVersion: cerReports.cerVersion,
        cerStatus: cerReports.cerStatus,
        deviceName: cerReports.deviceName,
        deviceClass: cerReports.deviceClass,
        regulatoryFramework: cerReports.regulatoryFramework,
        notifiedBodyId: cerReports.notifiedBodyId,
        totalStudiesReviewed: cerReports.totalStudiesReviewed,
        totalPatientsIncluded: cerReports.totalPatientsIncluded,
        reviewDate: cerReports.reviewDate,
        approvalDate: cerReports.approvalDate,
        nextReviewDate: cerReports.nextReviewDate,
        createdAt: cerReports.createdAt,
        updatedAt: cerReports.updatedAt
      })
      .from(cerReports)
      .where(and(...conditions))
      .orderBy(desc(cerReports.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    res.json({
      success: true,
      data: reports,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: reports.length
      }
    });
  } catch (error) {
    console.error('Error fetching CER reports:', error);
    res.status(500).json({
      error: 'Failed to fetch CER reports',
      details: error.message
    });
  }
});

// Get single CER report
router.get('/reports/:id', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const [report] = await db
      .select()
      .from(cerReports)
      .where(
        and(
          eq(cerReports.id, cerReportId),
          eq(cerReports.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!report) {
      return res.status(404).json({
        error: 'CER report not found'
      });
    }

    // Get clinical evidence
    const evidence = await db
      .select()
      .from(cerClinicalEvidence)
      .where(eq(cerClinicalEvidence.cerReportId, cerReportId))
      .orderBy(desc(cerClinicalEvidence.relevanceScore));

    // Get essential requirements
    const requirements = await db
      .select()
      .from(cerEssentialRequirements)
      .where(eq(cerEssentialRequirements.cerReportId, cerReportId));

    res.json({
      success: true,
      data: {
        ...report,
        clinicalEvidenceList: evidence,
        essentialRequirementsList: requirements
      }
    });
  } catch (error) {
    console.error('Error fetching CER report:', error);
    res.status(500).json({
      error: 'Failed to fetch CER report',
      details: error.message
    });
  }
});

// Update CER report
router.put('/reports/:id', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const userId = req.user?.id;
    
    if (!userId || !organizationId) {
      return res.status(401).json({
        error: 'Authentication and organization required'
      });
    }
    const { changeSummary, ...updates } = req.body;

    if (!changeSummary) {
      return res.status(400).json({
        error: 'Change summary is required for updates'
      });
    }

    const updatedReport = await cerGenerationService.updateCerVersion(
      cerReportId,
      updates,
      userId,
      changeSummary,
      organizationId
    );

    res.json({
      success: true,
      data: updatedReport,
      message: 'CER report updated successfully'
    });
  } catch (error) {
    console.error('Error updating CER report:', error);
    res.status(500).json({
      error: 'Failed to update CER report',
      details: error.message
    });
  }
});

// Add clinical evidence to CER
router.post('/reports/:id/evidence', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const userId = req.user?.id;
    
    if (!userId || !organizationId) {
      return res.status(401).json({
        error: 'Authentication and organization required'
      });
    }
    
    // First verify the CER report belongs to the user's organization
    const [report] = await db
      .select()
      .from(cerReports)
      .where(and(
        eq(cerReports.id, cerReportId),
        eq(cerReports.organizationId, organizationId)
      ));
      
    if (!report) {
      return res.status(404).json({
        error: 'CER report not found or access denied'
      });
    }
    
    const evidenceData = req.body;

    const evidence = await cerGenerationService.addClinicalEvidence(
      cerReportId,
      evidenceData,
      userId,
      organizationId
    );

    res.status(201).json({
      success: true,
      data: evidence,
      message: 'Clinical evidence added successfully'
    });
  } catch (error) {
    console.error('Error adding clinical evidence:', error);
    res.status(500).json({
      error: 'Failed to add clinical evidence',
      details: error.message
    });
  }
});

// Get clinical evidence for CER
router.get('/reports/:id/evidence', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const { type, includeInReport } = req.query;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // First verify the CER report belongs to the user's organization
    const [report] = await db
      .select()
      .from(cerReports)
      .where(and(
        eq(cerReports.id, cerReportId),
        eq(cerReports.organizationId, organizationId)
      ));
      
    if (!report) {
      return res.status(404).json({
        error: 'CER report not found or access denied'
      });
    }

    const conditions = [eq(cerClinicalEvidence.cerReportId, cerReportId)];
    
    if (type) {
      conditions.push(eq(cerClinicalEvidence.evidenceType, type));
    }
    
    if (includeInReport !== undefined) {
      conditions.push(eq(cerClinicalEvidence.includeInReport, includeInReport === 'true'));
    }

    const evidence = await db
      .select()
      .from(cerClinicalEvidence)
      .where(and(...conditions))
      .orderBy(desc(cerClinicalEvidence.relevanceScore));

    res.json({
      success: true,
      data: evidence
    });
  } catch (error) {
    console.error('Error fetching clinical evidence:', error);
    res.status(500).json({
      error: 'Failed to fetch clinical evidence',
      details: error.message
    });
  }
});

// Add/update essential requirement assessment
router.post('/reports/:id/requirements', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const requirementData = req.body;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // First verify the CER report belongs to the user's organization
    const [report] = await db
      .select()
      .from(cerReports)
      .where(and(
        eq(cerReports.id, cerReportId),
        eq(cerReports.organizationId, organizationId)
      ));
      
    if (!report) {
      return res.status(404).json({
        error: 'CER report not found or access denied'
      });
    }

    const [requirement] = await db
      .insert(cerEssentialRequirements)
      .values({
        cerReportId,
        ...requirementData
      })
      .onConflictDoUpdate({
        target: [cerEssentialRequirements.cerReportId, cerEssentialRequirements.requirementId],
        set: {
          conformityStatus: requirementData.conformityStatus,
          conformityMethod: requirementData.conformityMethod,
          supportingEvidence: requirementData.supportingEvidence,
          clinicalJustification: requirementData.clinicalJustification,
          assessmentDate: new Date(),
          updatedAt: new Date()
        }
      })
      .returning();

    res.json({
      success: true,
      data: requirement,
      message: 'Essential requirement assessment saved'
    });
  } catch (error) {
    console.error('Error saving essential requirement:', error);
    res.status(500).json({
      error: 'Failed to save essential requirement',
      details: error.message
    });
  }
});

// Export CER report
router.post('/reports/:id/export', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const { format = 'PDF' } = req.body;
    const userId = req.user?.id;
    
    if (!userId || !organizationId) {
      return res.status(401).json({
        error: 'Authentication and organization required'
      });
    }

    // First verify the CER report belongs to the user's organization
    const [report] = await db
      .select()
      .from(cerReports)
      .where(and(
        eq(cerReports.id, cerReportId),
        eq(cerReports.organizationId, organizationId)
      ));
      
    if (!report) {
      return res.status(404).json({
        error: 'CER report not found or access denied'
      });
    }

    if (!['PDF', 'DOCX', 'XML'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid export format. Use PDF, DOCX, or XML'
      });
    }

    const exportResult = await cerGenerationService.exportCer(
      cerReportId,
      format,
      userId,
      organizationId
    );

    // Set appropriate content type
    let contentType;
    switch (format) {
      case 'PDF':
        contentType = 'application/pdf';
        break;
      case 'DOCX':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'XML':
        contentType = 'application/xml';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.send(exportResult.content);
  } catch (error) {
    console.error('Error exporting CER report:', error);
    res.status(500).json({
      error: 'Failed to export CER report',
      details: error.message
    });
  }
});

// Get CER version history
router.get('/reports/:id/versions', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // First verify the CER report belongs to the user's organization
    const [report] = await db
      .select()
      .from(cerReports)
      .where(and(
        eq(cerReports.id, cerReportId),
        eq(cerReports.organizationId, organizationId)
      ));
      
    if (!report) {
      return res.status(404).json({
        error: 'CER report not found or access denied'
      });
    }

    const versions = await db
      .select()
      .from(cerVersionHistory)
      .where(eq(cerVersionHistory.cerReportId, cerReportId))
      .orderBy(desc(cerVersionHistory.createdAt));

    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({
      error: 'Failed to fetch version history',
      details: error.message
    });
  }
});

// Get CER templates
router.get('/templates', authenticateJWT, async (req, res) => {
  try {
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }
    const { type, status = 'active' } = req.query;

    const conditions = [
      eq(cerTemplates.organizationId, organizationId),
      eq(cerTemplates.status, status)
    ];
    
    if (type) {
      conditions.push(eq(cerTemplates.templateType, type));
    }

    const templates = await db
      .select({
        id: cerTemplates.id,
        templateId: cerTemplates.templateId,
        templateName: cerTemplates.templateName,
        templateType: cerTemplates.templateType,
        version: cerTemplates.version,
        status: cerTemplates.status,
        description: cerTemplates.description,
        deviceClasses: cerTemplates.deviceClasses,
        regulatoryFrameworks: cerTemplates.regulatoryFrameworks,
        timesUsed: cerTemplates.timesUsed,
        averageRating: cerTemplates.averageRating,
        createdAt: cerTemplates.createdAt
      })
      .from(cerTemplates)
      .where(and(...conditions))
      .orderBy(desc(cerTemplates.timesUsed));

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching CER templates:', error);
    res.status(500).json({
      error: 'Failed to fetch CER templates',
      details: error.message
    });
  }
});

// Approve CER report
router.post('/reports/:id/approve', authenticateJWT, async (req, res) => {
  try {
    const cerReportId = parseInt(req.params.id);
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    const userId = req.user?.id;
    
    if (!userId || !organizationId) {
      return res.status(401).json({
        error: 'Authentication and organization required'
      });
    }
    const { approvalNotes, clinicalExpertName, clinicalExpertQualifications } = req.body;

    const [updatedReport] = await db
      .update(cerReports)
      .set({
        cerStatus: 'approved',
        approvalDate: new Date(),
        clinicalExpertId: userId,
        clinicalExpertName,
        clinicalExpertQualifications,
        reviewDate: new Date(),
        updatedBy: userId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(cerReports.id, cerReportId),
          eq(cerReports.organizationId, organizationId)
        )
      )
      .returning();

    if (!updatedReport) {
      return res.status(404).json({
        error: 'CER report not found'
      });
    }

    res.json({
      success: true,
      data: updatedReport,
      message: 'CER report approved successfully'
    });
  } catch (error) {
    console.error('Error approving CER report:', error);
    res.status(500).json({
      error: 'Failed to approve CER report',
      details: error.message
    });
  }
});

// Get CER statistics
router.get('/statistics', authenticateJWT, async (req, res) => {
  try {
    // SECURITY: Get organization ONLY from verified JWT token
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const stats = await db
      .select({
        totalReports: sql`count(*)`,
        draftReports: sql`sum(case when cer_status = 'draft' then 1 else 0 end)`,
        underReview: sql`sum(case when cer_status = 'under_review' then 1 else 0 end)`,
        approved: sql`sum(case when cer_status = 'approved' then 1 else 0 end)`,
        totalStudies: sql`sum(total_studies_reviewed)`,
        totalPatients: sql`sum(total_patients_included)`,
        avgStudiesPerReport: sql`avg(total_studies_reviewed)`,
        avgPatientsPerReport: sql`avg(total_patients_included)`
      })
      .from(cerReports)
      .where(eq(cerReports.organizationId, organizationId));

    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Error fetching CER statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch CER statistics',
      details: error.message
    });
  }
});

export default router;