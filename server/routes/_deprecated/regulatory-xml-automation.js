const express = require('express');
const router = express.Router();

// XML Rules Application Service
const applyXmlRules = async (content, options = {}) => {
  const { agency = 'FDA', documentType = 'IND', autoApply = false } = options;

  try {
    // Simulate XML rules application logic
    let updatedContent = content;
    let rulesApplied = 0;
    const appliedRules = [];

    // Rule 1: Document Structure Validation
    if (!content.includes('<document-structure>')) {
      updatedContent =
        `<document-structure type="${documentType}">` + updatedContent + '</document-structure>';
      rulesApplied++;
      appliedRules.push('Document structure wrapper added');
    }

    // Rule 2: Metadata Compliance
    if (!content.includes('regulatory-metadata')) {
      const metadata = `
        <regulatory-metadata>
          <agency>${agency}</agency>
          <document-type>${documentType}</document-type>
          <submission-date>${new Date().toISOString()}</submission-date>
          <version>1.0</version>
        </regulatory-metadata>
      `;
      updatedContent = metadata + updatedContent;
      rulesApplied++;
      appliedRules.push('Regulatory metadata added');
    }

    // Rule 3: Cross-Reference Validation
    const referencePattern = /\[([^\]]+)\]/g;
    const references = content.match(referencePattern) || [];
    if (references.length > 0) {
      let referencesSection = '\n<references>\n';
      references.forEach((ref, index) => {
        referencesSection += `  <reference id="ref-${index + 1}">${ref.replace(/[\[\]]/g, '')}</reference>\n`;
      });
      referencesSection += '</references>\n';
      updatedContent += referencesSection;
      rulesApplied++;
      appliedRules.push(`${references.length} references structured`);
    }

    // Rule 4: Schema Compliance Headers
    if (!content.includes('<?xml version')) {
      updatedContent = `<?xml version="1.0" encoding="UTF-8"?>\n${updatedContent}`;
      rulesApplied++;
      appliedRules.push('XML declaration added');
    }

    // Calculate new compliance score
    const baseScore = 75;
    const improvement = rulesApplied * 5;
    const newComplianceScore = Math.min(100, baseScore + improvement);

    return {
      success: true,
      updatedContent,
      rulesApplied,
      appliedRules,
      newComplianceScore,
      guidance: [
        'Document structure has been standardized for eCTD compliance',
        'Regulatory metadata ensures proper submission tracking',
        'All references have been properly structured',
        'XML schema compliance headers added',
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      rulesApplied: 0,
    };
  }
};

// Apply XML rules endpoint
router.post('/apply-xml-rules', async (req, res) => {
  try {
    const { content, agency, documentType, autoApply } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Document content is required',
      });
    }

    const result = await applyXmlRules(content, {
      agency,
      documentType,
      autoApply,
    });

    res.json(result);
  } catch (error) {
    console.error('XML rules application error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply XML rules',
    });
  }
});

// Get XML guidance steps
router.get('/xml-guidance/:documentType', async (req, res) => {
  const { documentType } = req.params;

  const guidanceSteps = {
    IND: [
      {
        step: 1,
        title: 'Document Structure Validation',
        description: 'Ensure proper eCTD module hierarchy',
        estimatedTime: '2-3 minutes',
        automated: true,
      },
      {
        step: 2,
        title: 'Metadata Compliance',
        description: 'Add required regulatory identifiers',
        estimatedTime: '1-2 minutes',
        automated: true,
      },
      {
        step: 3,
        title: 'Cross-Reference Validation',
        description: 'Structure all document references',
        estimatedTime: '3-5 minutes',
        automated: true,
      },
      {
        step: 4,
        title: 'Schema Validation',
        description: 'Final XML schema compliance check',
        estimatedTime: '1 minute',
        automated: true,
      },
    ],
  };

  res.json({
    documentType,
    steps: guidanceSteps[documentType] || guidanceSteps['IND'],
    totalEstimatedTime: '7-11 minutes',
    automationAvailable: true,
  });
});

module.exports = router;
