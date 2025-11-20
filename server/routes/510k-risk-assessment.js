/**
 * FDA 510(k) Risk Assessment API
 *
 * This module provides AI-powered risk assessment capabilities for 510(k) submissions,
 * analyzing device profiles, predicate devices, and literature evidence to predict
 * FDA clearance likelihood and identify potential risk factors.
 */

const express = require('express');
const OpenAI = require('openai');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize OpenAI API with the latest client interface
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Predict FDA submission risks for a 510(k) device
 *
 * This endpoint analyzes device profiles, predicate comparisons, and literature evidence
 * to predict FDA clearance likelihood and identify potential risk factors.
 */
router.post('/predict-submission-risks', async (req, res) => {
  try {
    const { deviceProfile, predicateDevices, equivalenceData, options } = req.body;

    if (!deviceProfile) {
      return res.status(400).json({ error: 'Device profile is required' });
    }

    // Default options if not provided
    const analysisOptions = {
      includeHistoricalComparisons: options?.includeHistoricalComparisons || false,
      performDeepAnalysis: options?.performDeepAnalysis || false,
    };

    // Extract relevant data for analysis
    const deviceData = {
      id: deviceProfile.id,
      name: deviceProfile.deviceName,
      manufacturer: deviceProfile.manufacturerName,
      description: deviceProfile.deviceDescription,
      indications: deviceProfile.indicationsForUse,
      regulatoryClass: deviceProfile.deviceClass,
      productCode: deviceProfile.productCode,
      hasPredicates: predicateDevices && predicateDevices.length > 0,
      predicateCount: predicateDevices ? predicateDevices.length : 0,
      evidenceData: equivalenceData?.literatureEvidence || {},
    };

    // Prepare OpenAI API request for risk assessment
    const analysisPrompt = generateRiskAssessmentPrompt(
      deviceData,
      predicateDevices,
      equivalenceData,
      analysisOptions
    );

    console.log('Performing FDA 510(k) submission risk assessment...');

    // Call OpenAI API for analysis using the latest client interface
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content:
            'You are an FDA regulatory expert specialized in 510(k) submissions. Analyze the device information and provide a detailed risk assessment for FDA clearance.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more deterministic responses
      max_tokens: 2500, // Allow for detailed analysis
      // Request JSON format
      response_format: { type: 'json_object' },
    });

    // Parse the assessment response - updated for new OpenAI client
    const assessmentText = completion.choices[0].message.content;
    let assessment = {};

    try {
      assessment = JSON.parse(assessmentText);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      return res.status(500).json({ error: 'Error processing risk assessment results' });
    }

    // Generate approval likelihood if not provided
    if (!assessment.approvalLikelihood && assessment.riskFactors) {
      // Calculate approval likelihood based on risk factors
      const highRiskCount = assessment.riskFactors.filter(r => r.severity === 'high').length;
      const mediumRiskCount = assessment.riskFactors.filter(r => r.severity === 'medium').length;
      const lowRiskCount = assessment.riskFactors.filter(r => r.severity === 'low').length;

      const approvalLikelihood = calculateApprovalLikelihood(
        highRiskCount,
        mediumRiskCount,
        lowRiskCount,
        assessment.strengths ? assessment.strengths.length : 0
      );

      assessment.approvalLikelihood = approvalLikelihood;
    }

    // Add assessment metadata
    assessment.deviceName = deviceProfile.deviceName;
    assessment.deviceId = deviceProfile.id;
    assessment.assessmentDate = new Date().toISOString();
    assessment.hasLiteratureEvidence =
      equivalenceData?.literatureEvidence &&
      Object.keys(equivalenceData.literatureEvidence).length > 0;
    assessment.evidenceCount = assessment.hasLiteratureEvidence
      ? Object.keys(equivalenceData.literatureEvidence).length
      : 0;

    res.json(assessment);
  } catch (error) {
    console.error('Error in risk assessment:', error);
    res.status(500).json({
      error: 'Risk assessment failed',
      message: error.message,
    });
  }
});

