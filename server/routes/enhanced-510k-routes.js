import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const deviceProfileSchema = z.object({
  deviceName: z.string().min(1),
  manufacturer: z.string().min(1),
  deviceClass: z.enum(['I', 'II', 'III']),
  productCode: z.string().min(1).max(3),
  modelNumber: z.string().optional(),
  intendedUse: z.string().min(50),
  technicalDescription: z.string().optional(),
  regulatoryHistory: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
});

const equivalenceAnalysisSchema = z.object({
  subjectDevice: z.object({}).passthrough(),
  predicateDevice: z.object({}).passthrough(),
});

// POST /api/510k/device-profile - Create new device profile
router.post('/device-profile', async (req, res) => {
  try {
    const validatedData = deviceProfileSchema.parse(req.body);

    // In a real implementation, save to database
    const deviceProfile = {
      id: `device-${Date.now()}`,
      ...validatedData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
    };

    console.log('Created device profile:', deviceProfile.id);

    res.json({
      success: true,
      device: deviceProfile,
      message: 'Device profile created successfully',
    });
  } catch (error) {
    console.error('Device profile creation error:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/510k/equivalence-analysis - Perform equivalence analysis
router.post('/equivalence-analysis', async (req, res) => {
  try {
    const { subjectDevice, predicateDevice } = equivalenceAnalysisSchema.parse(req.body);

    // Mock AI-powered equivalence analysis
    const analysis = {
      overallScore: 85,
      technologicalCharacteristics: {
        'Operating Principle': {
          subject: subjectDevice.operatingPrinciple || 'Digital signal processing',
          predicate: predicateDevice.operatingPrinciple || 'Digital signal processing',
          match: 'exact',
        },
        'Energy Source': {
          subject: subjectDevice.energySource || 'Battery powered',
          predicate: predicateDevice.energySource || 'Battery powered',
          match: 'exact',
        },
        'Materials': {
          subject: subjectDevice.materials || 'Biocompatible polymer',
          predicate: predicateDevice.materials || 'Medical-grade silicone',
          match: 'similar',
        },
      },
      intendedUse: {
        subject: subjectDevice.intendedUse,
        predicate: predicateDevice.intendedUse,
        match: 'exact',
        similarity: 95,
      },
      performanceData: {
        'Measurement Accuracy': {
          subject: '±2%',
          predicate: '±2%',
          match: 'equivalent',
        },
        'Operating Range': {
          subject: '0-200 BPM',
          predicate: '0-200 BPM',
          match: 'equivalent',
        },
      },
      biocompatibility: {
        subject: 'ISO 10993 compliant',
        predicate: 'ISO 10993 compliant',
        match: 'exact',
      },
      riskAnalysis: {
        items: [
          {
            category: 'Electrical Safety',
            description: 'Both devices meet IEC 60601-1 requirements',
            severity: 'low',
          },
        ],
      },
      differences: [
        'Subject device uses Bluetooth 5.0 while predicate uses Bluetooth 4.2',
        'Subject device has extended battery life (48h vs 24h)',
      ],
      similarities: [
        'Same intended use for continuous cardiac monitoring',
        'Equivalent measurement accuracy (±2%)',
        'Same biocompatibility standards (ISO 10993)',
        'Same patient contact duration (prolonged contact)',
        'Equivalent operating environment specifications',
      ],
      recommendations: [
        'Provide comparative performance testing data for Bluetooth connectivity',
        'Include battery safety testing documentation',
        'Document equivalence of user interface and alarm systems',
        'Provide clinical data supporting extended monitoring duration',
      ],
      generatedAt: new Date().toISOString(),
    };

    res.json(analysis);
  } catch (error) {
    console.error('Equivalence analysis error:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/510k/compliance-check - Run compliance assessment
router.post('/compliance-check', async (req, res) => {
  try {
    const { deviceProfile } = req.body;

    if (!deviceProfile) {
      return res.status(400).json({ error: 'Device profile required' });
    }

    // Mock compliance check results
    const complianceResult = {
      overallScore: 82,
      categories: {
        essential: {
          score: 90,
          requirements: [
            {
              id: 'device-description',
              title: 'Device Description',
              description: 'Comprehensive description of device including materials, specifications, and operating principles',
              status: 'compliant',
              reference: '21 CFR 807.87(a)',
              evidence: 'Device description provided in technical documentation',
            },
            {
              id: 'intended-use',
              title: 'Indications for Use',
              description: 'Clear statement of intended use and patient population',
              status: 'compliant',
              reference: '21 CFR 807.87(e)',
              evidence: 'Intended use statement meets FDA requirements',
            },
            {
              id: 'predicate-comparison',
              title: 'Substantial Equivalence Comparison',
              description: 'Comparison with predicate device demonstrating substantial equivalence',
              status: 'partial',
              reference: '21 CFR 807.87(f)',
              actions: [
                { text: 'Complete side-by-side comparison table', completed: false },
                { text: 'Provide supporting test data', completed: false },
              ],
            },
          ],
        },
        labeling: {
          score: 75,
          requirements: [
            {
              id: 'instructions-for-use',
              title: 'Instructions for Use',
              description: 'Complete IFU including warnings, precautions, and contraindications',
              status: 'partial',
              reference: '21 CFR 801.109',
              actions: [
                { text: 'Draft IFU document', completed: true },
                { text: 'Review IFU with clinical team', completed: false },
                { text: 'Translate IFU if required', completed: false },
              ],
            },
          ],
        },
        performance: {
          score: 80,
          requirements: [
            {
              id: 'bench-testing',
              title: 'Bench Testing',
              description: 'Performance testing demonstrating device meets specifications',
              status: 'compliant',
              reference: 'FDA Guidance',
              evidence: 'Performance test protocol and results submitted',
            },
            {
              id: 'software-validation',
              title: 'Software Validation',
              description: 'Software verification and validation per FDA guidance',
              status: 'partial',
              reference: 'FDA Software Validation Guidance',
              actions: [
                { text: 'Complete Level of Concern assessment', completed: true },
                { text: 'Provide software documentation', completed: false },
              ],
            },
          ],
        },
        biocompatibility: {
          score: 85,
          requirements: [
            {
              id: 'iso-10993',
              title: 'Biocompatibility Testing',
              description: 'Testing per ISO 10993 for patient-contacting materials',
              status: 'compliant',
              reference: 'ISO 10993-1',
              evidence: 'Biocompatibility test reports from accredited lab',
            },
          ],
        },
        sterilization: {
          score: 70,
          requirements: [
            {
              id: 'sterility-validation',
              title: 'Sterilization Validation',
              description: 'Validated sterilization process with supporting data',
              status: 'partial',
              reference: 'ISO 11135 / ISO 11137',
              actions: [
                { text: 'Complete sterilization validation study', completed: false },
                { text: 'Provide sterilization process parameters', completed: true },
              ],
            },
          ],
        },
      },
      criticalIssues: [
        'Substantial equivalence comparison table incomplete',
      ],
      warnings: [
        'Software validation documentation needs completion',
        'Instructions for Use require clinical review',
        'Sterilization validation study pending',
      ],
      recommendations: [
        'Complete all pending performance testing before submission',
        'Ensure all labeling documents are finalized and reviewed',
        'Validate all claims made in substantial equivalence section',
        'Consider early engagement with FDA if novel technology features exist',
      ],
      generatedAt: new Date().toISOString(),
    };

    res.json(complianceResult);
  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/510k/submission-package - Initialize submission package
router.post('/submission-package', async (req, res) => {
  try {
    const { deviceProfile, predicateDevice, equivalenceAnalysis, complianceCheck } = req.body;

    const packageData = {
      id: `pkg-${Date.now()}`,
      submissionType: 'Traditional 510(k)',
      createdAt: new Date().toISOString(),
      estimatedSize: 15 * 1024 * 1024, // 15 MB estimate
      documents: [
        {
          id: 'cover-letter',
          title: 'FDA Cover Letter (FDA Form 3514)',
          description: 'Required cover letter with device identification and applicant information',
          type: 'cover-letter',
          regulation: '21 CFR 807.87(a)',
          status: 'pending',
          required: true,
        },
        {
          id: 'device-description',
          title: 'Device Description',
          description: 'Comprehensive description including materials, design, and operating principles',
          type: 'device-description',
          regulation: '21 CFR 807.87(b)',
          status: 'pending',
          required: true,
        },
        {
          id: 'substantial-equivalence',
          title: 'Substantial Equivalence Discussion',
          description: 'Comparison with predicate device demonstrating substantial equivalence',
          type: 'substantial-equivalence',
          regulation: '21 CFR 807.87(f)',
          status: 'pending',
          required: true,
        },
        {
          id: 'indications-for-use',
          title: 'Indications for Use Statement',
          description: 'FDA Form 3881 - Indications for Use',
          type: 'cover-letter',
          regulation: '21 CFR 807.87(e)',
          status: 'pending',
          required: true,
        },
        {
          id: 'labeling',
          title: 'Labeling',
          description: 'Proposed labels and labeling including IFU, warnings, and contraindications',
          type: 'labeling',
          regulation: '21 CFR 807.87(g)',
          status: 'pending',
          required: true,
        },
        {
          id: 'performance-testing',
          title: 'Performance Testing',
          description: 'Bench and performance test protocols and results',
          type: 'performance',
          regulation: 'FDA Guidance',
          status: 'pending',
          required: true,
        },
        {
          id: 'biocompatibility',
          title: 'Biocompatibility Evaluation',
          description: 'ISO 10993 testing summary and reports',
          type: 'performance',
          regulation: 'ISO 10993-1',
          status: 'pending',
          required: deviceProfile?.hasPatientContact !== false,
        },
        {
          id: 'software-documentation',
          title: 'Software Documentation',
          description: 'Software description, verification, and validation',
          type: 'performance',
          regulation: 'FDA Software Validation Guidance',
          status: 'pending',
          required: deviceProfile?.hasSoftware !== false,
        },
        {
          id: 'sterilization',
          title: 'Sterilization Validation',
          description: 'Sterilization method validation and supporting data',
          type: 'performance',
          regulation: 'ISO 11135 / ISO 11137',
          status: 'pending',
          required: deviceProfile?.isSterile !== false,
        },
        {
          id: 'risk-analysis',
          title: 'Risk Analysis',
          description: 'ISO 14971 risk management file summary',
          type: 'performance',
          regulation: 'ISO 14971',
          status: 'pending',
          required: true,
        },
      ],
      warnings: [
        'Ensure all required documents are complete before submission',
        'Review FDA guidance documents specific to your device type',
        'Allow 6-8 weeks for document compilation and quality review',
      ],
    };

    res.json(packageData);
  } catch (error) {
    console.error('Package initialization error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/510k/generate-document/:documentId - Generate specific document
router.post('/generate-document/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { deviceProfile, predicateDevice } = req.body;

    console.log(`Generating document: ${documentId}`);

    // In a real implementation, generate actual PDF document
    // For now, return a success response
    res.json({
      success: true,
      documentId,
      message: 'Document generation would happen here',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Document generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/510k/download-package - Download complete submission package
router.post('/download-package', async (req, res) => {
  try {
    const { packageId, selectedDocuments } = req.body;

    console.log(`Downloading package: ${packageId} with ${selectedDocuments?.length} documents`);

    // In a real implementation, create ZIP archive with all documents
    res.json({
      success: true,
      packageId,
      message: 'Package download would happen here',
      documentCount: selectedDocuments?.length || 0,
    });
  } catch (error) {
    console.error('Package download error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
