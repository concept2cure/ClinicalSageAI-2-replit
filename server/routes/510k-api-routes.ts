/**
 * 510(k) API Routes (DEPRECATED)
 *
 * @deprecated This route file is deprecated as of 2026-01-26.
 * Please migrate to /api/fda510k-unified/api
 * Sunset date: 2026-06-30
 *
 * @see /api/fda510k-unified/docs for migration guide
 */

import express from 'express';
import { create510kDeprecationNotice } from '../middleware/deprecation';

const router = express.Router();

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/api'));

/**
 * Get 510(k) submission requirements by device class
 * GET /api/fda510k/requirements/:deviceClass
 */
router.get('/requirements/:deviceClass', (req: express.Request, res: express.Response) => {
  const { deviceClass } = req.params;

  try {
    // Sample requirements data for different device classes
    const requirementsMap: Record<
      string,
      { requirements: Array<{ id: string; name: string; required: boolean; category: string }> }
    > = {
      I: {
        requirements: [
          { id: 'req-1-1', name: 'Device Description', required: true, category: 'general' },
          { id: 'req-1-2', name: 'Indications for Use', required: true, category: 'general' },
          { id: 'req-1-3', name: 'Performance Data', required: false, category: 'testing' },
          { id: 'req-1-4', name: 'Labeling', required: true, category: 'documentation' },
        ],
      },
      II: {
        requirements: [
          { id: 'req-2-1', name: 'Device Description', required: true, category: 'general' },
          { id: 'req-2-2', name: 'Indications for Use', required: true, category: 'general' },
          {
            id: 'req-2-3',
            name: 'Substantial Equivalence',
            required: true,
            category: 'equivalence',
          },
          {
            id: 'req-2-4',
            name: 'Performance Testing - Bench',
            required: true,
            category: 'testing',
          },
          { id: 'req-2-5', name: 'Biocompatibility', required: true, category: 'testing' },
          { id: 'req-2-6', name: 'Sterilization', required: false, category: 'testing' },
          {
            id: 'req-2-7',
            name: 'Software Documentation',
            required: false,
            category: 'documentation',
          },
          { id: 'req-2-8', name: 'Electrical Safety', required: false, category: 'testing' },
          { id: 'req-2-9', name: 'Labeling', required: true, category: 'documentation' },
          { id: 'req-2-10', name: 'Risk Analysis', required: true, category: 'documentation' },
        ],
      },
      III: {
        requirements: [
          { id: 'req-3-1', name: 'Device Description', required: true, category: 'general' },
          { id: 'req-3-2', name: 'Indications for Use', required: true, category: 'general' },
          {
            id: 'req-3-3',
            name: 'Substantial Equivalence',
            required: true,
            category: 'equivalence',
          },
          {
            id: 'req-3-4',
            name: 'Performance Testing - Bench',
            required: true,
            category: 'testing',
          },
          {
            id: 'req-3-5',
            name: 'Performance Testing - Animal',
            required: false,
            category: 'testing',
          },
          {
            id: 'req-3-6',
            name: 'Performance Testing - Clinical',
            required: false,
            category: 'testing',
          },
          { id: 'req-3-7', name: 'Biocompatibility', required: true, category: 'testing' },
          { id: 'req-3-8', name: 'Sterilization', required: true, category: 'testing' },
          {
            id: 'req-3-9',
            name: 'Software Documentation',
            required: false,
            category: 'documentation',
          },
          { id: 'req-3-10', name: 'Electrical Safety', required: false, category: 'testing' },
          { id: 'req-3-11', name: 'Labeling', required: true, category: 'documentation' },
          { id: 'req-3-12', name: 'Risk Analysis', required: true, category: 'documentation' },
          {
            id: 'req-3-13',
            name: 'Manufacturing Information',
            required: true,
            category: 'documentation',
          },
        ],
      },
    };

    // Return requirements for the specified device class
    // Use safe access with type checking
    const validClass = deviceClass as keyof typeof requirementsMap;
    const requirements =
      validClass in requirementsMap ? requirementsMap[validClass] : { requirements: [] };

    res.json(requirements);
  } catch (error) {
    console.error('Error retrieving requirements:', error);
    res.status(500).json({ message: 'Error retrieving requirements' });
  }
});

