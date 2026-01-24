/**
 * CER Validation API Routes
 *
 * This module provides endpoints for validating Clinical Evaluation Reports
 * against regulatory requirements from multiple frameworks.
 */

const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Validation framework requirements
const validationFrameworks = {
  mdr: {
    name: 'EU MDR',
    requirements: [
      'GSPR mapping for all safety and performance claims',
      'State-of-the-art analysis with current standards',
      'Literature search methodology documentation',
      'Benefit-risk analysis',
      'Post-market surveillance plan',
      'PMCF plan compliant with MDCG 2020-7',
      'Device description and intended purpose',
      'Qualifications of evaluators',
      'Complete bibliography with proper citations',
    ],
  },
  fda: {
    name: 'US FDA',
    requirements: [
      'Substantial equivalence documentation (for 510(k))',
      'Benefit-risk determination',
      'Performance testing data',
      'Clinical study protocols and results',
      'Device description and indications for use',
      'Complete reference list with proper citations',
    ],
  },
  ukca: {
    name: 'UKCA',
    requirements: [
      'UK-specific clinical evidence requirements',
      'UKCA marking compliance documentation',
      'Post-market surveillance plan for UK market',
      'UK Responsible Person details',
      'Complete reference list with proper citations',
    ],
  },
  health_canada: {
    name: 'Health Canada',
    requirements: [
      'Device classification according to Canadian regulations',
      'Canadian Medical Device Licence requirements',
      'Risk classification and management',
      'Clinical evidence specific to Canadian guidelines',
      'Complete reference list with proper citations',
    ],
  },
  ich: {
    name: 'ICH',
    requirements: [
      'International harmonization documentation',
      'Cross-reference to regional requirements',
      'Complete reference list with proper citations',
    ],
  },
};

/**
 * Validate a CER document using GPT-4o AI analysis
 * POST /api/cer/documents/:id/validate
 */
router.post('/documents/:id/validate', async (req, res) => {
  try {
    const documentId = req.params.id;
    const { framework = 'mdr', sections } = req.body;

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OpenAI API key is required for regulatory validation. Please add this to environment variables.'
      );
    }

    // Prepare document for validation
    const document = {
      id: documentId,
      sections: sections || [],
    };

    // Log the validation request
    console.log(`Validating document ${documentId} against ${framework} framework with GPT-4o`);

    // Always use AI validation with GPT-4o
    const validationResults = await validateWithAI(document, framework);

    // Add additional validation details
    validationResults.validationMethod = 'ai';
    validationResults.documentId = documentId;
    validationResults.frameworkUsed = framework;
    validationResults.validationDate = new Date().toISOString();

    res.json(validationResults);
  } catch (error) {
    console.error('Error validating document:', error);
    res.status(500).json({
      error: 'Failed to validate document',
      message: error.message,
    });
  }
});

/**
 * Validate a document using OpenAI's GPT-4o model
 * @param {Object} document - The document to validate
 * @param {string} framework - The regulatory framework to validate against
 * @returns {Promise<Object>} - Validation results with detailed analysis
 */
