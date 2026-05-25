import { Request, Response, Router } from 'express';
import { templateService } from '../../services/templateService';
// Document templates now use ectdTemplates table
import multer from 'multer';
import path from 'path';
import crypto from 'node:crypto';
import { db } from '../../db';
import { ectdTemplates } from '../../../shared/schema';
import { eq, and, or, like, sql, type SQL } from 'drizzle-orm';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/templates/'); // Make sure this directory exists
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow common document formats
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only document files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * GET /api/templates
 * Get all templates with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const { category, region, search } = req.query;

    const filters = {
      category: category as string,
      region: region as string,
      searchQuery: search as string,
    };

    const result = await templateService.getAllTemplates(organizationId, filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

/**
 * GET /api/templates/catalog
 * Get all templates from catalog with filtering options
 */
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const { 
      category, 
      region, 
      module, 
      search, 
      tags,
      organizationId = '6' 
    } = req.query;
    
    let conditions: (SQL<unknown> | undefined)[] = [
      eq(ectdTemplates.organizationId, parseInt(organizationId as string)),
      eq(ectdTemplates.isActive, true)
    ];
    
    // Add category filter
    if (category) {
      conditions.push(eq(ectdTemplates.category, category as string));
    }
    
    // Add module filter
    if (module) {
      conditions.push(like(ectdTemplates.moduleNumber, `${module}%`));
    }
    
    // Add search filter
    if (search) {
      conditions.push(
        or(
          like(ectdTemplates.templateName, `%${search}%`),
          like(ectdTemplates.content, `%${search}%`)
        )
      );
    }
    
    // Get all templates matching base conditions
    let templates = await db
      .select()
      .from(ectdTemplates)
      .where(and(...conditions));
    
    // Filter by region (stored in tags)
    if (region) {
      templates = templates.filter((t: any) => 
        t.tags && t.tags.includes((region as string).toLowerCase())
      );
    }
    
    // Filter by specific tags
    if (tags) {
      const tagArray = (tags as string).split(',');
      templates = templates.filter((t: any) => 
        t.tags && tagArray.some(tag => t.tags.includes(tag))
      );
    }
    
    // Group templates by category for better organization
    const categorized: any = {
      fda: [],
      ema: [],
      pmda: [],
      ich: [],
      therapeutic: [],
      'clinical-ops': [],
      'patient-materials': [],
      modality: [],
      quality: [],
      regulatory: [],
      other: []
    };
    
    // Categorize templates based on tags
    templates.forEach((template: any) => {
      const tags = template.tags || [];
      
      if (tags.includes('fda')) {
        categorized.fda.push(template);
      } else if (tags.includes('ema')) {
        categorized.ema.push(template);
      } else if (tags.includes('pmda')) {
        categorized.pmda.push(template);
      } else if (tags.includes('ich')) {
        categorized.ich.push(template);
      } else if (tags.includes('therapeutic')) {
        categorized.therapeutic.push(template);
      } else if (tags.includes('clinical-ops')) {
        categorized['clinical-ops'].push(template);
      } else if (tags.includes('patient-materials')) {
        categorized['patient-materials'].push(template);
      } else if (tags.includes('modality')) {
        categorized.modality.push(template);
      } else if (tags.includes('quality')) {
        categorized.quality.push(template);
      } else if (tags.includes('regulatory')) {
        categorized.regulatory.push(template);
      } else {
        categorized.other.push(template);
      }
    });
    
    // Calculate counts
    const counts = {
      total: templates.length,
      fda: categorized.fda.length,
      ema: categorized.ema.length,
      pmda: categorized.pmda.length,
      ich: categorized.ich.length,
      therapeutic: categorized.therapeutic.length,
      clinicalOps: categorized['clinical-ops'].length,
      patientMaterials: categorized['patient-materials'].length,
      modality: categorized.modality.length,
      quality: categorized.quality.length,
      regulatory: categorized.regulatory.length
    };
    
    res.json({
      success: true,
      data: {
        templates,
        categorized,
        counts
      }
    });
  } catch (error) {
    console.error('Error fetching template catalog:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template catalog',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/templates/:id
 * Get specific template by ID (supports both numeric and string IDs)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const id = String(req.params.id);

    let template = null;

    // Try numeric ID first
    const numericId = parseInt(id);
    if (!isNaN(numericId)) {
      template = await templateService.getTemplateById(numericId, organizationId);
    }
    
    // If not found with numeric ID or ID is not numeric, try string-based search
    if (!template) {
      // Try to get template by templateName or match string ID against id
      const templates = await db.select().from(ectdTemplates)
        .where(and(
          or(
            eq(ectdTemplates.templateName, id),
            eq(sql`CAST(${ectdTemplates.id} AS TEXT)`, id)
          ),
          eq(ectdTemplates.organizationId, organizationId)
        ));
      
      if (templates.length > 0) {
        template = templates[0];
      }
    }
    
    // If still not found, check in-memory templates or catalog
    if (!template) {
      const allTemplates = await templateService.getAllTemplates(organizationId, {});
      const foundTemplate = allTemplates.templates?.find((t: any) => 
        t.id === id || t.templateId === id || t.id === numericId
      );
      if (foundTemplate) {
        template = foundTemplate;
      }
    }

    // If no template found in DB, return 404 — no mock data
    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template with ID '${id}' not found`
      });
    }

    // `template` is a union of differently-shaped sources (raw DB row, the
    // transformed getTemplateById result, and the in-memory catalog entry).
    // Normalize to a permissive record so the response can pull optional
    // fallback fields from any variant without losing runtime behavior.
    const t = template as Record<string, any>;

    // Return template in expected format
    res.json({
      success: true,
      template: {
        id: t.id || t.templateId,
        templateName: t.templateName || t.name,
        description: t.description || '',
        content: t.content || t.structure || '',
        sections: t.sections || [],
        category: t.category || 'General',
        tags: t.tags || [],
        agency: t.agency || '',
        format: t.format || 'html',
        moduleNumber: t.moduleNumber,
        version: t.version || '1.0.0',
        metadata: {
          createdAt: t.createdAt || t.created_at || new Date().toISOString(),
          updatedAt: t.updatedAt || t.updated_at || new Date().toISOString(),
          status: t.status || t.isActive ? 'active' : 'inactive'
        }
      },
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
    });
  }
});

/**
 * POST /api/templates
 * Create new template
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { name, category, module, description, templateType, granuleId, ichGuidance, tags } =
      req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name and category are required',
      });
    }

    const templateData = {
      name,
      category,
      module,
      description,
      templateType,
      granuleId,
      ichGuidance,
      tags: tags ? tags.split(',').map((tag: any) => tag.trim()) : [],
      organizationId,
      createdBy: 1, // TODO: Get from authentication
    };

    const newTemplate = await templateService.createTemplate(templateData);

    res.status(201).json({
      success: true,
      template: newTemplate,
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    });
  }
});

/**
 * POST /api/templates/upload
 * Upload template file
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { name, category, module, description } = req.body;

    const templateData = {
      organizationId,
      name,
      category,
      module,
      description,
      type: 'uploaded',
      fileUrl: `/uploads/templates/${req.file.filename}`,
      fileSize: req.file.size,
      fileType: path.extname(req.file.originalname).substring(1),
      version: '1.0.0',
      tags: [category, 'uploaded'],
      createdBy: 1,
    };

    const newTemplate = await templateService.createTemplate(templateData);

    res.status(201).json({
      success: true,
      template: newTemplate,
    });
  } catch (error) {
    console.error('Error uploading template:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload template',
    });
  }
});

/**
 * PUT /api/templates/:id
 * Update existing template
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const templateId = parseInt(String(req.params.id));

    const updatedTemplate = await templateService.updateTemplate(
      templateId,
      organizationId,
      req.body
    );

    if (!updatedTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      template: updatedTemplate,
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update template',
    });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete template (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const templateId = parseInt(String(req.params.id));

    const deletedTemplate = await templateService.deleteTemplate(templateId, organizationId);

    if (!deletedTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template',
    });
  }
});

/**
 * POST /api/templates/:id/use
 * Track template usage
 */
router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const templateId = parseInt(String(req.params.id));
    const userId = parseInt(req.headers['x-user-id'] as string);
    if (!userId) {
      return res.status(401).json({ error: 'User context required (x-user-id header)' });
    }

    const usageType = req.body.usageType || 'create_new';

    const usage = await templateService.trackTemplateUsage(templateId, usageType);

    res.json({
      success: true,
      usage: usage,
    });
  } catch (error) {
    console.error('Error tracking template usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track template usage',
    });
  }
});

/**
 * GET /api/templates/recent
 * Get recent documents
 */
router.get('/recent/documents', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const userId = parseInt(req.headers['x-user-id'] as string);
    if (!userId) {
      return res.status(401).json({ error: 'User context required (x-user-id header)' });
    }

    const recentDocs = await templateService.getRecentDocuments(userId, organizationId);

    res.json({
      success: true,
      documents: recentDocs,
    });
  } catch (error) {
    console.error('Error fetching recent documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent documents',
    });
  }
});

/**
 * GET /api/templates/featured
 * Get featured templates
 */
router.get('/featured/list', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantId || (req as any).tenantContext?.organizationId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const featured = await templateService.getFeaturedTemplates(organizationId);

    res.json({
      success: true,
      templates: featured,
    });
  } catch (error) {
    console.error('Error fetching featured templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured templates',
    });
  }
});

export default router;