/**
 * Find predicate devices
 * POST /api/fda510k/find-predicates
 */
router.post('/find-predicates', (req: express.Request, res: express.Response) => {
  const { deviceData, organizationId } = req.body;

  try {
    // Generate sample predicate devices based on input data
    const predicateDevices = [
      {
        id: 'pred1',
        deviceName: 'Similar ECG Monitor',
        manufacturer: 'MedTech Inc.',
        k510Number: 'K123456',
        clearanceDate: '2022-08-15',
        productCode: 'DPS',
        matchScore: 0.94,
        matchReason: 'Similar indications for use and technological characteristics',
      },
      {
        id: 'pred2',
        deviceName: 'CardioMonitor Pro',
        manufacturer: 'CardioTech',
        k510Number: 'K789012',
        clearanceDate: '2021-04-22',
        productCode: 'DPS',
        matchScore: 0.89,
        matchReason: 'Same product code and similar functionality',
      },
      {
        id: 'pred3',
        deviceName: 'VitaSense ECG',
        manufacturer: 'VitaSense Medical Devices',
        k510Number: 'K345678',
        clearanceDate: '2023-01-10',
        productCode: 'DPS',
        matchScore: 0.82,
        matchReason: 'Similar device classification and intended use',
      },
    ];

    // Generate sample literature references
    const literatureReferences = [
      {
        id: 'lit1',
        title: 'Safety and Efficacy of Continuous ECG Monitoring in Clinical Settings',
        authors: 'Smith J, Johnson R, Williams K',
        journal: 'Journal of Medical Devices',
        year: 2022,
        doi: '10.1234/jmd.2022.12345',
        relevanceScore: 0.95,
      },
      {
        id: 'lit2',
        title: 'Performance Evaluation of ECG Monitoring Systems for Adult Patients',
        authors: 'Garcia A, Lee H, Patel S',
        journal: 'Cardiovascular Engineering and Technology',
        year: 2021,
        doi: '10.1234/cet.2021.67890',
        relevanceScore: 0.88,
      },
    ];

    res.json({
      predicateDevices,
      literatureReferences,
    });
  } catch (error) {
    console.error('Error finding predicate devices:', error);
    res.status(500).json({ message: 'Error finding predicate devices' });
  }
});

/**
 * Analyze regulatory pathway
 * POST /api/fda510k/analyze-pathway
 */
router.post('/analyze-pathway', (req: express.Request, res: express.Response) => {
  const { deviceData, organizationId } = req.body;

  try {
    // Analyze regulatory pathway based on device data
    const result = {
      recommendedPathway: 'Traditional 510(k)',
      confidenceScore: 0.94,
      alternativePathways: [
        {
          name: 'Abbreviated 510(k)',
          confidenceScore: 0.65,
          rationale: 'May be suitable if conforming to established special controls',
        },
        {
          name: 'Special 510(k)',
          confidenceScore: 0.42,
          rationale: 'Not recommended as this is not a modification to your own device',
        },
      ],
      rationale:
        'Based on device classification (Class II) and the need to demonstrate substantial equivalence to predicate devices.',
      estimatedTimelineInDays: 90,
      keyRequirements: [
        'Full device description',
        'Software documentation',
        'Performance data',
        'Substantial equivalence discussion',
        'Clinical data may be leveraged from predicate',
      ],
    };

    res.json(result);
  } catch (error) {
    console.error('Error analyzing regulatory pathway:', error);
    res.status(500).json({ message: 'Error analyzing regulatory pathway' });
  }
});

/**
 * Get requirement analysis
 * GET /api/fda510k/requirement-analysis/:requirementId/:projectId
 */
