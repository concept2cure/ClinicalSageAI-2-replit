/**
 * 510(k) Device Profile Routes (DEPRECATED)
 *
 * @deprecated This route file is deprecated as of 2026-01-26.
 * Please migrate to /api/fda510k-unified/device
 * Sunset date: 2026-06-30
 *
 * @see /api/fda510k-unified/docs for migration guide
 */

import { Router, Request, Response } from 'express';
import { validateSchema } from '../middleware/validateSchema';
import { create510kDeprecationNotice } from '../middleware/deprecation';
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

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/device'));

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
 * @desc Generate AI draft for a section using the AI gateway
 * @access Private
 */
router.post('/generate-section', async (req: Request, res: Response) => {
  try {
    const { organizationId } = (req as any).tenantContext;
    const { sectionType, deviceInfo, deviceProfile, predicateDevices } = req.body;

    // Support both deviceInfo and legacy deviceProfile field
    const device = deviceInfo || deviceProfile;

    if (!sectionType || !device) {
      return res.status(400).json({
        success: false,
        error: 'sectionType and deviceInfo (or deviceProfile) are required',
      });
    }

    const validSectionTypes = [
      'device-description',
      'predicate-comparison',
      'substantial-equivalence',
      'performance-data',
      'biocompatibility',
      'electrical-safety',
      'software',
      'labeling',
      'sterilization',
    ];

    if (!validSectionTypes.includes(sectionType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sectionType. Must be one of: ${validSectionTypes.join(', ')}`,
      });
    }

    // Build section-specific prompts
    const sectionPrompts: Record<string, string> = {
      'device-description':
        `Write a comprehensive Device Description section for a 510(k) submission. ` +
        `Include physical characteristics, materials, components, dimensions, and operating principles.`,
      'predicate-comparison':
        `Write a Predicate Device Comparison section for a 510(k) submission. ` +
        `Compare the subject device with the predicate device(s) across intended use, technological characteristics, and performance.`,
      'substantial-equivalence':
        `Write a Substantial Equivalence Determination section for a 510(k) submission. ` +
        `Demonstrate that the subject device is substantially equivalent to the predicate device(s) per 21 CFR 807.87.`,
      'performance-data':
        `Write a Performance Data section for a 510(k) submission. ` +
        `Summarize bench testing, animal studies (if applicable), and clinical data that support substantial equivalence.`,
      'biocompatibility':
        `Write a Biocompatibility section for a 510(k) submission per ISO 10993 and FDA guidance. ` +
        `Address biological evaluation, material characterization, and applicable biocompatibility tests.`,
      'electrical-safety':
        `Write an Electrical Safety and Electromagnetic Compatibility section for a 510(k) submission. ` +
        `Address IEC 60601-1, IEC 60601-1-2, and applicable collateral/particular standards.`,
      'software':
        `Write a Software Documentation section for a 510(k) submission per FDA guidance on Software in Medical Devices. ` +
        `Address software level of concern, architecture, hazard analysis, and verification/validation.`,
      'labeling':
        `Write a Labeling section for a 510(k) submission. ` +
        `Include proposed labels, instructions for use, warnings, precautions, and contraindications per 21 CFR 801.`,
      'sterilization':
        `Write a Sterilization section for a 510(k) submission. ` +
        `Address sterilization method, validation per applicable standards (ISO 11135, ISO 11137, ISO 17665), ` +
        `sterility assurance level, and residual limits.`,
    };

    const deviceName = device.deviceName || device.name || 'the subject device';
    const deviceClass = device.deviceClass || device.classification || 'II';
    const productCode = device.productCode || 'N/A';
    const intendedUse = device.intendedUse || device.intended_use || 'Not specified';
    const predicateList = predicateDevices || device.predicateDevices || [];

    const predicateInfo =
      predicateList.length > 0
        ? predicateList
            .map(
              (p: any, i: number) =>
                `Predicate ${i + 1}: ${p.deviceName || p.name || 'Unknown'} (510(k): ${p.kNumber || p.clearanceNumber || 'N/A'})`
            )
            .join('\n')
        : 'No predicate devices specified.';

    const systemPrompt =
      `You are a regulatory affairs expert specializing in FDA 510(k) premarket notifications. ` +
      `Generate professional, technically accurate regulatory submission content. ` +
      `Use formal regulatory language appropriate for FDA review. ` +
      `Include specific references to applicable FDA guidance documents and standards where relevant. ` +
      `Output your response as valid JSON with the following structure:\n` +
      `{\n` +
      `  "content": "The full section text in markdown format",\n` +
      `  "citations": ["Array of applicable standards, guidance documents, and regulations cited"],\n` +
      `  "complianceNotes": ["Array of compliance observations and recommendations"]\n` +
      `}`;

    const userPrompt =
      `${sectionPrompts[sectionType]}\n\n` +
      `Device Information:\n` +
      `- Device Name: ${deviceName}\n` +
      `- Device Class: ${deviceClass}\n` +
      `- Product Code: ${productCode}\n` +
      `- Intended Use: ${intendedUse}\n` +
      `${device.manufacturer ? `- Manufacturer: ${device.manufacturer}\n` : ''}` +
      `${device.description ? `- Description: ${device.description}\n` : ''}` +
      `${device.materials ? `- Materials: ${device.materials}\n` : ''}` +
      `${device.medicalSpecialty ? `- Medical Specialty: ${device.medicalSpecialty}\n` : ''}` +
      `\nPredicate Device(s):\n${predicateInfo}`;

    // Dynamically import the unified AI client to avoid circular dependency issues
    const { ai } = await import('../lib/unified-ai-client');

    const parsed = await ai.structured<{
      content: string;
      citations: string[];
      complianceNotes: string[];
    }>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      undefined,
      {
        taskType: 'regulatory_review',
        maxTokens: 4096,
        temperature: 0.3,
        callerModule: '510k-generate-section',
        organizationId: organizationId || undefined,
      }
    );

    res.json({
      success: true,
      section: {
        type: sectionType,
        content: parsed.content || '',
        citations: parsed.citations || [],
        complianceNotes: parsed.complianceNotes || [],
        metadata: {
          generatedAt: new Date().toISOString(),
          deviceName,
          deviceClass,
          predicatesCount: predicateList.length,
          sectionType,
          model: 'ai-gateway',
        },
      },
    });
  } catch (error: any) {
    console.error('Error generating section:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate section',
      message: error.message || 'Unknown error',
    });
  }
});

/**
 * @route POST /api/510k/validate-submission
 * @desc Validate 510(k) submission against FDA requirements and compliance rules
 * @access Private
 */
router.post('/validate-submission', async (req: Request, res: Response) => {
  try {
    const { organizationId } = (req as any).tenantContext;
    const { submission } = req.body;

    if (!submission) {
      return res.status(400).json({
        success: false,
        error: 'submission object is required',
      });
    }

    const rules = complianceRules;
    const requiredSections: any[] = rules.requiredSections || [];
    const deviceClassRules = rules.deviceClassRules || {};
    const templateWarnings: string[] = rules.templateWarnings || [];

    // Gather submitted sections — support both array and object-keyed formats
    const submittedSections: Record<string, any> = {};
    if (Array.isArray(submission.sections)) {
      for (const sec of submission.sections) {
        const key = sec.id || sec.sectionId || sec.type;
        if (key) submittedSections[key] = sec;
      }
    } else if (submission.sections && typeof submission.sections === 'object') {
      Object.assign(submittedSections, submission.sections);
    }

    // Determine device class and its additional section requirements
    const deviceClass = submission.deviceClass || submission.device?.deviceClass || 'II';
    const classRules = deviceClassRules[deviceClass] || {};
    const additionalSectionIds: string[] = classRules.additionalSections || [];

    // Build full required section list (base + class-specific)
    const allRequired = [
      ...requiredSections,
      ...additionalSectionIds.map((id: string) => ({
        id,
        name: id
          .split('_')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        description: `Required for Class ${deviceClass} devices`,
        wordCountMin: 100,
        wordCountMax: 5000,
        requiredTerms: [],
      })),
    ];

    // Validate each required section
    const sectionResults: any[] = [];
    let totalSections = allRequired.length;
    let completedSections = 0;

    for (const required of allRequired) {
      const submitted = submittedSections[required.id];
      const findings: string[] = [];
      let sectionStatus: 'pass' | 'fail' | 'warning' = 'pass';

      if (!submitted) {
        findings.push(`Section "${required.name}" is missing from the submission.`);
        sectionStatus = 'fail';
      } else {
        const content: string = submitted.content || submitted.text || '';
        const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

        // Check word count minimums
        if (required.wordCountMin && wordCount < required.wordCountMin) {
          findings.push(
            `Word count (${wordCount}) is below the minimum requirement of ${required.wordCountMin}.`
          );
          sectionStatus = 'fail';
        }

        // Check word count maximums
        if (required.wordCountMax && wordCount > required.wordCountMax) {
          findings.push(
            `Word count (${wordCount}) exceeds the maximum limit of ${required.wordCountMax}. Consider condensing.`
          );
          if (sectionStatus !== 'fail') sectionStatus = 'warning';
        }

        // Check required key terms
        if (required.requiredTerms && required.requiredTerms.length > 0) {
          const lowerContent = content.toLowerCase();
          const missingTerms = required.requiredTerms.filter(
            (term: string) => !lowerContent.includes(term.toLowerCase())
          );
          if (missingTerms.length > 0) {
            findings.push(
              `Missing key terms: ${missingTerms.join(', ')}. FDA reviewers expect these terms in this section.`
            );
            if (sectionStatus !== 'fail') sectionStatus = 'warning';
          }
        }

        // Check for template placeholder language
        for (const warning of templateWarnings) {
          if (content.includes(warning)) {
            findings.push(
              `Template placeholder detected: "${warning}". This must be replaced with actual content before submission.`
            );
            sectionStatus = 'fail';
          }
        }

        // Check for empty or near-empty content
        if (wordCount === 0) {
          findings.push('Section has no content.');
          sectionStatus = 'fail';
        } else if (wordCount < 20) {
          findings.push('Section content appears incomplete (fewer than 20 words).');
          sectionStatus = 'fail';
        }

        if (sectionStatus === 'pass') {
          completedSections++;
        } else if (sectionStatus === 'warning') {
          // Warnings still count as partially complete
          completedSections += 0.5;
        }
      }

      sectionResults.push({
        sectionId: required.id,
        sectionName: required.name,
        status: sectionStatus,
        findings,
        wordCount: submitted
          ? (submitted.content || submitted.text || '').trim().split(/\s+/).filter(Boolean).length
          : 0,
        requiredWordCountMin: required.wordCountMin || null,
        requiredWordCountMax: required.wordCountMax || null,
      });
    }

    // Compute overall completeness percentage
    const completenessPercentage =
      totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

    // Determine overall validity
    const hasCriticalFailures = sectionResults.some(r => r.status === 'fail');
    const hasWarnings = sectionResults.some(r => r.status === 'warning');

    // Check for missing device info
    const overallFindings: string[] = [];
    if (!submission.deviceName && !submission.device?.deviceName) {
      overallFindings.push('Device name is not specified in the submission.');
    }
    if (!submission.predicateDevices && !submission.device?.predicateDevices) {
      overallFindings.push('No predicate device(s) identified. A 510(k) requires at least one predicate.');
    }
    if (!submission.intendedUse && !submission.device?.intendedUse) {
      overallFindings.push('Intended use statement is missing.');
    }

    const missingSections = sectionResults
      .filter(r => r.status === 'fail' && r.wordCount === 0)
      .map(r => r.sectionName);

    res.json({
      success: true,
      validation: {
        isValid: !hasCriticalFailures && overallFindings.length === 0,
        completenessPercentage,
        overallStatus: hasCriticalFailures ? 'incomplete' : hasWarnings ? 'needs-review' : 'ready',
        deviceClass,
        totalRequiredSections: totalSections,
        completedSections: Math.round(completedSections),
        missingSections,
        overallFindings,
        sectionResults,
      },
    });
  } catch (error: any) {
    console.error('Error validating submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate submission',
      message: error.message || 'Unknown error',
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
