/**
 * Predictive Document Section Suggestions API Routes
 *
 * Provides intelligent section recommendations based on document context,
 * regulatory patterns, and AI analysis for eCTD Co-Author workflow.
 */

import { Router } from 'express';
import predictiveSectionService from '../services/predictiveSectionService';

const router = Router();

/**
 * POST /api/predictive-sections/suggestions
 * Get intelligent section suggestions based on document context
 */
router.post('/suggestions', async (req, res) => {
  try {
    const context = req.body;

    // Validate required fields
    if (!context.documentType || !context.submissionType) {
      return res.status(400).json({
        error: 'Document type and submission type are required',
      });
    }

    // Default values for missing fields
    const enrichedContext = {
      currentSection: context.currentSection || null,
      documentType: context.documentType,
      submissionType: context.submissionType,
      therapeuticArea: context.therapeuticArea || null,
      studyPhase: context.studyPhase || null,
      existingSections: context.existingSections || [],
      documentContent: context.documentContent || null,
      regulatoryRegion: context.regulatoryRegion || 'FDA',
    };

    const predictions = await predictiveSectionService.getSectionSuggestions(enrichedContext);

    res.json({
      success: true,
      data: predictions,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in predictive sections API:', error);
    res.status(500).json({
      error: 'Failed to generate section suggestions',
      message: error.message,
    });
  }
});

/**
 * POST /api/predictive-sections/analyze-document
 * Analyze current document and provide contextual suggestions
 */
router.post('/analyze-document', async (req, res) => {
  try {
    const { documentId, documentContent, metadata } = req.body;

    if (!documentContent && !documentId) {
      return res.status(400).json({
        error: 'Document content or ID is required',
      });
    }

    // Extract context from document analysis
    const context = {
      currentSection: metadata?.currentSection,
      documentType: metadata?.documentType || 'Regulatory Document',
      submissionType: metadata?.submissionType || 'IND',
      therapeuticArea: metadata?.therapeuticArea,
      studyPhase: metadata?.studyPhase,
      existingSections: metadata?.existingSections || [],
      documentContent: documentContent,
      regulatoryRegion: metadata?.regulatoryRegion || 'FDA',
    };

    const predictions = await predictiveSectionService.getSectionSuggestions(context);

    res.json({
      success: true,
      documentId,
      analysis: {
        contextExtracted: true,
        sectionsIdentified: context.existingSections.length,
        completionProgress: predictions.completionProgress,
      },
      predictions,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error analyzing document:', error);
    res.status(500).json({
      error: 'Failed to analyze document',
      message: error.message,
    });
  }
});

/**
 * GET /api/predictive-sections/templates/:sectionCode
 * Get available templates for a specific section
 */
router.get('/templates/:sectionCode', async (req, res) => {
  try {
    const { sectionCode } = req.params;
    const { submissionType = 'IND', regulatoryRegion = 'FDA' } = req.query;

    // Mock template data - in production, this would query a template database
    const templates = {
      '2.5': {
        sectionCode: '2.5',
        title: 'Clinical Overview',
        templates: [
          {
            id: 'clinical-overview-standard',
            name: 'Standard Clinical Overview',
            description: 'ICH M4 compliant clinical overview template',
            sections: [
              'Product Development Background',
              'Clinical Pharmacology',
              'Efficacy Assessment',
              'Safety Assessment',
              'Benefit-Risk Analysis',
            ],
          },
          {
            id: 'clinical-overview-pediatric',
            name: 'Pediatric Clinical Overview',
            description: 'Template for pediatric indications',
            sections: [
              'Pediatric Development Strategy',
              'Age-Appropriate Formulation',
              'Pediatric Clinical Pharmacology',
              'Efficacy in Pediatric Population',
              'Safety in Pediatric Population',
            ],
          },
        ],
      },
      '2.7': {
        sectionCode: '2.7',
        title: 'Clinical Summary',
        templates: [
          {
            id: 'clinical-summary-standard',
            name: 'Standard Clinical Summary',
            description: 'Comprehensive clinical summary template',
            sections: [
              'Summary of Biopharmaceutic Studies',
              'Summary of Clinical Pharmacology Studies',
              'Summary of Clinical Efficacy',
              'Summary of Clinical Safety',
              'Literature References',
            ],
          },
        ],
      },
      '510k.2': {
        sectionCode: '510k.2',
        title: 'Device Description',
        templates: [
          {
            id: '510k-device-description',
            name: '510(k) Device Description',
            description: 'Standard device description template',
            sections: [
              'Device Name and Classification',
              'Intended Use Statement',
              'Device Description',
              'Substantial Equivalence Comparison',
            ],
          },
        ],
      },
    };

    const sectionTemplates = templates[sectionCode as keyof typeof templates];

    if (!sectionTemplates) {
      return res.json({
        success: true,
        sectionCode,
        templates: [],
        message: 'No templates available for this section',
      });
    }

    res.json({
      success: true,
      sectionCode,
      title: sectionTemplates.title,
      templates: sectionTemplates.templates,
      submissionType,
      regulatoryRegion,
    });
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      error: 'Failed to fetch templates',
      message: error.message,
    });
  }
});

/**
 * POST /api/predictive-sections/update-context
 * Update document context and get refreshed suggestions
 */
router.post('/update-context', async (req, res) => {
  try {
    const { documentId, updates } = req.body;

    if (!documentId || !updates) {
      return res.status(400).json({
        error: 'Document ID and updates are required',
      });
    }

    // In production, this would update the document context in database
    // For now, we'll use the provided updates directly

    const context = {
      documentType: updates.documentType || 'Regulatory Document',
      submissionType: updates.submissionType || 'IND',
      currentSection: updates.currentSection,
      therapeuticArea: updates.therapeuticArea,
      studyPhase: updates.studyPhase,
      existingSections: updates.existingSections || [],
      regulatoryRegion: updates.regulatoryRegion || 'FDA',
    };

    const predictions = await predictiveSectionService.getSectionSuggestions(context);

    res.json({
      success: true,
      documentId,
      contextUpdated: true,
      predictions,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating context:', error);
    res.status(500).json({
      error: 'Failed to update context',
      message: error.message,
    });
  }
});

/**
 * GET /api/predictive-sections/completion-status/:submissionType
 * Get completion status and next steps for a submission type
 */
router.get('/completion-status/:submissionType', async (req, res) => {
  try {
    const { submissionType } = req.params;
    const { existingSections = [] } = req.query;

    const sectionsArray: string[] = Array.isArray(existingSections)
      ? existingSections.map(s => String(s))
      : existingSections
          .toString()
          .split(',')
          .filter(s => s.trim());

    const context = {
      documentType: 'Regulatory Submission',
      submissionType: submissionType as any,
      existingSections: sectionsArray,
      regulatoryRegion: 'FDA' as any,
    };

    const predictions = await predictiveSectionService.getSectionSuggestions(context);

    res.json({
      success: true,
      submissionType,
      completionProgress: predictions.completionProgress,
      nextMilestone: predictions.nextMilestone,
      criticalPath: predictions.criticalPath,
      regulatoryGaps: predictions.regulatoryGaps,
      topSuggestions: predictions.suggestions.slice(0, 5),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error getting completion status:', error);
    res.status(500).json({
      error: 'Failed to get completion status',
      message: error.message,
    });
  }
});

export default router;