router.get(
  '/requirement-analysis/:requirementId/:projectId',
  (req: express.Request, res: express.Response) => {
    const { requirementId, projectId } = req.params;

    try {
      // Generate sample analysis for the specified requirement
      const analysis = {
        requirementId,
        requirementName: 'Substantial Equivalence',
        status: 'partial',
        completionPercentage: 65,
        missingItems: [
          'Comparison of technological characteristics',
          'Discussion of different technological characteristics',
        ],
        recommendations: [
          'Add comparison table for technological characteristics',
          "Include discussion of why different characteristics don't raise new questions of safety and effectiveness",
        ],
        aiAnalysis:
          "The substantial equivalence section needs additional information about how the different technological characteristics between your device and the predicate don't raise new questions of safety and effectiveness. Consider adding a comparison table and specific examples.",
      };

      res.json(analysis);
    } catch (error) {
      console.error('Error analyzing requirement:', error);
      res.status(500).json({ message: 'Error analyzing requirement' });
    }
  }
);

/**
 * Device Profile Management
 * Routes for managing device profiles in the CERV2 module
 */

// Generate a UUID-like ID without external dependencies
const generateId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};

// In-memory storage for device profiles
// This will be replaced with database storage in production
const deviceProfiles = new Map();

/**
 * Create or update a device profile
 * POST /api/fda510k/device-profiles
 */
router.post('/device-profiles', (req: express.Request, res: express.Response) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext || {};

    // Create or update device profile
    const deviceProfile = {
      ...req.body,
      id: req.body.id || generateId(),
      organizationId,
      clientWorkspaceId,
      updatedAt: new Date().toISOString(),
    };

    // If it's a new profile, set created date
    if (!req.body.id) {
      deviceProfile.createdAt = deviceProfile.updatedAt;
    }

    // Store in memory (would be database in production)
    const profileKey = `${organizationId || 'global'}_${deviceProfile.id}`;
    deviceProfiles.set(profileKey, deviceProfile);

    console.log(`Device profile ${deviceProfile.id} saved`, {
      name: deviceProfile.deviceName || deviceProfile.name,
      organizationId,
    });

    // Return success response
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
});

/**
 * Update an existing device profile
 * PUT /api/fda510k/device-profiles/:id
 */
router.put('/device-profiles/:id', (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = (req as any).tenantContext || {};

    // Check if profile exists
    const profileKey = `${organizationId || 'global'}_${id}`;
    if (!deviceProfiles.has(profileKey)) {
      return res.status(404).json({
        success: false,
        error: 'Device profile not found',
      });
    }

    // Update existing profile
    const existingProfile = deviceProfiles.get(profileKey);
    const updatedProfile = {
      ...existingProfile,
      ...req.body,
      id, // Ensure ID doesn't change
      organizationId, // Ensure org ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    // Store updated profile
    deviceProfiles.set(profileKey, updatedProfile);

    console.log(`Device profile ${id} updated`, {
      name: updatedProfile.deviceName || updatedProfile.name,
      organizationId,
    });

    // Return success response
    res.json({
      success: true,
      deviceProfile: updatedProfile,
    });
  } catch (error) {
    console.error('Error updating device profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device profile',
    });
  }
});

/**
 * Get a specific device profile
 * GET /api/fda510k/device-profiles/:id
 */
router.get('/device-profiles/:id', (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = (req as any).tenantContext || {};

    // Look up profile
    const profileKey = `${organizationId || 'global'}_${id}`;
    const deviceProfile = deviceProfiles.get(profileKey);

    if (!deviceProfile) {
      return res.status(404).json({
        success: false,
        error: 'Device profile not found',
      });
    }

    // Return profile
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
 * Get all device profiles for the organization
 * GET /api/fda510k/device-profiles
 */
router.get('/device-profiles', (req: express.Request, res: express.Response) => {
  try {
    const { organizationId } = (req as any).tenantContext || {};

    // Filter profiles by organization
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
 * Delete a device profile
 * DELETE /api/fda510k/device-profiles/:id
 */
router.delete('/device-profiles/:id', (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { organizationId } = (req as any).tenantContext || {};

    // Check if profile exists
    const profileKey = `${organizationId || 'global'}_${id}`;
    const exists = deviceProfiles.has(profileKey);

    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Device profile not found',
      });
    }

    // Delete profile
    deviceProfiles.delete(profileKey);

    console.log(`Device profile ${id} deleted`, { organizationId });

    // Return success response
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

export { router };
