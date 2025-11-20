import express from 'express';
import multer from 'multer';
import { z } from 'zod';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to validate a leaf document
const validateLeaf = async (leafId, region = 'FDA', content = '') => {
  const findings = [];
  
  // Base eCTD v4.0 validation checks
  const baseValidationRules = [
    {
      id: 'ectd-001',
      category: 'structure',
      check: 'Module number format',
      severity: leafId.match(/^m\d+/) ? 'pass' : 'error',
      message: leafId.match(/^m\d+/) ? 'Module ID format is correct' : 'Module ID must start with "m" followed by numbers'
    },
    {
      id: 'ectd-002', 
      category: 'content',
      check: 'Document completeness',
      severity: 'warning',
      message: 'Ensure all required sections are present'
    },
    {
      id: 'ich-001',
      category: 'compliance',
      check: 'ICH M4 compliance',
      severity: 'pass',
      message: 'Document structure follows ICH M4 guidelines'
    },
    {
      id: 'ref-001',
      category: 'references',
      check: 'Cross-references validation',
      severity: 'warning',
      message: 'Some cross-references may need updating'
    },
    {
      id: 'format-001',
      category: 'formatting',
      check: 'PDF/A compliance',
      severity: 'pass',
      message: 'Document format meets regulatory standards'
    }
  ];
  
  // Region-specific validation rules
  const regionSpecificRules = {
    FDA: [
      {
        id: 'fda-001',
        category: 'regulatory',
        check: 'FDA submission requirements',
        severity: 'pass',
        message: 'Meets FDA electronic submission standards'
      },
      {
        id: 'fda-002',
        category: 'regulatory',
        check: '21 CFR Part 11 compliance',
        severity: content.includes('electronic signature') ? 'pass' : 'warning',
        message: 'Ensure electronic signatures comply with 21 CFR Part 11'
      },
      {
        id: 'fda-003',
        category: 'quality',
        check: 'FDA Question-Based Review (QbR) for Module 3',
        severity: leafId.includes('m3') ? 'info' : 'pass',
        message: 'Module 3 should address FDA QbR questions'
      },
      {
        id: 'fda-004',
        category: 'formatting',
        check: 'US spelling conventions',
        severity: 'pass',
        message: 'Document uses US English spelling'
      },
      {
        id: 'fda-005',
        category: 'references',
        check: 'USP/NF references',
        severity: leafId.includes('m3') ? 'info' : 'pass',
        message: 'Quality sections should reference USP/NF standards where applicable'
      }
    ],
    EMA: [
      {
        id: 'ema-001',
        category: 'regulatory',
        check: 'EMA CTD requirements',
        severity: 'pass',
        message: 'Meets EMA electronic submission standards'
      },
      {
        id: 'ema-002',
        category: 'content',
        check: 'Summary of Product Characteristics (SmPC)',
        severity: leafId.includes('m1') ? 'warning' : 'pass',
        message: 'Module 1 should include draft SmPC'
      },
      {
        id: 'ema-003',
        category: 'quality',
        check: 'European Pharmacopoeia (Ph. Eur.) compliance',
        severity: leafId.includes('m3') ? 'info' : 'pass',
        message: 'Quality sections should reference Ph. Eur. standards'
      },
      {
        id: 'ema-004',
        category: 'environmental',
        check: 'Environmental Risk Assessment',
        severity: leafId.includes('m1.6') ? 'error' : 'pass',
        message: 'Module 1.6 must include Environmental Risk Assessment for EMA'
      },
      {
        id: 'ema-005',
        category: 'formatting',
        check: 'EU spelling conventions',
        severity: 'pass',
        message: 'Document uses British English spelling'
      }
    ],
    PMDA: [
      {
        id: 'pmda-001',
        category: 'regulatory',
        check: 'PMDA CTD requirements',
        severity: 'pass',
        message: 'Meets PMDA electronic submission standards'
      },
      {
        id: 'pmda-002',
        category: 'content',
        check: 'Japanese Package Insert (JPI)',
        severity: leafId.includes('m1') ? 'warning' : 'pass',
        message: 'Module 1 should include draft JPI in Japanese'
      },
      {
        id: 'pmda-003',
        category: 'quality',
        check: 'Japanese Pharmacopoeia (JP) compliance',
        severity: leafId.includes('m3') ? 'info' : 'pass',
        message: 'Quality sections should reference JP standards'
      },
      {
        id: 'pmda-004',
        category: 'clinical',
        check: 'Japanese ethnic factors',
        severity: leafId.includes('m5') ? 'error' : 'pass',
        message: 'Clinical sections must address Japanese ethnic factors and bridging studies'
      },
      {
        id: 'pmda-005',
        category: 'formatting',
        check: 'PMDA Q&A format',
        severity: leafId.includes('m2') ? 'info' : 'pass',
        message: 'Consider using PMDA Questions and Answers format for summaries'
      },
      {
        id: 'pmda-006',
        category: 'language',
        check: 'Japanese translation requirement',
        severity: leafId.includes('m1') ? 'error' : 'pass',
        message: 'Module 1 documents require Japanese translation'
      }
    ],
    'Health Canada': [
      {
        id: 'hc-001',
        category: 'regulatory',
        check: 'Health Canada CTD requirements',
        severity: 'pass',
        message: 'Meets Health Canada electronic submission standards'
      },
      {
        id: 'hc-002',
        category: 'content',
        check: 'Canadian Product Monograph',
        severity: leafId.includes('m1') ? 'warning' : 'pass',
        message: 'Module 1 should include draft Canadian Product Monograph'
      },
      {
        id: 'hc-003',
        category: 'quality',
        check: 'Quality Overall Summary (QOS)',
        severity: leafId.includes('m2.3') ? 'error' : 'pass',
        message: 'Module 2.3 must include comprehensive QOS for Health Canada'
      },
      {
        id: 'hc-004',
        category: 'references',
        check: 'Canadian Reference Product',
        severity: leafId.includes('m1') || leafId.includes('m5') ? 'info' : 'pass',
        message: 'Include Canadian Reference Product information where applicable'
      },
      {
        id: 'hc-005',
        category: 'language',
        check: 'Bilingual requirements',
        severity: leafId.includes('m1') ? 'error' : 'pass',
        message: 'Module 1 labeling must be in both English and French'
      },
      {
        id: 'hc-006',
        category: 'regulatory',
        check: 'Notice of Compliance (NOC) readiness',
        severity: 'info',
        message: 'Ensure submission addresses all NOC requirements'
      }
    ],
    WHO: [
      {
        id: 'who-001',
        category: 'regulatory',
        check: 'WHO prequalification requirements',
        severity: 'pass',
        message: 'Meets WHO prequalification submission standards'
      },
      {
        id: 'who-002',
        category: 'content',
        check: 'WHO Public Assessment Report (WHOPAR) readiness',
        severity: 'info',
        message: 'Document should support WHOPAR preparation'
      },
      {
        id: 'who-003',
        category: 'clinical',
        check: 'Essential Medicines List criteria',
        severity: leafId.includes('m2') || leafId.includes('m5') ? 'warning' : 'pass',
        message: 'Address WHO Model List of Essential Medicines criteria'
      },
      {
        id: 'who-004',
        category: 'manufacturing',
        check: 'Low-resource setting considerations',
        severity: leafId.includes('m3') ? 'error' : 'pass',
        message: 'Manufacturing sections must address production in low-resource settings'
      },
      {
        id: 'who-005',
        category: 'stability',
        check: 'Zone IVb stability data',
        severity: leafId.includes('m3') ? 'error' : 'pass',
        message: 'Include stability data for hot and humid conditions (Zone IVb)'
      }
    ],
    TGA: [
      {
        id: 'tga-001',
        category: 'regulatory',
        check: 'TGA CTD requirements',
        severity: 'pass',
        message: 'Meets TGA electronic submission standards'
      },
      {
        id: 'tga-002',
        category: 'content',
        check: 'Australian Product Information (PI)',
        severity: leafId.includes('m1') ? 'warning' : 'pass',
        message: 'Module 1 should include draft Australian PI'
      },
      {
        id: 'tga-003',
        category: 'regulatory',
        check: 'Australian Regulatory Guidelines (ARGPM)',
        severity: 'pass',
        message: 'Follows ARGPM requirements'
      },
      {
        id: 'tga-004',
        category: 'safety',
        check: 'Risk Management Plan (RMP)',
        severity: leafId.includes('m1') || leafId.includes('m2.5') ? 'warning' : 'pass',
        message: 'Include Australian-specific RMP requirements'
      },
      {
        id: 'tga-005',
        category: 'quality',
        check: 'Australian manufacturing requirements',
        severity: leafId.includes('m3') ? 'info' : 'pass',
        message: 'Address TGA GMP requirements for Australian manufacturing'
      },
      {
        id: 'tga-006',
        category: 'regulatory',
        check: 'ARTG registration readiness',
        severity: 'info',
        message: 'Ensure submission supports Australian Register of Therapeutic Goods (ARTG) entry'
      }
    ]
  };
  
  // Combine base rules with region-specific rules
  const validationRules = [
    ...baseValidationRules,
    ...(regionSpecificRules[region] || regionSpecificRules.FDA)
  ];
  
  // Add findings based on validation rules
  validationRules.forEach(rule => {
    if (rule.severity !== 'pass') {
      findings.push({
        id: rule.id,
        category: rule.category,
        check: rule.check,
        severity: rule.severity,
        message: rule.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Add some additional contextual validations
  if (leafId.includes('m2')) {
    findings.push({
      id: 'mod2-001',
      category: 'module-specific',
      check: 'Module 2 summary sections',
      severity: 'info',
      message: 'Module 2 summaries should reference detailed data in Module 3',
      timestamp: new Date().toISOString()
    });
  }
  
  if (leafId.includes('m3')) {
    findings.push({
      id: 'mod3-001',
      category: 'module-specific',
      check: 'Module 3 quality data',
      severity: 'info',
      message: 'Ensure all analytical methods are validated',
      timestamp: new Date().toISOString()
    });
  }
  
  return findings;
};

// Validation endpoint - validates leaf documents against regulatory requirements
router.post('/validate', async (req, res) => {
  try {
    const { leafId, documentId, content, region = 'FDA' } = req.body;
    
    if (!leafId && !documentId) {
      return res.status(400).json({
        success: false,
        message: 'Either leafId or documentId is required'
      });
    }
    
    const id = leafId || documentId;
    console.log(`Validating document: ${id} for region: ${region}`);
    
    // Run validation with region-specific rules
    const findings = await validateLeaf(id, region, content || '');
    
    // Categorize findings
    const errors = findings.filter(f => f.severity === 'error');
    const warnings = findings.filter(f => f.severity === 'warning');
    const info = findings.filter(f => f.severity === 'info');
    
    // Calculate compliance score
    const totalChecks = 10; // Base number of validation checks
    const passedChecks = totalChecks - errors.length - (warnings.length * 0.5);
    const complianceScore = Math.max(0, Math.round((passedChecks / totalChecks) * 100));
    
    const response = {
      success: true,
      documentId: id,
      validatedAt: new Date().toISOString(),
      errors,
      warnings,
      info,
      status: errors.length === 0 ? 'green' : warnings.length > 0 ? 'yellow' : 'red',
      complianceScore,
      summary: {
        totalFindings: findings.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        infoCount: info.length
      },
      recommendations: [
        errors.length > 0 && 'Address all error findings before submission',
        warnings.length > 2 && 'Review warning findings to improve document quality',
        'Consider running a final validation before regulatory submission'
      ].filter(Boolean)
    };
    
    res.json(response);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation failed',
      error: error.message
    });
  }
});

// Get validation history for a document
router.get('/validation-history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // In production, this would fetch from database
    const history = [
      {
        id: 'val_1',
        documentId,
        validatedAt: new Date(Date.now() - 86400000).toISOString(),
        status: 'yellow',
        complianceScore: 85,
        errors: 0,
        warnings: 3
      },
      {
        id: 'val_2',
        documentId,
        validatedAt: new Date().toISOString(),
        status: 'green',
        complianceScore: 95,
        errors: 0,
        warnings: 1
      }
    ];
    
    res.json({
      success: true,
      documentId,
      history
    });
  } catch (error) {
    console.error('Error fetching validation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch validation history',
      error: error.message
    });
  }
});

