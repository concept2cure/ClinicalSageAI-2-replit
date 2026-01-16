/**
 * RegIntel Validation API Module
 *
 * This module provides document validation services within the Express application.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Create router
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../../uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const validationId = uuidv4();
    req.validationId = validationId; // Store for later use
    cb(null, `${validationId}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Define supported validation engines
const VALIDATION_ENGINES = {
  'regintel-protocol': {
    id: 'regintel-protocol',
    name: 'Protocol Validator',
    description: 'Validates clinical protocol documents',
    fileTypes: ['pdf', 'docx'],
  },
  'regintel-csr': {
    id: 'regintel-csr',
    name: 'CSR Validator',
    description: 'Validates Clinical Study Report documents',
    fileTypes: ['pdf', 'docx'],
  },
  'regintel-define': {
    id: 'regintel-define',
    name: 'Define.xml Validator',
    description: 'Validates Define.xml files for CDISC compliance',
    fileTypes: ['xml'],
  },
};

// Get validation engines
router.get('/engines', (req, res) => {
  res.json(Object.values(VALIDATION_ENGINES));
});

// Validate a file
router.post('/file', upload.single('file'), (req, res) => {
  try {
    const { file } = req;
    const engineId = req.body.engine_id;
    const validationId = req.validationId;

    // Validate engine exists
    if (!VALIDATION_ENGINES[engineId]) {
      return res.status(400).json({
        error: `Validation engine '${engineId}' not found`,
      });
    }

    // Validate file extension
    const fileExt = file.originalname.split('.').pop().toLowerCase();
    if (!VALIDATION_ENGINES[engineId].fileTypes.includes(fileExt)) {
      return res.status(400).json({
        error: `Unsupported file type '${fileExt}'. Supported types: ${VALIDATION_ENGINES[engineId].fileTypes.join(', ')}`,
      });
    }

    // Create validation logs directory
    const logsDir = path.join(__dirname, '../../../validation_logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create initial validation result
    const result = {
      id: validationId,
      filename: file.originalname,
      engineId: engineId,
      engineName: VALIDATION_ENGINES[engineId].name,
      timestamp: new Date().toISOString(),
      status: 'validating',
      validations: [],
      summary: {
        success: 0,
        warning: 0,
        error: 0,
      },
    };

    // Save initial validation result
    const resultPath = path.join(logsDir, `${validationId}.json`);
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

    // In a real implementation, we'd start a background task to run the validation
    // For this example, we'll return immediately and let the client poll for status

    res.status(202).json({ id: validationId, status: 'validating' });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get validation status
router.get('/status/:validationId', (req, res) => {
  try {
    const { validationId } = req.params;
    const logsDir = path.join(__dirname, '../../../validation_logs');
    const resultPath = path.join(logsDir, `${validationId}.json`);

    // Check if validation exists
    if (!fs.existsSync(resultPath)) {
      return res.status(404).json({ error: `Validation '${validationId}' not found` });
    }

    // Read validation result
    let result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));

    // If status is still "validating", simulate completion after a short time
    if (result.status === 'validating') {
      // Set to "completed" with sample results
      result.status = 'completed';
      result.validations = [
        {
          id: 'REG001',
          rule: 'Document structure validation',
          status: 'success',
          message: 'Document structure meets requirements',
        },
        {
          id: 'REG002',
          rule: 'Regulatory header verification',
          status: 'success',
          message: 'Headers contain required information',
        },
        {
          id: 'REG003',
          rule: 'Section completeness check',
          status: 'success',
          message: 'All required sections present',
        },
        {
          id: 'REG004',
          rule: 'Format consistency validation',
          status: 'warning',
          message: 'Inconsistent formatting detected in section 3.2',
        },
        {
          id: 'REG005',
          rule: 'Cross-reference validation',
          status: 'error',
          message: 'Missing cross-references in section 4.1',
          path: 'Section 4.1',
          lineNumber: 42,
        },
        {
          id: 'PDF001',
          rule: 'PDF/A compliance check',
          status: 'warning',
          message: 'Document is not PDF/A compliant',
        },
      ];
      result.summary = {
        success: 3,
        warning: 2,
        error: 1,
      };

      // Save updated result
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting validation status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Explain a validation rule
router.post('/explain', express.json(), (req, res) => {
  try {
    const { ruleId } = req.body;

    // Rule explanations
    const explanations = {
      REG001: {
        id: 'REG001',
        rule: 'Document structure validation',
        explanation:
          'This rule checks if the document follows the required structure per ICH guidelines. It ensures all mandatory sections and subsections are present and in the correct order.',
        references: ['ICH E6(R2) Section 6', 'FDA Guidance for Industry E6(R2)'],
        examples: [
          "Missing required section '9.0 Quality Control and Quality Assurance'",
          'Section order does not follow ICH template',
        ],
      },
      REG002: {
        id: 'REG002',
        rule: 'Regulatory header verification',
        explanation:
          'Verifies that document headers contain all required information including protocol number, version, date, and sponsorship information as required by regulatory authorities.',
        references: ['ICH E6(R2) Section 6.1', 'EMA Clinical Trial Regulation'],
        examples: ['Missing protocol number in header', 'Missing version control information'],
      },
      REG003: {
        id: 'REG003',
        rule: 'Section completeness check',
        explanation:
          'Ensures that all sections of the document contain the necessary information to be considered complete according to regulatory standards.',
        references: ['ICH E3', 'FDA Guidance on CSR Structure'],
        examples: [
          'Inclusion/exclusion criteria section is incomplete',
          'Statistical analysis plan lacks primary endpoint definition',
        ],
      },
      REG004: {
        id: 'REG004',
        rule: 'Format consistency validation',
        explanation:
          'Checks for consistent formatting throughout the document including headings, tables, figures, and references to ensure clarity and readability.',
        references: ['ICH E3 Appendix I', 'FDA eCTD Guidance'],
        examples: ['Inconsistent heading styles between sections', 'Inconsistent table formatting'],
      },
      REG005: {
        id: 'REG005',
        rule: 'Cross-reference validation',
        explanation:
          'Verifies that all cross-references within the document are valid and point to the correct sections, tables, or figures as cited.',
        references: ['ICH E3 Section 10', 'FDA Guidance on eCTD'],
        examples: [
          'Reference to Table 3.4 when the document only contains Tables 3.1-3.3',
          'Citation to a non-existent appendix',
        ],
      },
      PDF001: {
        id: 'PDF001',
        rule: 'PDF/A compliance check',
        explanation:
          'Checks if the document meets PDF/A standard which ensures long-term archiving capabilities and is required by many regulatory agencies for submissions.',
        references: ['FDA eCTD Technical Conformance Guide', 'EMA eSubmission Guidelines'],
        examples: [
          'Document contains non-embedded fonts',
          'Document uses transparency which is not allowed in PDF/A',
        ],
      },
    };

    // Check if rule exists
    if (!explanations[ruleId]) {
      return res.status(404).json({ error: `Rule '${ruleId}' not found` });
    }

    res.json(explanations[ruleId]);
  } catch (error) {
    console.error('Error explaining rule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suggest a fix for a validation issue
router.post('/suggest-fix', express.json(), (req, res) => {
  try {
    const { validationId, ruleId } = req.body;

    // Fix suggestions
    const suggestions = {
      REG001: {
        id: 'REG001',
        rule: 'Document structure validation',
        suggestion:
          'Ensure all required sections are present in the document. Add missing sections as identified by the validator.',
        exampleFix:
          "Add section '9.0 Quality Control and Quality Assurance' after section 8 with appropriate subsections as defined in ICH E6(R2).",
        resources: ['https://database.ich.org/sites/default/files/E6_R2_Addendum.pdf'],
      },
      REG002: {
        id: 'REG002',
        rule: 'Regulatory header verification',
        suggestion: 'Update all document headers to include the required regulatory information.',
        exampleFix:
          "Add protocol number, version, and date to all page headers in the format: 'Protocol ABC-123, Version 2.0, 23-APR-2025'",
        resources: ['https://www.fda.gov/regulatory-information/search-fda-guidance-documents'],
      },
      REG003: {
        id: 'REG003',
        rule: 'Section completeness check',
        suggestion:
          'Complete all sections with the required information as per regulatory guidelines.',
        exampleFix:
          'Update the inclusion/exclusion criteria section to include all required elements: age range, diagnostic criteria, informed consent requirements, etc.',
        resources: ['https://www.ema.europa.eu/en/clinical-trial-regulation'],
      },
      REG004: {
        id: 'REG004',
        rule: 'Format consistency validation',
        suggestion:
          'Apply consistent formatting throughout the document according to organizational style guide.',
        exampleFix:
          'Update section 3.2 to use the same heading styles, table formats, and numbering scheme as the rest of the document. Use Heading 1 for main sections, Heading 2 for subsections.',
        resources: ['https://www.ich.org/page/efficacy-guidelines'],
      },
      REG005: {
        id: 'REG005',
        rule: 'Cross-reference validation',
        suggestion:
          'Update all cross-references to ensure they point to existing sections, tables, or figures.',
        exampleFix:
          "In section 4.1, update cross-references to point to the correct tables or add the missing referenced content. Replace 'see Table 5.3' with 'see Table 4.2' if that's the correct reference.",
        resources: ['https://www.fda.gov/media/135562/download'],
      },
      PDF001: {
        id: 'PDF001',
        rule: 'PDF/A compliance check',
        suggestion: 'Convert the document to PDF/A format using appropriate software or settings.',
        exampleFix:
          'Use Adobe Acrobat Pro to convert the document to PDF/A-1b format. Ensure all fonts are embedded and remove any transparency effects.',
        resources: ['https://www.pdfa.org/resource/pdfa-in-a-nutshell/'],
      },
    };

    // Check if rule exists
    if (!suggestions[ruleId]) {
      return res.status(404).json({ error: `Rule '${ruleId}' not found` });
    }

    res.json(suggestions[ruleId]);
  } catch (error) {
    console.error('Error suggesting fix:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
