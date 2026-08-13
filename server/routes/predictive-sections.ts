/**
 * Predictive Document Section Suggestions API Routes
 *
 * Provides intelligent section recommendations based on document context,
 * regulatory patterns, and AI analysis for eCTD Co-Author workflow.
 */

import { Router } from 'express';
import predictiveSectionService from '../services/predictiveSectionService';
import { getPool } from '../db';
import { getSecureOrgId } from '../utils/tenantContext';

const router = Router();
const pool = getPool();

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

    // This route previously answered from a hardcoded object literal — three
    // invented template definitions for sections 2.5, 2.7 and 510k.2, with
    // invented ids ('clinical-overview-pediatric') that resolve to no stored
    // template — and reported an honest-looking empty list for every other
    // section. An author picking one of those ids got a template the platform
    // does not have. The real catalog is `document_templates` (org-scoped,
    // keyed by module/region), so read it.
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // `module` carries the eCTD/section code and `region` the agency. Both are
    // nullable in the catalog, so a template with an unset region still matches
    // a region-qualified request rather than disappearing from it.
    const result = await pool.query(
      `SELECT id, name, description, category, module, region, version, tags
         FROM document_templates
        WHERE organization_id = $1
          AND status = 'active'
          AND module = $2
          AND (region IS NULL OR region = $3)
        ORDER BY name`,
      [Number(organizationId), String(sectionCode), String(regulatoryRegion)],
    );

    const templates = result.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      description: row.description,
      category: row.category,
      version: row.version,
      tags: Array.isArray(row.tags) ? row.tags : [],
    }));

    res.json({
      success: true,
      sectionCode,
      templates,
      submissionType,
      regulatoryRegion,
      // Honest empty state: the org has published no template for this section.
      // It is NOT a claim that no such template could exist.
      message: templates.length === 0 ? 'No templates published for this section' : undefined,
    });
  } catch (error: any) {
    // A catalog read that failed is not an empty catalog — see the sibling
    // reads in this codebase. 42P01 means the template store was never
    // provisioned, which is an operator condition, not "no templates".
    console.error('[predictive-sections] template catalog read failed:', error?.message);
    if (error?.code === '42P01') {
      return res.status(503).json({
        error: 'Template catalog is not provisioned',
        code: 'TEMPLATE_STORE_UNPROVISIONED',
      });
    }
    res.status(500).json({ error: 'Failed to fetch templates' });
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
      existingSections: sectionsArray.map(String),
      regulatoryRegion: 'FDA' as any,
    };

    const predictions = await predictiveSectionService.getSectionSuggestions(context as any);

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
