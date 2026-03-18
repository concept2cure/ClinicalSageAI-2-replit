import express from 'express';
import { getOpenAIClient } from '../services/openai-client';
import logger from '../utils/logger.js';

/**
 * Device Equivalence API
 *
 * This module provides endpoints for generating equivalence assessments
 * for medical devices as required by EU MDR and MEDDEV 2.7/1 Rev 4.
 */

const router = express.Router();

// Configure OpenAI with the newest SDK
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = getOpenAIClient();

/**
 * Generate a feature-specific rationale for comparing a subject device feature
 * to an equivalent device feature
 * Route: POST /api/cer/equivalence/feature-rationale
 */
router.post('/feature-rationale', async (req, res) => {
  const { subjectDevice, equivalentDevice } = req.body;

  // Validate essential parameters
  if (!subjectDevice?.feature || !equivalentDevice?.feature) {
    return res.status(400).json({
      error:
        'Missing required parameters. Feature information for both subject and equivalent device is required.',
    });
  }

  try {
    logger.info('Generating feature equivalence rationale', {
      module: 'equivalence-api',
      feature: subjectDevice.feature.name,
    });

    // Build a comprehensive prompt for feature comparison
    const prompt = `
You are a medical device regulatory expert specializing in device equivalence assessments under EU MDR and MEDDEV 2.7/1 Rev 4.

Generate a detailed equivalence rationale for the following feature comparison:

Subject Device: ${subjectDevice.name || 'Subject device'}
Feature Category: ${subjectDevice.feature.category}
Feature Name: ${subjectDevice.feature.name}
Subject Device Value: ${subjectDevice.feature.value}

Equivalent Device: ${equivalentDevice.name || 'Equivalent device'}
Equivalent Device Value: ${equivalentDevice.feature.value}

Provide the following:
1. A concise rationale explaining whether this feature is equivalent between the two devices
2. An analysis of any differences and whether they would affect safety or performance
3. An overall impact assessment (none, minor, moderate, or significant)
4. Specific regulatory citations supporting your conclusion (EU MDR, MEDDEV, etc.)

Use an objective, scientific tone appropriate for regulatory documentation. Be precise and thorough.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in device equivalence assessments under EU MDR and MEDDEV 2.7/1 Rev 4.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    // Get the generated content
    const generatedContent = response.choices[0].message.content;

    // Extract impact level with regex
    let impact = 'none';
    const impactMatch = generatedContent.match(/impact:?\s*(none|minor|moderate|significant)/i);
    if (impactMatch) {
      impact = impactMatch[1].toLowerCase();
    }

    // Return the generated rationale
    res.json({
      rationale: generatedContent,
      impact: impact,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('Feature equivalence rationale generated successfully', {
      module: 'equivalence-api',
      feature: subjectDevice.feature.name,
    });
  } catch (error) {
    logger.error('Error generating feature equivalence rationale', {
      module: 'equivalence-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate feature equivalence rationale',
      message: error.message,
    });
  }
});

/**
 * Generate an overall equivalence assessment for a subject device
 * compared to an equivalent device
 * Route: POST /api/cer/equivalence/overall-assessment
 */
router.post('/overall-assessment', async (req, res) => {
  const { subjectDevice, equivalentDevice } = req.body;

  // Validate essential parameters
  if (!subjectDevice?.name || !equivalentDevice?.name || !equivalentDevice?.features?.length) {
    return res.status(400).json({
      error:
        'Missing required parameters. Subject device, equivalent device, and at least one feature comparison are required.',
    });
  }

  try {
    logger.info('Generating overall equivalence assessment', {
      module: 'equivalence-api',
      subject: subjectDevice.name,
      equivalent: equivalentDevice.name,
    });

    // Format features for the prompt
    const featuresText = equivalentDevice.features
      .map(
        feature =>
          `Feature: ${feature.name} (${feature.category})
- Subject Device: ${feature.subjectValue}
- Equivalent Device: ${feature.equivalentValue}
- Impact: ${feature.impact}
- Rationale: ${feature.rationale}`
      )
      .join('\n\n');

    // Build a comprehensive prompt for overall assessment
    const prompt = `
You are a medical device regulatory expert specializing in device equivalence assessments under EU MDR and MEDDEV 2.7/1 Rev 4.

Generate a comprehensive overall equivalence assessment for the following devices:

SUBJECT DEVICE:
Name: ${subjectDevice.name}
${subjectDevice.manufacturer ? `Manufacturer: ${subjectDevice.manufacturer}` : ''}
${subjectDevice.model ? `Model: ${subjectDevice.model}` : ''}
${subjectDevice.description ? `Description: ${subjectDevice.description}` : ''}

EQUIVALENT DEVICE:
Name: ${equivalentDevice.name}
${equivalentDevice.manufacturer ? `Manufacturer: ${equivalentDevice.manufacturer}` : ''}
${equivalentDevice.model ? `Model: ${equivalentDevice.model}` : ''}
${equivalentDevice.description ? `Description: ${equivalentDevice.description}` : ''}

FEATURE COMPARISONS:
${featuresText}

I need an overall equivalence assessment that:
1. Summarizes the key similarities and differences
2. Evaluates whether the devices can be considered equivalent according to MEDDEV 2.7/1 Rev 4 criteria
3. Explicitly addresses the three equivalence domains (clinical, technical, and biological)
4. Discusses whether any differences could significantly affect clinical performance or safety
5. Concludes with a clear statement about overall equivalence
6. Includes a statement confirming that the manufacturer has access to the clinical, technical, and biological data of the equivalent device (important for regulatory compliance)

Provide a structured assessment in a formal, regulatory-appropriate tone suitable for inclusion in a Clinical Evaluation Report. Use paragraph format with clear headings.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in device equivalence assessments under EU MDR and MEDDEV 2.7/1 Rev 4.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    // Get the generated content
    const generatedContent = response.choices[0].message.content;

    // Return the generated assessment
    res.json({
      overallRationale: generatedContent,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('Overall equivalence assessment generated successfully', {
      module: 'equivalence-api',
      subject: subjectDevice.name,
      equivalent: equivalentDevice.name,
    });
  } catch (error) {
    logger.error('Error generating overall equivalence assessment', {
      module: 'equivalence-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate overall equivalence assessment',
      message: error.message,
    });
  }
});

/**
 * Generate a complete Section E.4 for a Clinical Evaluation Report
 * based on device equivalence data
 * Route: POST /api/cer/equivalence/generate-section
 */
router.post('/generate-section', async (req, res) => {
  const { subjectDevice, equivalentDevices } = req.body;

  // Validate essential parameters
  if (!subjectDevice?.name || !equivalentDevices?.length) {
    return res.status(400).json({
      error:
        'Missing required parameters. Subject device and at least one equivalent device are required.',
    });
  }

  try {
    logger.info('Generating CER Section E.4', {
      module: 'equivalence-api',
      subject: subjectDevice.name,
      deviceCount: equivalentDevices.length,
    });

    // Format equivalent devices info for the prompt
    const devicesText = equivalentDevices
      .map((device, index) => {
        // Format the features for this device
        const deviceFeatures = device.features
          .map(
            feature =>
              `- ${feature.name} (${feature.category}):
  * Subject Device: ${feature.subjectValue}
  * Equivalent Device: ${feature.equivalentValue}
  * Impact: ${feature.impact}
  * Rationale: ${feature.rationale}`
          )
          .join('\n\n');

        return `EQUIVALENT DEVICE ${index + 1}:
Name: ${device.name}
${device.manufacturer ? `Manufacturer: ${device.manufacturer}` : ''}
${device.model ? `Model: ${device.model}` : ''}
${device.description ? `Description: ${device.description}` : ''}

Features:
${deviceFeatures}

Overall Rationale:
${device.overallRationale || 'Not provided'}`;
      })
      .join('\n\n' + '-'.repeat(50) + '\n\n');

    // Build a comprehensive prompt for section generation
    const prompt = `
You are a medical device regulatory expert specializing in Clinical Evaluation Reports under EU MDR and MEDDEV 2.7/1 Rev 4.

Generate a complete "Section E.4 - Device Equivalence" for a Clinical Evaluation Report following MEDDEV 2.7/1 Rev 4 requirements.

SUBJECT DEVICE:
Name: ${subjectDevice.name}
${subjectDevice.manufacturer ? `Manufacturer: ${subjectDevice.manufacturer}` : ''}
${subjectDevice.model ? `Model: ${subjectDevice.model}` : ''}
${subjectDevice.description ? `Description: ${subjectDevice.description}` : ''}

EQUIVALENT DEVICES:
${devicesText}

Create a complete Section E.4 that includes:

1. Introduction to device equivalence
   - Purpose of the section
   - Regulatory requirements (EU MDR, MEDDEV 2.7/1 Rev 4)
   - Criteria for establishing equivalence (clinical, technical, and biological characteristics)

2. For each equivalent device:
   - Subsection with device identification
   - Summary table comparing key characteristics
   - Analysis of similarities and differences
   - Feature-by-feature assessment
   - Statement confirming that the manufacturer has sufficient access to the data of the equivalent device (critical regulatory requirement)

3. Overall equivalence conclusion
   - Summary of findings for each device
   - Impact assessment for any differences
   - Final determination on whether data from the equivalent device(s) can be used to support the subject device

Use appropriate headings, tables (in markdown format), and structured content. Write in a formal, regulatory-appropriate tone suitable for a CER. Provide specific citations to regulatory documents and standards.

IMPORTANT: Include explicit statements confirming:
1. Full access to technical and clinical data for each equivalent device
2. Compliance with data access requirements of EU MDR Article 61(5)
3. Any limitations on the use of data from equivalent devices

The output should be a complete, well-structured Section E.4 ready for inclusion in an EU MDR-compliant Clinical Evaluation Report.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in Clinical Evaluation Reports under EU MDR and MEDDEV 2.7/1 Rev 4.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    // Get the generated content
    const generatedContent = response.choices[0].message.content;

    // Return the generated section
    res.json({
      sectionContent: generatedContent,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('CER Section E.4 generated successfully', {
      module: 'equivalence-api',
      subject: subjectDevice.name,
      deviceCount: equivalentDevices.length,
    });
  } catch (error) {
    logger.error('Error generating CER Section E.4', {
      module: 'equivalence-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate CER Section E.4',
      message: error.message,
    });
  }
});

/**
 * Data access check - validates if a manufacturer has proper data access for device equivalence
 * Route: POST /api/cer/equivalence/data-access-check
 */
router.post('/data-access-check', async (req, res) => {
  const {
    manufacturerName,
    equivalentDeviceInfo,
    accessType,
    accessDetails,
    contractReference,
    thirdPartyService,
    accessDomains,
  } = req.body;

  // Validate essential parameters
  if (!manufacturerName || !equivalentDeviceInfo || !accessType) {
    return res.status(400).json({
      error:
        'Missing required parameters. Manufacturer name, equivalent device information, and access type are required.',
    });
  }

  try {
    logger.info('Checking device data access compliance', {
      module: 'equivalence-api',
      manufacturer: manufacturerName,
      accessType: accessType,
    });

    // Build a prompt for data access compliance check
    const prompt = `
You are a medical device regulatory expert specializing in EU MDR compliance and device equivalence requirements.

Generate a detailed data access compliance assessment for:

Manufacturer: ${manufacturerName}
Equivalent Device: ${equivalentDeviceInfo.name || 'Not specified'}
${equivalentDeviceInfo.manufacturer ? `Manufacturer of Equivalent Device: ${equivalentDeviceInfo.manufacturer}` : ''}
Claimed Data Access Type: ${accessType}
${accessType === 'direct_contract' && contractReference ? `Contract Reference: ${contractReference}` : ''}
${accessType === 'indirect_access' && thirdPartyService ? `Third-Party Service: ${thirdPartyService}` : ''}
${accessDetails ? `Additional Details: ${accessDetails}` : ''}

EU MDR Compliance Areas:
- Technical Data Access: ${accessDomains?.technical ? 'Claimed' : 'Not claimed'}
- Biological Data Access: ${accessDomains?.biological ? 'Claimed' : 'Not claimed'}
- Clinical Data Access: ${accessDomains?.clinical ? 'Claimed' : 'Not claimed'}
- Documentation Available for Regulatory Review: ${accessDomains?.documented ? 'Yes' : 'No'}

Based on EU MDR Article 61(5) and MEDDEV 2.7/1 Rev 4, assess:

1. Whether the claimed data access is likely sufficient for regulatory compliance
2. Key documentation that should be in place (contracts, agreements, etc.)
3. Any potential regulatory issues or gaps
4. Recommended actions to ensure full compliance
5. Legal and contractual considerations

Provide a structured assessment focused on regulatory compliance. Be thorough and precise in your guidance.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in EU MDR compliance and device equivalence requirements.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    // Get the generated content
    const generatedContent = response.choices[0].message.content;

    // Parse content to determine compliance status based on both AI assessment and checklist
    let complianceStatus = 'uncertain';

    // Check if we have necessary data domains covered
    const hasMinimumDataAccess =
      accessDomains?.technical || accessDomains?.biological || accessDomains?.clinical;
    const hasDocumentation = accessDomains?.documented;

    // Essential for compliance: at least one data domain + documentation
    if (hasMinimumDataAccess && hasDocumentation) {
      // For direct contracts, we need a contract reference
      if (accessType === 'direct_contract' && !contractReference) {
        complianceStatus = 'non-compliant';
      }
      // For indirect access, we need a third-party service
      else if (accessType === 'indirect_access' && !thirdPartyService) {
        complianceStatus = 'non-compliant';
      }
      // If those check out, analyze the AI-generated content
      else if (
        generatedContent.toLowerCase().includes('compliant') ||
        generatedContent.toLowerCase().includes('sufficient') ||
        generatedContent.toLowerCase().includes('adequate')
      ) {
        complianceStatus = 'compliant';
      } else if (
        generatedContent.toLowerCase().includes('non-compliant') ||
        generatedContent.toLowerCase().includes('insufficient') ||
        generatedContent.toLowerCase().includes('inadequate')
      ) {
        complianceStatus = 'non-compliant';
      } else {
        // Default to compliant if checklist is complete but no clear indication in text
        complianceStatus = 'compliant';
      }
    } else {
      // Missing essential MDR Article 61(5) requirements
      complianceStatus = 'non-compliant';
    }

    // Return the generated assessment
    res.json({
      assessment: generatedContent,
      complianceStatus: complianceStatus,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('Data access compliance check completed', {
      module: 'equivalence-api',
      manufacturer: manufacturerName,
      status: complianceStatus,
    });
  } catch (error) {
    logger.error('Error checking data access compliance', {
      module: 'equivalence-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to check data access compliance',
      message: error.message,
    });
  }
});

export default router;
