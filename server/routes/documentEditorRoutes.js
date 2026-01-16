/**
 * Document Editor API Routes
 * Handles all document editing, auto-save, compliance checking, and export functionality
 */

import express from 'express';
import OpenAI from 'openai';

// Note: Using mock authentication for now - integrate with actual auth middleware in production

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GET /api/document-editor/document/:documentId
 * Retrieve a document with all its sections and history
 */
router.get('/document/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const orgId = req.headers['x-organization-id'];

    // For now, return mock document - would integrate with DB
    res.json({
      id: documentId,
      organizationId: orgId,
      title: `Document ${documentId}`,
      sections: [],
      versions: [],
      sectionCount: 0,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

/**
 * POST /api/document-editor/section/:documentId/:sectionId
 * Save a single section with auto-save capability
 */
router.post('/section/:documentId/:sectionId', async (req, res) => {
  try {
    const { documentId, sectionId } = req.params;
    const { content, editorState, autosave } = req.body;
    const orgId = req.headers['x-organization-id'];
    const userId = req.user?.id;

    // Mock save - would integrate with database
    res.json({
      success: true,
      message: `Section ${sectionId} saved successfully`,
      sectionId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving section:', error);
    res.status(500).json({ error: 'Failed to save section' });
  }
});

/**
 * POST /api/document-editor/enhance-section
 * Use AI to enhance section content with regulatory guidance
 */
router.post('/enhance-section', async (req, res) => {
  try {
    const { sectionId, content, documentType, context } = req.body;
    const orgId = req.headers['x-organization-id'];

    // Define enhancement prompts based on section and document type
    const enhancementPrompts = {
      '510k': {
        'intended-use': 'Enhance this intended use statement for a 510(k) submission to be clear, specific, and FDA-compliant. Include target population, indications, contraindications if applicable.',
        'device-description': 'Enhance this device description to provide comprehensive technical details suitable for FDA review. Include materials, dimensions, operating principles, and relevant specifications.',
        'substantial-equivalence': 'Strengthen this substantial equivalence statement to clearly demonstrate why this device is substantially equivalent to the predicate. Address similarities in intended use and technological characteristics.',
        'performance-standards': 'Enhance this performance standards section to demonstrate compliance with applicable FDA and international standards. List all relevant standards and how the device meets them.',
      },
      'cer': {
        'clinical-summary': 'Enhance this clinical evidence summary for a CER submission. Ensure it includes relevant clinical data, patient outcomes, and statistical significance.',
        'technical-specs': 'Improve this technical specifications section with more detail on engineering specifications and design requirements.',
      },
    };

    const documentTypeKey = documentType?.toLowerCase() || '510k';
    const sectionKey = sectionId?.toLowerCase() || 'general';
    const prompt = enhancementPrompts[documentTypeKey]?.[sectionKey] ||
      'Enhance this regulatory document section to be more comprehensive, clear, and compliant with regulatory standards.';

    const message = await openai.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nCurrent content:\n${content}\n\nProvide an enhanced version that maintains technical accuracy while improving clarity and regulatory compliance.`,
        },
      ],
    });

    const enhancedContent = message.content[0].type === 'text' ? message.content[0].text : content;

    res.json({
      success: true,
      enhancedContent,
      sectionId,
      wordCountOriginal: content?.split(/\s+/).length || 0,
      wordCountEnhanced: enhancedContent?.split(/\s+/).length || 0,
    });
  } catch (error) {
    console.error('Error enhancing section:', error);
    res.status(500).json({ error: 'Failed to enhance section', originalContent: req.body.content });
  }
});

/**
 * POST /api/document-editor/check-compliance
 * Real-time compliance checking against FDA requirements
 */
router.post('/check-compliance', async (req, res) => {
  try {
    const { sectionId, content, documentType, previousSections } = req.body;
    const orgId = req.headers['x-organization-id'];

    // Define compliance rules for 510(k) and CER
    const complianceRules = {
      '510k': {
        'device-name': {
          minLength: 5,
          required: true,
          pattern: /^[a-zA-Z0-9\s\-\,\.]+$/,
          hint: 'Device name must be at least 5 characters and contain only letters, numbers, spaces, hyphens, commas, and periods',
        },
        'intended-use': {
          minLength: 50,
          required: true,
          hint: 'Intended use should be at least 50 characters and clearly describe the device purpose and target population',
        },
        'substantial-equivalence': {
          minLength: 100,
          required: true,
          hint: 'Substantial equivalence statement must clearly address similarities in intended use and technological characteristics',
        },
        'performance-standards': {
          required: true,
          pattern: /FDA|ISO|ASTM|IEC/i,
          hint: 'Performance standards section should reference applicable regulatory standards (FDA, ISO, ASTM, IEC)',
        },
      },
    };

    const typeRules = complianceRules[documentType?.toLowerCase() || '510k'] || {};
    const sectionRules = typeRules[sectionId?.toLowerCase()] || {};

    const issues = [];
    const warnings = [];
    let score = 100;

    // Check required
    if (sectionRules.required && (!content || content.trim().length === 0)) {
      issues.push(`${sectionId} is required and cannot be empty`);
      score -= 50;
    }

    // Check minimum length
    if (sectionRules.minLength && content && content.length < sectionRules.minLength) {
      issues.push(
        `${sectionId} should be at least ${sectionRules.minLength} characters (currently ${content.length})`
      );
      score -= 20;
    }

    // Check pattern
    if (sectionRules.pattern && content && !sectionRules.pattern.test(content)) {
      warnings.push(`${sectionRules.hint}`);
      score -= 10;
    }

    // Cross-section consistency checks for 510(k)
    if (documentType?.toLowerCase() === '510k' && previousSections) {
      // Check that predicate is referenced in equivalence statement
      if (sectionId === 'substantial-equivalence' && previousSections.predicateDevice) {
        if (!content?.includes(previousSections.predicateDevice)) {
          warnings.push('Substantial equivalence statement should reference the selected predicate device');
          score -= 15;
        }
      }

      // Check consistency between device description and intended use
      if (sectionId === 'intended-use' && previousSections['device-description']) {
        if (content && previousSections['device-description']) {
          // Simple heuristic: intended use should mention key aspects of device
          const descWords = previousSections['device-description']?.split(/\s+/).slice(0, 5) || [];
          if (
            descWords.length > 0 &&
            !content.toLowerCase().includes(descWords[0].toLowerCase())
          ) {
            warnings.push(
              'Intended use description should reference key aspects of the device mentioned in device description'
            );
            score -= 10;
          }
        }
      }
    }

    score = Math.max(0, score);

    res.json({
      success: true,
      sectionId,
      complianceScore: score,
      issues,
      warnings,
      canProceed: score >= 70,
      hint: sectionRules.hint || 'Section appears compliant',
    });
  } catch (error) {
    console.error('Error checking compliance:', error);
    res.status(500).json({ error: 'Failed to check compliance' });
  }
});

/**
 * POST /api/document-editor/generate-pdf
 * Generate PDF export of submission document
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    const { documentId, sections, deviceProfile } = req.body;
    const orgId = req.headers['x-organization-id'];

    const pdfContent = generatePDFContent(sections, deviceProfile);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="510k_submission_${deviceProfile?.deviceName?.replace(/\s+/g, '_')}.pdf"`
    );
    res.send(pdfContent);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

/**
 * POST /api/document-editor/generate-docx
 * Generate DOCX export of submission document
 */
router.post('/generate-docx', async (req, res) => {
  try {
    const { documentId, sections, deviceProfile } = req.body;
    const orgId = req.headers['x-organization-id'];

    const docxContent = generateDocxContent(sections, deviceProfile);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="510k_submission_${deviceProfile?.deviceName?.replace(/\s+/g, '_')}.docx"`
    );
    res.send(docxContent);
  } catch (error) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: 'Failed to generate DOCX' });
  }
});

/**
 * GET /api/document-editor/history/:documentId
 * Retrieve version history for a document
 */
router.get('/history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const orgId = req.headers['x-organization-id'];

    // Mock history
    res.json({
      success: true,
      documentId,
      versions: [
        {
          id: `v_${Date.now()}`,
          createdAt: new Date().toISOString(),
          createdBy: 'user-1',
          isAutosave: true,
          sectionCount: 0,
        },
      ],
    });
  } catch (error) {
    console.error('Error retrieving history:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

/**
 * POST /api/document-editor/restore/:documentId/:versionId
 * Restore document to a previous version
 */
router.post('/restore/:documentId/:versionId', async (req, res) => {
  try {
    const { documentId, versionId } = req.params;
    const orgId = req.headers['x-organization-id'];
    const userId = req.user?.id;

    // Mock restore
    res.json({
      success: true,
      message: `Document restored to version ${versionId}`,
      documentId,
      restoredVersionId: versionId,
    });
  } catch (error) {
    console.error('Error restoring document:', error);
    res.status(500).json({ error: 'Failed to restore document' });
  }
});

/**
 * POST /api/document-editor/validate
 * Validate document completeness before submission
 */
router.post('/validate', async (req, res) => {
  try {
    const { sections, documentType } = req.body;

    // Define required sections for each document type
    const requiredSections = {
      '510k': [
        'device-name',
        'intended-use',
        'device-description',
        'substantial-equivalence',
        'performance-standards',
        'manufacturing-information',
      ],
      'cer': [
        'clinical-background',
        'clinical-data',
        'safety-data',
        'conclusions',
      ],
    };

    const docType = documentType?.toLowerCase() || '510k';
    const required = requiredSections[docType] || [];
    const validationResult = {
      isValid: true,
      completedSections: [],
      missingRequired: [],
      warnings: [],
    };

    required.forEach((sectionId) => {
      const section = sections?.find((s) => s.id === sectionId);
      if (section && section.content && section.content.trim().length > 0) {
        validationResult.completedSections.push(sectionId);
      } else {
        validationResult.missingRequired.push(sectionId);
        validationResult.isValid = false;
      }
    });

    // Calculate completion percentage
    const completionPercent = Math.round(
      (validationResult.completedSections.length / required.length) * 100
    );

    res.json({
      ...validationResult,
      completionPercent,
      readyForSubmission: validationResult.isValid && completionPercent === 100,
    });
  } catch (error) {
    console.error('Error validating document:', error);
    res.status(500).json({ error: 'Failed to validate document' });
  }
});

// Helper functions
function generatePDFContent(sections, deviceProfile) {
  // Simplified PDF generation - actual implementation would use pdfkit
  let pdfContent = 'FDA 510(k) Submission\n\n';
  pdfContent += `Device Name: ${deviceProfile?.deviceName}\n`;
  pdfContent += `Manufacturer: ${deviceProfile?.manufacturer}\n\n`;

  sections?.forEach((section) => {
    pdfContent += `\n${section.title}\n`;
    pdfContent += `${'='.repeat(section.title.length)}\n`;
    pdfContent += `${section.content}\n`;
  });

  return pdfContent;
}

function generateDocxContent(sections, deviceProfile) {
  // Simplified DOCX generation - actual implementation would use docx library
  const content = {
    title: 'FDA 510(k) Submission',
    deviceName: deviceProfile?.deviceName,
    sections: sections?.map((s) => ({ title: s.title, content: s.content })) || [],
  };

  return JSON.stringify(content);
}

export default router;