/**
 * Generate AI-powered fix suggestions for compliance issues
 */
router.post('/suggest-compliance-fixes', async (req, res) => {
  try {
    const { issues, deviceProfile, options } = req.body;

    if (!issues || !issues.length || !deviceProfile) {
      return res.status(400).json({ error: 'Issues and device profile are required' });
    }

    // Default options
    const fixOptions = {
      deepAnalysis: options?.deepAnalysis || false,
      includeTemplates: options?.includeTemplates || false,
    };

    // Generate prompt for fix suggestions
    const fixPrompt = generateFixSuggestionsPrompt(issues, deviceProfile, fixOptions);

    console.log('Generating AI-powered fix suggestions...');

    // Call OpenAI API for fix suggestions using latest client
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an FDA regulatory expert specializing in 510(k) submissions. Generate detailed, actionable fixes for the compliance issues identified in the device submission.',
        },
        {
          role: 'user',
          content: fixPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    // Parse the suggestions using updated client response format
    const suggestionsText = completion.choices[0].message.content;
    let suggestions = {};

    try {
      suggestions = JSON.parse(suggestionsText);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      return res.status(500).json({ error: 'Error processing fix suggestions' });
    }

    // Add metadata
    suggestions.deviceName = deviceProfile.deviceName;
    suggestions.deviceId = deviceProfile.id;
    suggestions.generatedAt = new Date().toISOString();

    res.json(suggestions);
  } catch (error) {
    console.error('Error generating fix suggestions:', error);
    res.status(500).json({
      error: 'Fix generation failed',
      message: error.message,
    });
  }
});

/**
 * Generate documentation templates for FDA submissions
 */
router.post('/generate-documentation-template/:templateType', async (req, res) => {
  try {
    const { templateType } = req.params;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    // Validate template type
    const validTemplateTypes = [
      'software',
      'biocompatibility',
      'electrical-safety',
      'clinical',
      'labeling',
    ];
    if (!validTemplateTypes.includes(templateType)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    // Generate prompt for documentation template
    const templatePrompt = generateDocumentationTemplatePrompt(templateType, deviceId);

    console.log(`Generating ${templateType} documentation template...`);

    // Call OpenAI API for documentation template using latest client
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: 'system',
          content:
            'You are an FDA regulatory documentation expert specializing in 510(k) submissions. Generate a comprehensive template structure for the requested documentation type.',
        },
        {
          role: 'user',
          content: templatePrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    });

    // Parse the template using updated client response format
    const templateText = completion.choices[0].message.content;
    let templateData = {};

    try {
      templateData = JSON.parse(templateText);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      return res.status(500).json({ error: 'Error processing template data' });
    }

    // Add metadata
    templateData.templateType = templateType;
    templateData.deviceId = deviceId;
    templateData.generatedAt = new Date().toISOString();

    // Generate a template ID
    const templateId = uuidv4();
    const responseData = {
      templateId,
      templateData,
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error generating documentation template:', error);
    res.status(500).json({
      error: 'Template generation failed',
      message: error.message,
    });
  }
});

/**
 * Generate a prompt for risk assessment
 */