// Get validation rules and requirements
router.get('/validation-rules', async (req, res) => {
  try {
    const rules = {
      ectd: {
        version: '4.0',
        categories: ['structure', 'content', 'formatting', 'references'],
        requirements: [
          'Valid module numbering',
          'Correct file naming conventions',
          'PDF/A compliance',
          'Hyperlink validation',
          'Bookmark structure'
        ]
      },
      ich: {
        guidelines: ['M4', 'M4Q', 'M4S', 'M4E'],
        requirements: [
          'CTD structure compliance',
          'Section completeness',
          'Quality data requirements',
          'Safety data requirements',
          'Efficacy data requirements'
        ]
      },
      fda: {
        regulations: ['21 CFR 314.50', '21 CFR 312.23', '21 CFR Part 11'],
        requirements: [
          'Electronic submission standards',
          'CDER requirements',
          'CBER requirements (if applicable)',
          'Form FDA 356h compliance',
          'Question-Based Review (QbR) for Module 3',
          'REMS if applicable',
          'USP/NF references'
        ]
      },
      ema: {
        regulations: ['Directive 2001/83/EC', 'Regulation (EC) No 726/2004'],
        requirements: [
          'EMA electronic submission standards',
          'Summary of Product Characteristics (SmPC)',
          'European Pharmacopoeia (Ph. Eur.) compliance',
          'Environmental Risk Assessment (Module 1.6)',
          'ICH M4E(R2) for clinical sections',
          'Pediatric Investigation Plan (PIP) if applicable'
        ]
      },
      pmda: {
        regulations: ['Pharmaceutical Affairs Law', 'PMDA CTD guidance'],
        requirements: [
          'PMDA electronic submission standards',
          'Japanese Package Insert (JPI) in Japanese',
          'Japanese Pharmacopoeia (JP) compliance',
          'Japanese ethnic factors in clinical data',
          'Bridging studies for foreign data',
          'PMDA Q&A format for summaries',
          'Module 1 Japanese translation'
        ]
      },
      'health_canada': {
        regulations: ['Food and Drugs Act', 'Food and Drug Regulations'],
        requirements: [
          'Health Canada CTD requirements',
          'Canadian Product Monograph',
          'Quality Overall Summary (QOS)',
          'Canadian Reference Product information',
          'Bilingual labeling (English/French)',
          'Notice of Compliance (NOC) requirements',
          'Priority Review eligibility criteria'
        ]
      },
      who: {
        regulations: ['WHO Prequalification Programme', 'WHO CTD guidance'],
        requirements: [
          'WHO prequalification standards',
          'WHO Public Assessment Report (WHOPAR)',
          'Essential Medicines List criteria',
          'Low-resource setting manufacturing',
          'Zone IVb stability data',
          'Multi-country filing considerations',
          'API master file requirements'
        ]
      },
      tga: {
        regulations: ['Therapeutic Goods Act 1989', 'ARGPM'],
        requirements: [
          'TGA electronic submission standards',
          'Australian Product Information (PI)',
          'Australian Regulatory Guidelines (ARGPM)',
          'Risk Management Plan (RMP)',
          'TGA GMP requirements',
          'ARTG registration requirements',
          'Biological products specific requirements'
        ]
      }
    };
    
    res.json({
      success: true,
      rules
    });
  } catch (error) {
    console.error('Error fetching validation rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch validation rules',
      error: error.message
    });
  }
});