async function validateWithAI(document, framework) {
  try {
    // Use the appropriate framework requirements
    const frameworkData = validationFrameworks[framework] || validationFrameworks.mdr;

    // Create a comprehensive and framework-specific prompt for the AI model
    const promptsByFramework = {
      mdr: `
        You are an expert regulatory consultant specialized in EU MDR MEDDEV 2.7/1 Rev 4 Clinical Evaluation Reports (CERs).
        Analyze the following clinical evaluation report content against EU MDR requirements.
        
        EU MDR REQUIREMENTS:
        1. Complete GSPR mapping for all safety and performance claims with traceability to evidence
        2. Comprehensive state-of-the-art analysis with current standards and published literature
        3. Detailed literature search methodology documentation (databases, search terms, inclusion/exclusion criteria)
        4. Thorough benefit-risk analysis quantifying both benefits and risks
        5. Post-market surveillance plan with specific triggers for CER updates
        6. PMCF plan compliant with MDCG 2020-7 guidance
        7. Detailed device description including all variants and configurations
        8. Qualifications of evaluators demonstrating expertise in the specific device technology
        9. Complete bibliography with proper citations formatted according to EU regulatory expectations
        10. Comprehensive clinical evaluation of equivalence when relying on equivalent devices
        11. Valid clinical data from PMCF studies, clinical investigations, and literature
        12. Gap analysis with specific plans to address any identified gaps
        
        Focus particular attention on identifying:
        - Missing or insufficient GSPR mapping to clinical evidence
        - Inadequate literature search methodology
        - Incomplete state-of-the-art analysis
        - Insufficient clinical data for claims made
        - Improper application of equivalence criteria
      `,
      fda: `
        You are an expert regulatory consultant specialized in FDA Medical Device Clinical Evaluation Reports.
        Analyze the following clinical evaluation report content against US FDA requirements.
        
        FDA REQUIREMENTS:
        1. Substantial equivalence documentation for 510(k) submissions with proper predicate comparison
        2. Comprehensive benefit-risk determination according to FDA guidance
        3. Complete performance testing data supporting each indication
        4. Clinical study protocols and results meeting FDA expectations
        5. Detailed device description and specific indications for use
        6. Complete reference list with proper citations
        7. Data from valid scientific evidence as defined in 21 CFR 860.7
        8. Risk analysis according to ISO 14971
        9. Statistical justification for sample sizes and endpoints
        10. Discussion of all known adverse events and complications
        
        Focus particular attention on identifying:
        - Inadequate substantial equivalence justification
        - Missing performance data for specific indications
        - Statistical deficiencies in clinical data
        - Unsupported claims or indications
        - Insufficient adverse event analysis
      `,
      ukca: `
        You are an expert regulatory consultant specialized in UK Conformity Assessed (UKCA) Medical Device Clinical Evaluation Reports.
        Analyze the following clinical evaluation report content against UK regulatory requirements.
        
        UKCA REQUIREMENTS:
        1. UK-specific clinical evidence requirements
        2. UKCA marking compliance documentation
        3. Post-market surveillance plan specific to the UK market
        4. Details of the UK Responsible Person
        5. Complete reference list with proper citations
        6. Evidence meeting UK Medical Devices Regulations 2002 (as amended)
        7. Clinical data considerations specific to UK patient populations
        8. Compliance with applicable UK designated standards
        
        Focus particular attention on identifying:
        - Missing UK-specific regulatory documentation
        - Insufficient UK market surveillance planning
        - Absent or incomplete UK Responsible Person details
        - Lack of UK-specific clinical considerations
      `,
      health_canada: `
        You are an expert regulatory consultant specialized in Health Canada Medical Device Clinical Evaluation Reports.
        Analyze the following clinical evaluation report content against Canadian regulatory requirements.
        
        HEALTH CANADA REQUIREMENTS:
        1. Device classification according to Canadian regulations
        2. Canadian Medical Device Licence requirements
        3. Risk classification and management according to Canadian standards
        4. Clinical evidence specific to Canadian guidelines
        5. Complete reference list with proper citations
        6. Compliance with Canadian Medical Devices Regulations (SOR/98-282)
        7. Safety and effectiveness requirements per section 10-20 of Canadian regulations
        8. Consideration of Canadian population demographics in clinical data
        
        Focus particular attention on identifying:
        - Incorrect device classification for Canadian market
        - Missing Canadian-specific regulatory requirements
        - Insufficient safety and effectiveness data for Canadian approval
        - Inadequate risk management for Canadian regulations
      `,
      ich: `
        You are an expert regulatory consultant specialized in International Council for Harmonisation (ICH) compliance for medical device documentation.
        Analyze the following clinical evaluation report content against ICH requirements.
        
        ICH REQUIREMENTS:
        1. International harmonization documentation
        2. Cross-reference to regional requirements
        3. Complete reference list with proper citations
        4. Compliance with ICH E6(R2) Good Clinical Practice
        5. Statistical analysis following ICH E9 Statistical Principles
        6. Safety reporting aligned with ICH guidelines
        7. Documentation quality meeting ICH expectations
        
        Focus particular attention on identifying:
        - Non-compliance with ICH guidelines for clinical investigations
        - Statistical analysis deficiencies per ICH E9
        - Inconsistent application of international standards
        - Inadequate harmonization across regional requirements
      `,
    };

    // Select appropriate framework-specific prompt
    const frameworkPrompt = promptsByFramework[framework] || promptsByFramework.mdr;

    // Build the complete prompt
    const prompt = `
      ${frameworkPrompt}
      
      DOCUMENT SECTIONS TO ANALYZE:
      ${JSON.stringify(document.sections, null, 2)}
      
      For each requirement, determine if the document fully meets, partially meets, or fails to meet the requirement.
      Identify any critical issues, major issues, and minor issues.
      
      Critical issues: Missing essential components required by regulations that could result in rejection by authorities
      Major issues: Incomplete sections or inadequate evidence for important claims that require significant revision
      Minor issues: Formatting issues, minor inconsistencies, or areas that could be improved for clarity
      
      For each issue, provide:
      1. The specific location in the document (section number and title if possible)
      2. A detailed description of the issue with reference to the specific regulatory requirement
      3. A concrete, actionable suggestion for how to address the issue with examples when applicable
      
      Return your analysis in the following JSON format:
      {
        "summary": {
          "totalIssues": number,
          "criticalIssues": number,
          "majorIssues": number,
          "minorIssues": number,
          "passedChecks": number,
          "complianceScore": number
        },
        "categories": {
          "regulatory_compliance": { "status": "success"|"warning"|"error", "passed": number, "failed": number },
          "completeness": { "status": "success"|"warning"|"error", "passed": number, "failed": number },
          "references": { "status": "success"|"warning"|"error", "passed": number, "failed": number },
          "consistency": { "status": "success"|"warning"|"error", "passed": number, "failed": number }
        },
        "issues": [
          {
            "id": number,
            "category": "regulatory_compliance"|"completeness"|"references"|"consistency",
            "severity": "critical"|"major"|"minor",
            "message": "Description of the issue",
            "location": "Section X.Y",
            "suggestion": "How to address the issue"
          }
        ]
      }
    `;

    // Call the OpenAI API with the latest GPT-4o model for more human-like writing
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an expert regulatory consultant for medical device Clinical Evaluation Reports with deep knowledge of EU MDR, FDA, UKCA, Health Canada, and ICH requirements. Write with a natural, conversational tone while maintaining technical accuracy. Your writing should sound like it was written by a human expert who understands regulatory nuances. Use clear, accessible language that regulatory professionals would use in conversation. Avoid overly formal, robotic, or academic language patterns.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    // Parse the AI response
    const aiAnalysis = JSON.parse(response.choices[0].message.content);

    // Integrate AI validation with standard checks
    return {
      ...aiAnalysis,
      aiValidated: true,
      validationDate: new Date().toISOString(),
      framework: frameworkData.name,
    };
  } catch (error) {
    console.error('Error validating with AI:', error);

    // Don't fallback to simulation - throw the error to be handled by the caller
    throw new Error(
      `GPT-4o validation failed: ${error.message}. Please ensure your OpenAI API key is valid and has sufficient credits.`
    );
  }
}

// Export the router as default
module.exports = router;
module.exports.default = router;