function generateRiskAssessmentPrompt(deviceData, predicateDevices, equivalenceData, options) {
  let prompt = `
Please analyze this 510(k) submission for FDA clearance risks and provide a detailed assessment.

## Device Information:
- Name: ${deviceData.name}
- Manufacturer: ${deviceData.manufacturer}
- Description: ${deviceData.description}
- Indications for Use: ${deviceData.indications}
- Regulatory Class: ${deviceData.regulatoryClass}
- Product Code: ${deviceData.productCode}

`;

  if (predicateDevices && predicateDevices.length > 0) {
    prompt += `
## Predicate Devices (${predicateDevices.length}):
${predicateDevices
  .map(
    (predicate, index) =>
      `${index + 1}. ${predicate.deviceName} (${predicate.kNumber || 'Unknown K Number'}) - ${predicate.manufacturer || 'Unknown Manufacturer'}`
  )
  .join('\n')}
`;
  } else {
    prompt += `
## Predicate Devices:
No predicate devices identified.
`;
  }

  if (
    equivalenceData?.literatureEvidence &&
    Object.keys(equivalenceData.literatureEvidence).length > 0
  ) {
    prompt += `
## Literature Evidence:
${Object.keys(equivalenceData.literatureEvidence)
  .map(
    (key, index) =>
      `${index + 1}. ${equivalenceData.literatureEvidence[key].title} (${equivalenceData.literatureEvidence[key].journal || 'Unknown Journal'})`
  )
  .join('\n')}
`;
  }

  // Additional analysis options
  if (options.includeHistoricalComparisons) {
    prompt += `
Please include historical comparisons with similar devices and their FDA clearance outcomes.
`;
  }

  if (options.performDeepAnalysis) {
    prompt += `
Perform a deep analysis that includes:
- Detailed risk factors categorized by severity (high, medium, low)
- Key strengths of the submission
- Specific recommendations to improve clearance likelihood
- Analysis of how literature evidence supports the submission
`;
  }

  prompt += `
Please provide your assessment in the following JSON format:
{
  "approvalLikelihood": <number between 0-1 representing likelihood of FDA approval>,
  "riskFactors": [
    {
      "title": "<risk factor title>",
      "description": "<detailed description>",
      "severity": "<high|medium|low>",
      "impact": "<potential impact on submission>"
    }
  ],
  "strengths": [
    "<strength 1>",
    "<strength 2>"
  ],
  "recommendations": [
    "<recommendation 1>",
    "<recommendation 2>"
  ]
}

${
  options.includeHistoricalComparisons
    ? `
If historical comparisons are available, please include them in this format:
"historicalComparisons": [
  {
    "deviceName": "<device name>",
    "kNumber": "<K number>",
    "decisionDate": "<date of FDA decision>",
    "reviewTime": <number of days>,
    "similarityScore": <number 0-100>,
    "outcome": "<Cleared|Not Cleared>",
    "keyDifferences": "<key differences from submission device>"
  }
]
`
    : ''
}
`;

  return prompt;
}

/**
 * Generate a prompt for fix suggestions
 */
function generateFixSuggestionsPrompt(issues, deviceProfile, options) {
  let prompt = `
Please generate actionable fix suggestions for the following compliance issues in a 510(k) submission:

## Device Information:
- Name: ${deviceProfile.deviceName}
- Manufacturer: ${deviceProfile.manufacturerName}
- Regulatory Class: ${deviceProfile.deviceClass}
- Product Code: ${deviceProfile.productCode}

## Compliance Issues:
${issues
  .map(
    (issue, index) =>
      `${index + 1}. ${issue.title} (Severity: ${issue.severity})
     ${issue.description}
  `
  )
  .join('\n')}

`;

  if (options.deepAnalysis) {
    prompt += `
Please provide a deep analysis with specific, step-by-step implementation guidance for each issue.
Include regulatory references and resources where applicable.
`;
  }

  if (options.includeTemplates) {
    prompt += `
For documentation-related issues, suggest appropriate template types (e.g., 'software-documentation', 'biocompatibility') that could help address the issue.
`;
  }

  prompt += `
Please provide your suggestions in the following JSON format:
{
  "fixes": [
    {
      "issueIndex": <index of the issue from input list>,
      "fix": {
        "title": "<title of the fix>",
        "description": "<detailed description of the fix>",
        "implementationSteps": [
          "<step 1>",
          "<step 2>"
        ],
        "resourceLinks": [
          {
            "title": "<resource title>",
            "url": "<resource URL>"
          }
        ],
        "templateId": "<template id if applicable>"
      }
    }
  ]
}
`;

  return prompt;
}

/**
 * Generate a prompt for documentation templates
 */