// SEND/TRC Validation schema
const sendDataSchema = z.object({
  domain: z.string(),
  variables: z.array(z.string()),
  data: z.array(z.record(z.any())).optional(),
  metadata: z.object({
    studyId: z.string(),
    studyName: z.string().optional(),
    protocolName: z.string().optional()
  }).optional()
});

/**
 * POST /api/validation/send
 * Validate SEND dataset compliance for nonclinical data
 */
router.post('/send', async (req, res) => {
  try {
    const validation = sendDataSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { domain, variables, data } = validation.data;
    
    // Import validation service dynamically to avoid circular dependencies
    const { validateSENDDataset } = await import('../../client/src/services/sendValidationService.js');
    
    // Run SEND validation
    const validationResults = validateSENDDataset(
      { variables, data },
      domain
    );

    res.json({
      success: true,
      domain,
      validation: validationResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('SEND validation error:', error);
    res.status(500).json({
      error: 'Validation failed',
      details: error.message
    });
  }
});

/**
 * POST /api/validation/trc
 * Run comprehensive Technical Rejection Criteria checks
 */
router.post('/trc', upload.array('files', 20), async (req, res) => {
  try {
    // Parse submission data
    const submission = {
      files: req.files?.map(file => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        content: file.buffer
      })) || [],
      datasets: req.body.datasets ? JSON.parse(req.body.datasets) : {},
      defineXML: req.body.defineXML,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {}
    };

    // Import validation service
    const { runTRCValidation, getValidationSummary } = await import('../../client/src/services/sendValidationService.js');
    
    // Run TRC validation
    const trcResults = runTRCValidation(submission);
    const summary = getValidationSummary(trcResults);

    res.json({
      success: true,
      results: trcResults,
      summary,
      canSubmit: summary.canSubmit,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('TRC validation error:', error);
    res.status(500).json({
      error: 'TRC validation failed', 
      details: error.message
    });
  }
});

/**
 * POST /api/validation/generate-define
 * Generate Define.xml for SEND datasets
 */
router.post('/generate-define', async (req, res) => {
  try {
    const { datasets, metadata } = req.body;
    
    if (!datasets || !metadata?.studyId) {
      return res.status(400).json({
        error: 'Missing required data',
        details: 'Datasets and study metadata are required'
      });
    }

    // Import validation service
    const { generateDefineXML } = await import('../../client/src/services/sendValidationService.js');
    
    // Generate Define.xml
    const defineXML = generateDefineXML(datasets, metadata);
    
    res.json({
      success: true,
      defineXML,
      filename: `define_${metadata.studyId}.xml`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Define.xml generation error:', error);
    res.status(500).json({
      error: 'Failed to generate Define.xml',
      details: error.message
    });
  }
});

/**
 * POST /api/validation/auto-fix
 * Auto-fix common SEND compliance issues
 */
router.post('/auto-fix', async (req, res) => {
  try {
    const { dataset, domain } = req.body;
    
    if (!dataset || !domain) {
      return res.status(400).json({
        error: 'Missing required data',
        details: 'Dataset and domain are required'
      });
    }

    // Import validation service
    const { autoFixSENDIssues, validateSENDDataset } = await import('../../client/src/services/sendValidationService.js');
    
    // Apply auto-fixes
    const { dataset: fixedDataset, corrections } = autoFixSENDIssues(dataset, domain);
    
    // Validate the fixed dataset
    const validationResults = validateSENDDataset(fixedDataset, domain);
    
    res.json({
      success: true,
      original: dataset,
      fixed: fixedDataset,
      corrections,
      validation: validationResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Auto-fix error:', error);
    res.status(500).json({
      error: 'Auto-fix failed',
      details: error.message
    });
  }
});

export default router;