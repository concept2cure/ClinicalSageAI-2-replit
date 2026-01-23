import { Router, Request, Response } from 'express';
import { validateSchema } from '../middleware/validateSchema';
import PredicateFinderService from '../services/PredicateFinderService';
import LiteratureService from '../services/LiteratureService';
import PathwayAdvisor from '../services/PathwayAdvisor';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Generate a UUID-like ID without external dependencies
const generateId = () => {
  return crypto.randomBytes(16).toString('hex');
};

const router = Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

// Simple in-memory storage for device profiles during development
// In production, this would use a database
const deviceProfiles = new Map();

/**
 * Load compliance rules from configuration file
 */
const loadComplianceRules = () => {
  try {
    // In ES modules, __dirname is not available, use relative path from project root
    const rulesPath = './server/config/complianceRules/510k.json';
    const rulesData = fs.readFileSync(rulesPath, 'utf8');
    return JSON.parse(rulesData);
  } catch (error) {
    console.error('Failed to load compliance rules:', error);
    return {
      requiredSections: [],
      deviceClassRules: {},
      templateWarnings: [],
    };
  }
};

// Load compliance rules on startup
const complianceRules = loadComplianceRules();

/**
 * Middleware to extract tenant context from request
 */
const extractTenantContext = (req: Request, res: Response, next: Function) => {
  // Extract organization ID and client workspace ID from request headers
  const organizationId = (req.headers['x-organization-id'] as string) || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;
  const module = (req.headers['x-module'] as string) || null;

  // Set tenant context on request object
  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module,
  };

  // Log tenant context for debugging
  console.log('Tenant Context:', (req as any).tenantContext);

  next();
};

// Apply tenant context middleware to all routes
router.use(extractTenantContext);

/**
 * @route GET /api/510k/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: '510k-automation-api',
  });
});

/**
 * @route POST /api/510k/device-profile
 * @desc Create or update a device profile
 * @access Private
 */
router.post(
  '/device-profile',
  validateSchema('deviceProfile'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, clientWorkspaceId } = (req as any).tenantContext;

      const deviceProfile = {
        ...req.body,
        id: req.body.id || generateId(),
        organizationId,
        clientWorkspaceId,
        updated: new Date().toISOString(),
      };

      // If it's a new profile, set created date
      if (!req.body.id) {
        deviceProfile.created = deviceProfile.updated;
      }

      // Store in memory (in production, would save to database)
      const profileKey = `${organizationId || 'global'}_${deviceProfile.id}`;
      deviceProfiles.set(profileKey, deviceProfile);

      res.json({
        success: true,
        deviceProfile,
      });
    } catch (error) {
      console.error('Error saving device profile:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save device profile',
      });
    }
  }
);

/**
 * @route GET /api/510k/device-profile/:id
 * @desc Get a device profile by ID
 * @access Private
 */
router.get('/device-profile/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId } = (req as any).tenantContext;
    const profileId = req.params.id;

    // Look up profile in memory (in production, would query database)
    const profileKey = `${organizationId || 'global'}_${profileId}`;
    const deviceProfile = deviceProfiles.get(profileKey);

    if (!deviceProfile) {
      return res.status(404).json({
        success: false,
        error: 'Device profile not found',
      });
    }

    res.json({
      success: true,
      deviceProfile,
    });
  } catch (error) {
    console.error('Error fetching device profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device profile',
    });
  }
});

/**
 * @route GET /api/510k/device-profiles
 * @desc Get all device profiles for the organization
 * @access Private
 */
router.get('/device-profiles', async (req: Request, res: Response) => {
  try {
    const { organizationId } = (req as any).tenantContext;

    // Filter profiles by organization (in production, would query database)
    const profiles = Array.from(deviceProfiles.entries())
      .filter(([key]) => key.startsWith(`${organizationId || 'global'}_`))
      .map(([, profile]) => profile);

    res.json({
      success: true,
      profiles,
    });
  } catch (error) {
    console.error('Error fetching device profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device profiles',
    });
  }
});

/**
 * @route DELETE /api/510k/device-profile/:id
 * @desc Delete a device profile
 * @access Private
 */
router.delete('/device-profile/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId } = (req as any).tenantContext;
    const profileId = req.params.id;

    // Delete profile from memory (in production, would delete from database)
    const profileKey = `${organizationId || 'global'}_${profileId}`;
    const exists = deviceProfiles.has(profileKey);

    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Device profile not found',
      });
    }

    deviceProfiles.delete(profileKey);

    res.json({
      success: true,
      message: 'Device profile deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting device profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete device profile',
    });
  }
});

/**
 * @route POST /api/510k/predicate-search
 * @desc Search for potential predicate devices
 * @access Private
 */
router.post(
  '/predicate-search',
  validateSchema('deviceProfile'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as any).tenantContext;

      // Extract search parameters from request body
      const { deviceName, manufacturer, productCode, intendedUse, keywords, limit } = req.body;

      // Call predicate finder service
      const predicates = await PredicateFinderService.findPredicates({
        deviceName,
        manufacturer,
        productCode,
        intendedUse,
        keywords,
        limit,
        organizationId,
      });

      res.json({
        success: true,
        predicates,
      });
    } catch (error) {
      console.error('Error searching for predicates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search for predicate devices',
      });
    }
  }
);

/**
 * @route GET /api/510k/predicate/:id
 * @desc Get predicate device by ID
 * @access Private
 */
router.get('/predicate/:id', async (req: Request, res: Response) => {
  try {
    const predicate = await PredicateFinderService.getPredicateById(req.params.id);

    if (!predicate) {
      return res.status(404).json({
        success: false,
        error: 'Predicate device not found',
      });
    }

    res.json({
      success: true,
      predicate,
    });
  } catch (error) {
    console.error('Error fetching predicate device:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch predicate device',
    });
  }
});