function generateDocumentationTemplatePrompt(templateType, deviceId) {
  let prompt = `
Please generate a comprehensive FDA-compliant documentation template for a 510(k) submission.

## Template Type: ${templateType}
## Device ID: ${deviceId}

`;

  // Template-specific guidance
  switch (templateType) {
    case 'software':
      prompt += `
This should be a software documentation template following FDA guidance for medical device software.
Include sections for:
- Software description
- Risk analysis
- Requirements specifications
- Architecture design
- Unit, integration, and system level testing
- Verification and validation
- Cybersecurity considerations
- Revision history
`;
      break;
    case 'biocompatibility':
      prompt += `
This should be a biocompatibility documentation template following FDA guidance.
Include sections for:
- Materials characterization
- Biocompatibility testing plan
- Test protocols
- Results summary
- Risk assessment
- Literature review
`;
      break;
    case 'electrical-safety':
      prompt += `
This should be an electrical safety documentation template following FDA and IEC 60601-1 guidance.
Include sections for:
- Electrical specifications
- Safety testing procedures
- Compliance with standards
- Risk assessment
`;
      break;
    case 'clinical':
      prompt += `
This should be a clinical evaluation documentation template following FDA guidance.
Include sections for:
- Literature review methodology
- Study design
- Inclusion/exclusion criteria
- Endpoints
- Statistical analysis
- Results presentation
`;
      break;
    case 'labeling':
      prompt += `
This should be a labeling documentation template following FDA guidance.
Include sections for:
- Device label
- Instructions for use
- Package insert
- Warnings and precautions
- Indications for use
`;
      break;
  }

  prompt += `
Please provide your template in the following JSON format:
{
  "title": "<template title>",
  "description": "<comprehensive description of this document's purpose>",
  "sections": [
    {
      "title": "<section title>",
      "content": "<detailed guidance for this section>",
      "subSections": [
        "<subsection 1 guidance>",
        "<subsection 2 guidance>"
      ]
    }
  ],
  "referencedStandards": [
    "<standard 1>",
    "<standard 2>"
  ],
  "fdaGuidanceDocuments": [
    {
      "title": "<guidance document title>",
      "referenceNumber": "<reference number if available>"
    }
  ]
}
`;

  return prompt;
}

/**
 * Calculate approval likelihood based on risk factors and strengths
 *
 * This function implements a weighted scoring algorithm based on FDA clearance patterns
 * to estimate the likelihood of 510(k) clearance based on identified risk factors and strengths.
 *
 * @param {number} highRiskCount - Number of high-severity risk factors
 * @param {number} mediumRiskCount - Number of medium-severity risk factors
 * @param {number} lowRiskCount - Number of low-severity risk factors
 * @param {number} strengthsCount - Number of submission strengths
 * @returns {number} - Approval likelihood score (0-1)
 */
function calculateApprovalLikelihood(highRiskCount, mediumRiskCount, lowRiskCount, strengthsCount) {
  // Base approval likelihood starts at 85%
  let approvalLikelihood = 0.85;

  // Apply weighted deductions for risk factors
  // High-risk factors have the most significant impact
  approvalLikelihood -= highRiskCount * 0.15;

  // Medium-risk factors have moderate impact
  approvalLikelihood -= mediumRiskCount * 0.07;

  // Low-risk factors have minimal impact
  approvalLikelihood -= lowRiskCount * 0.03;

  // Add bonuses for submission strengths
  // Each strength can partially offset risk factors
  approvalLikelihood += strengthsCount * 0.04;

  // Apply diminishing returns for many strengths
  if (strengthsCount > 5) {
    // Cap the bonus from strengths
    approvalLikelihood -= (strengthsCount - 5) * 0.02;
  }

  // High-risk factors can cause automatic substantial deduction
  if (highRiskCount >= 3) {
    approvalLikelihood *= 0.7; // 30% additional reduction for 3+ high risks
  }

  // Ensure the result stays within 0-1 range
  approvalLikelihood = Math.max(0, Math.min(1, approvalLikelihood));

  return approvalLikelihood;
}

module.exports = router;
