/**
 * Templates Routes
 * 
 * Production-ready API routes for template management with full PostgreSQL persistence.
 * Supports both IND templates and eCTD document templates.
 */

import express from 'express';
import { db } from '../db';
import { eq, and, desc, like, or, inArray, sql, isNull } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { generateTemplateId } from '../utils/id-generator';
import { createScopedLogger } from '../utils/logger';

const router = express.Router();
const logger = createScopedLogger('templates-routes');

function requireOrganizationId(req: express.Request, res: express.Response): number | null {
  const rawOrgId = req.user?.organizationId;
  const organizationId = Number(rawOrgId);
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  return organizationId;
}

/**
 * GET /api/templates
 * Get all templates (both IND and document templates)
 */
router.get('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const organizationId = requireOrganizationId(req, res);
    if (organizationId == null) return;
    const { category, type, region, moduleType } = req.query;
    
    // Get IND templates
    const indConditions: any[] = [
      or(
        eq(schema.indTemplates.organizationId, organizationId),
        eq(schema.indTemplates.isPublic, true)
      ),
      eq(schema.indTemplates.status, 'active')
    ];
    
    if (category) {
      indConditions.push(eq(schema.indTemplates.category, category as string));
    }
    if (type) {
      indConditions.push(eq(schema.indTemplates.type, type as string));
    }
    if (region) {
      indConditions.push(eq(schema.indTemplates.region, region as string));
    }
    
    const indTemplates = await db
      .select()
      .from(schema.indTemplates)
      .where(indConditions.length > 0 ? and(...indConditions) : undefined)
      .orderBy(desc(schema.indTemplates.usageCount));
    
    // Get document templates
    const docConditions: any[] = [
      eq(schema.documentTemplates.status, 'active')
    ];
    
    // Note: organizationId cannot be null in documentTemplates, so we just filter by org
    docConditions.push(eq(schema.documentTemplates.organizationId, organizationId));
    
    const documentTemplates = await db
      .select()
      .from(schema.documentTemplates)
      .where(docConditions.length > 0 ? and(...docConditions) : undefined)
      .orderBy(desc(schema.documentTemplates.createdAt));
    
    // Get eCTD templates
    // Note: ectdTemplates doesn't have a status column, so we skip that filter
    const ectdConditions: any[] = [];
    
    // organizationId can be null in ectdTemplates
    ectdConditions.push(
      or(
        eq(schema.ectdTemplates.organizationId, organizationId),
        isNull(schema.ectdTemplates.organizationId)
      )
    );
    
    const ectdTemplates = await db
      .select()
      .from(schema.ectdTemplates)
      .where(ectdConditions.length > 0 ? and(...ectdConditions) : undefined)
      .orderBy(desc(schema.ectdTemplates.updatedAt));
    
    // Format and combine templates
    const allTemplates = [
      ...indTemplates.map(t => ({
        id: t.templateId,
        name: t.name,
        description: t.description,
        category: t.category,
        type: t.type || 'IND',
        region: t.region,
        sections: t.sections,
        metadata: t.metadata,
        usageCount: t.usageCount,
        source: 'ind'
      })),
      ...documentTemplates.map(t => ({
        id: t.id.toString(), // documentTemplates uses id, not templateId
        name: t.name,
        description: t.description,
        category: t.category,
        type: t.type || 'Document',
        content: t.content,
        metadata: t.metadata,
        source: 'document'
      })),
      ...ectdTemplates.map(t => ({
        id: t.id.toString(), // ectdTemplates uses id, not templateId
        name: t.templateName, // ectdTemplates uses templateName, not name
        description: t.category, // ectdTemplates doesn't have description, use category
        category: 'eCTD',
        type: t.templateType || t.moduleNumber, // ectdTemplates uses templateType, not moduleType
        sections: t.placeholders, // ectdTemplates uses placeholders, not sections
        metadata: null, // ectdTemplates doesn't have metadata column
        source: 'ectd'
      }))
    ];
    
    res.json({
      templates: allTemplates,
      count: allTemplates.length
    });
  } catch (error) {
    logger.error('Failed to fetch templates:', error as any);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/templates/coauthor
 * Get templates specifically for eCTD Co-Author
 */
router.get('/coauthor', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const organizationId = requireOrganizationId(req, res);
    if (organizationId == null) return;
    
    // Get eCTD specific templates
    const ectdConditions: any[] = [];
    
    // organizationId can be null in ectdTemplates
    ectdConditions.push(
      or(
        eq(schema.ectdTemplates.organizationId, organizationId),
        isNull(schema.ectdTemplates.organizationId)
      )
    );
    
    const ectdTemplates = await db
      .select()
      .from(schema.ectdTemplates)
      .where(ectdConditions.length > 0 ? and(...ectdConditions) : undefined)
      .orderBy(desc(schema.ectdTemplates.updatedAt));
    
    // Get IND templates that are eCTD compatible
    const indTemplates = await db
      .select()
      .from(schema.indTemplates)
      .where(
        and(
          eq(schema.indTemplates.category, 'ectd'),
          eq(schema.indTemplates.status, 'active'),
          or(
            eq(schema.indTemplates.organizationId, organizationId),
            eq(schema.indTemplates.isPublic, true)
          )
        )
      )
      .orderBy(desc(schema.indTemplates.usageCount));
    
    // Default templates if none exist
    const defaultTemplates = [];
    
    if (ectdTemplates.length === 0 && indTemplates.length === 0) {
      defaultTemplates.push(
        {
          id: 'default-ich-e3',
          name: 'ICH E3 Full Template',
          description: 'Complete ICH E3 clinical study report template',
          category: 'eCTD',
          type: 'ICH-E3',
          sections: [
            { id: 'title-page', name: 'Title Page', required: true },
            { id: 'synopsis', name: 'Synopsis', required: true },
            { id: 'introduction', name: 'Introduction', required: true },
            { id: 'study-objectives', name: 'Study Objectives', required: true },
            { id: 'methods', name: 'Methods', required: true },
            { id: 'results', name: 'Results', required: true },
            { id: 'discussion', name: 'Discussion and Conclusions', required: true },
            { id: 'references', name: 'References', required: false },
            { id: 'appendices', name: 'Appendices', required: false }
          ],
          source: 'default'
        },
        {
          id: 'default-ctd-m2',
          name: 'CTD Module 2 Template',
          description: 'Common Technical Document Module 2 summaries',
          category: 'eCTD',
          type: 'CTD-M2',
          sections: [
            { id: 'quality-summary', name: 'Quality Overall Summary', required: true },
            { id: 'nonclinical-summary', name: 'Nonclinical Summary', required: true },
            { id: 'clinical-summary', name: 'Clinical Summary', required: true },
            { id: 'nonclinical-overview', name: 'Nonclinical Overview', required: false },
            { id: 'clinical-overview', name: 'Clinical Overview', required: true }
          ],
          source: 'default'
        },
        {
          id: 'default-ind-protocol',
          name: 'IND Protocol Template',
          description: 'FDA IND protocol template',
          category: 'eCTD',
          type: 'IND',
          sections: [
            { id: 'protocol-title', name: 'Protocol Title', required: true },
            { id: 'protocol-summary', name: 'Protocol Summary', required: true },
            { id: 'objectives', name: 'Objectives', required: true },
            { id: 'study-design', name: 'Study Design', required: true },
            { id: 'population', name: 'Study Population', required: true },
            { id: 'treatment', name: 'Treatment', required: true },
            { id: 'assessments', name: 'Assessments', required: true },
            { id: 'statistics', name: 'Statistics', required: true },
            { id: 'ethics', name: 'Ethics', required: true }
          ],
          source: 'default'
        }
      );
    }
    
    const allTemplates = [
      ...ectdTemplates.map(t => ({
        id: t.id.toString(), // Use id not templateId
        name: t.templateName, // Use templateName not name
        description: t.category || 'eCTD Template', // No description column
        category: 'eCTD',
        type: t.templateType || t.moduleNumber, // Use templateType not moduleType
        sections: t.placeholders || [], // Use placeholders not sections
        metadata: null, // ectdTemplates doesn't have metadata column
        lastModified: t.updatedAt, // Use updatedAt not lastModified
        source: 'ectd'
      })),
      ...indTemplates.map(t => ({
        id: t.templateId,
        name: t.name,
        description: t.description,
        category: t.category,
        type: t.type,
        sections: t.sections,
        metadata: t.metadata,
        lastModified: t.updatedAt,
        source: 'ind'
      })),
      ...defaultTemplates
    ];
    
    res.json({
      templates: allTemplates,
      count: allTemplates.length,
      hasDefaults: defaultTemplates.length > 0
    });
  } catch (error) {
    logger.error('Failed to fetch CoAuthor templates:', error as any);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/templates
 * Create a new template
 */
router.post('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const organizationId = requireOrganizationId(req, res);
    if (organizationId == null) return;
    const userId = req.user?.id != null ? Number(req.user.id) : undefined;
    const { name, description, category, type, content, sections, metadata } = req.body;
    
    const templateId = generateTemplateId(category);
    
    let createdTemplate: any;
    
    if (category === 'ectd' || type === 'eCTD') {
      // Create eCTD template
      const [template] = await db
        .insert(schema.ectdTemplates)
        .values({
          organizationId: organizationId,
          templateName: name, // Use templateName not name
          granuleId: null,
          moduleNumber: type || 'M2',
          category: category || 'eCTD',
          templateType: type || 'standard', // Use templateType not moduleType
          content,
          placeholders: sections || null, // Use placeholders not sections
          tags: null,
          isActive: true,
          version: '1.0',
          createdBy: userId
        })
        .returning();
      
      createdTemplate = {
        ...template,
        templateId: template.id.toString(),
        name: template.templateName
      };
    } else if (category === 'ind' || category === 'IND') {
      // Create IND template
      const [template] = await db
        .insert(schema.indTemplates)
        .values({
          templateId,
          organizationId,
          name,
          description,
          category,
          type: type || 'FDA',
          content,
          sections,
          metadata,
          status: 'active',
          isPublic: false,
          createdById: userId,
          updatedById: userId
        })
        .returning();
      
      createdTemplate = template;
    } else {
      // Create document template
      const [template] = await db
        .insert(schema.documentTemplates)
        .values({
          organizationId,
          name,
          description,
          category,
          type: type || 'general', // Use type not documentType
          content,
          metadata,
          status: 'active',
          createdById: userId
        })
        .returning();
      
      createdTemplate = {
        ...template,
        templateId: template.id.toString()
      };
    }
    
    res.json({
      success: true,
      template: {
        id: createdTemplate.templateId || createdTemplate.id,
        name: createdTemplate.name || createdTemplate.templateName,
        category
      }
    });
  } catch (error) {
    logger.error('Failed to create template:', error as any);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * GET /api/templates/:templateId
 * Get a specific template
 */
router.get('/:templateId', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { templateId } = req.params;
    
    // Try to find in IND templates
    const indTemplate = await db
      .select()
      .from(schema.indTemplates)
      .where(eq(schema.indTemplates.templateId, templateId))
      .limit(1);
    
    if (indTemplate.length > 0) {
      return res.json({
        template: indTemplate[0],
        source: 'ind'
      });
    }
    
    // Try eCTD templates by id (since they don't have templateId)
    let ectdTemplate: any[] = [];
    
    // Check if templateId is numeric for eCTD templates
    const numericId = parseInt(templateId);
    if (!isNaN(numericId)) {
      ectdTemplate = await db
        .select()
        .from(schema.ectdTemplates)
        .where(eq(schema.ectdTemplates.id, numericId))
        .limit(1);
    }
    
    if (ectdTemplate.length > 0) {
      return res.json({
        template: {
          ...ectdTemplate[0],
          templateId: ectdTemplate[0].id.toString(),
          name: ectdTemplate[0].templateName,
          sections: ectdTemplate[0].placeholders
        },
        source: 'ectd'
      });
    }
    
    // Try document templates by id
    const docTemplateById = parseInt(templateId);
    let docTemplate: any[] = [];
    
    if (!isNaN(docTemplateById)) {
      docTemplate = await db
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, docTemplateById))
        .limit(1);
    }
    
    if (docTemplate.length > 0) {
      return res.json({
        template: {
          ...docTemplate[0],
          templateId: docTemplate[0].id.toString()
        },
        source: 'document'
      });
    }
    
    res.status(404).json({ error: 'Template not found' });
  } catch (error) {
    logger.error('Failed to fetch template:', error as any);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/templates/:templateId/use
 * Track template usage
 */
router.post('/:templateId/use', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { templateId } = req.params;
    const userId = req.user?.id != null ? Number(req.user.id) : undefined;
    const organizationId = requireOrganizationId(req, res);
    if (organizationId == null) return;
    
    // Update usage count for IND templates
    const indTemplates = await db
      .select()
      .from(schema.indTemplates)
      .where(eq(schema.indTemplates.templateId, templateId))
      .limit(1);
    
    if (indTemplates.length > 0) {
      const currentCount = indTemplates[0].usageCount || 0;
      await db
        .update(schema.indTemplates)
        .set({
          usageCount: currentCount + 1,
          lastUsedAt: new Date()
        })
        .where(eq(schema.indTemplates.templateId, templateId));
      
      // Log usage
      await db
        .insert(schema.indTemplateUsageLogs)
        .values({
          templateId,
          organizationId,
          usedBy: userId,
          usedForEntity: 'document',
          usedForEntityId: req.body.documentId || 'unknown',
          timeSpent: 0,
          changesCount: 0,
          completionScore: 0
        });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to track template usage:', error as any);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

export default router;