/**
 * @route POST /api/510k/literature-search
 * @desc Search for relevant literature
 * @access Private
 */
router.post(
  '/literature-search',
  validateSchema('deviceProfile'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as any).tenantContext;

      // Extract search parameters from request body
      const { deviceName, manufacturer, medicalSpecialty, intendedUse, keywords, limit } = req.body;

      // Call literature service
      const articles = await LiteratureService.searchLiterature({
        deviceName,
        manufacturer,
        medicalSpecialty,
        intendedUse,
        keywords,
        limit,
        organizationId,
      });

      res.json({
        success: true,
        articles,
      });
    } catch (error) {
      console.error('Error searching for literature:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search for literature',
      });
    }
  }
);

/**
 * @route GET /api/510k/article/:pmid
 * @desc Get article by PubMed ID
 * @access Private
 */
router.get('/article/:pmid', async (req: Request, res: Response) => {
  try {
    const article = await LiteratureService.getArticleById(req.params.pmid);

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found',
      });
    }

    res.json({
      success: true,
      article,
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch article',
    });
  }
});

/**
 * @route POST /api/510k/regulatory-pathway
 * @desc Analyze regulatory pathway
 * @access Private
 */
router.post(
  '/regulatory-pathway',
  validateSchema('deviceProfile'),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = (req as any).tenantContext;

      // Extract device profile and predicates from request body
      const { deviceProfile, predicateDevices } = req.body;

      // Set organization ID from tenant context
      const profileWithTenant = {
        ...deviceProfile,
        organizationId,
      };

      // Call pathway advisor service
      const recommendation = await PathwayAdvisor.analyzeRegulatoryPathway(
        profileWithTenant,
        predicateDevices || []
      );

      res.json({
        success: true,
        recommendation,
      });
    } catch (error) {
      console.error('Error analyzing regulatory pathway:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze regulatory pathway',
      });
    }
  }
);

/**
 * @route POST /api/510k/generate-section
 * @desc Generate AI draft for a section
 * @access Private
 */
router.post('/generate-section', async (req: Request, res: Response) => {
  try {
    if (!isDemoMode()) {
      return res.status(501).json({
        success: false,
        error: 'AI section generation is not configured. Set DEMO_MODE=true for mock output.',
      });
    }
    const { organizationId } = (req as any).tenantContext;

    // Extract section type and device profile from request body
    const { sectionType, deviceProfile, predicateDevices } = req.body;

    // TODO: Implement or integrate with AISectionWriter service
    // For now, return a placeholder response
    res.json({
      success: true,
      section: {
        type: sectionType,
        content: `This is a placeholder for the ${sectionType} section content. In production, this would be generated by the AI service.`,
        metadata: {
          generatedAt: new Date().toISOString(),
          deviceName: deviceProfile.deviceName || deviceProfile.name,
          predicatesCount: predicateDevices ? predicateDevices.length : 0,
        },
      },
    });
  } catch (error) {
    console.error('Error generating section:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate section',
    });
  }
});

/**
 * @route POST /api/510k/validate-submission
 * @desc Validate 510(k) submission
 * @access Private
 */
router.post('/validate-submission', async (req: Request, res: Response) => {
  try {
    if (!isDemoMode()) {
      return res.status(501).json({
        success: false,
        error: 'Submission validation is not configured. Set DEMO_MODE=true for mock output.',
      });
    }
    const { organizationId } = (req as any).tenantContext;

    // Extract submission data from request body
    const { submission } = req.body;

    // Load compliance rules for validation
    const rules = complianceRules;

    // TODO: Implement full submission validation logic
    // For now, return a simplified response
    res.json({
      success: true,
      validation: {
        isValid: true,
        missingElements: [],
        suggestions: [
          'Consider adding more details to the Substantial Equivalence section',
          'Ensure all performance test results are included',
        ],
        compliance: {
          requiredSections: true,
          wordCounts: true,
          keyTerms: true,
        },
      },
    });
  } catch (error) {
    console.error('Error validating submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate submission',
    });
  }
});

/**
 * @route GET /api/510k/requirements
 * @desc Get 510(k) submission requirements
 * @access Private
 */
router.get('/requirements', async (req: Request, res: Response) => {
  try {
    const deviceClass = req.query.deviceClass as string;

    // Load requirements from compliance rules
    const allRequirements = complianceRules.requiredSections || [];

    // Add class-specific requirements if applicable
    let classRequirements = [];
    if (
      deviceClass &&
      complianceRules.deviceClassRules &&
      complianceRules.deviceClassRules[deviceClass]
    ) {
      const additionalSections =
        complianceRules.deviceClassRules[deviceClass].additionalSections || [];

      // Convert section IDs to full requirement objects
      classRequirements = additionalSections.map(id => ({
        id,
        name: id
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        required: true,
      }));
    }

    // Combine and format all requirements
    const requirements = [
      ...allRequirements.map(section => ({
        id: section.id,
        name: section.name,
        description: section.description,
        required: true,
        wordCountMin: section.wordCountMin,
        wordCountMax: section.wordCountMax,
      })),
      ...classRequirements,
    ];

    res.json({
      success: true,
      requirements,
    });
  } catch (error) {
    console.error('Error fetching requirements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch requirements',
    });
  }
});

/**
 * @route GET /api/510k/compliance-rules
 * @desc Get compliance rules for 510(k) submissions
 * @access Private
 */
router.get('/compliance-rules', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      rules: complianceRules,
    });
  } catch (error) {
    console.error('Error fetching compliance rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compliance rules',
    });
  }
});

export default router;
