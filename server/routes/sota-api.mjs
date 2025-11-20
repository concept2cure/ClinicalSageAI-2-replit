import express from 'express';
import OpenAI from 'openai';
import logger from '../utils/logger.js';

/**
 * State of the Art (SOTA) API
 *
 * This module provides endpoints for generating comprehensive State of the Art
 * analysis sections for Clinical Evaluation Reports as required by EU MDR and
 * MEDDEV 2.7/1 Rev 4.
 */

const router = express.Router();

// Configure OpenAI with the newest SDK
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Legacy State of the Art generation endpoint - deprecated
 * This endpoint is maintained for backward compatibility but should be replaced
 * with the simplified version below in new implementations
 */

/**
 * Generate a State of the Art analysis for a medical device with simplified parameters
 * Route: POST /api/cer/sota
 */
router.post('/', async (req, res) => {
  const { deviceName, deviceType, indication, regulatoryFramework = 'EU MDR' } = req.body;

  // Validate essential parameters
  if (!deviceName || !deviceType) {
    return res.status(400).json({
      error: 'Missing required parameters. Device name and device type are required.',
    });
  }

  try {
    logger.info('Generating simplified SOTA analysis', {
      module: 'sota-api',
      device: deviceName,
      type: deviceType,
      framework: regulatoryFramework,
    });

    // Build a comprehensive prompt that follows MEDDEV 2.7/1 Rev 4 requirements
    const prompt = `
You are a medical device regulatory expert specialized in Clinical Evaluation Reports under ${regulatoryFramework}.
Create a comprehensive "State of the Art" section for a Clinical Evaluation Report following MEDDEV 2.7/1 Rev 4 requirements.

Device Information:
- Device Name: ${deviceName}
- Device Type/Classification: ${deviceType}
${indication ? `- Indications for Use: ${indication}` : '- Indications for Use: Based on the device type and common indications'}

Create a well-researched State of the Art section with the following structure:
1. Introduction - Brief overview of the medical condition and device's purpose
2. Current Understanding of the Medical Condition - Prevalence, pathophysiology, impacts on patients
3. Standard of Care and Treatment Options - Current treatment approaches, competing products and alternatives
4. Clinical Guidelines and Best Practices - Relevant clinical practice guidelines and recommendations
5. Expected Performance Benchmarks - Typical outcomes, success criteria, and performance metrics for this type of device
6. Technical Standards and Requirements - Applicable technical standards and their relevance
7. Conclusion - Summary of the state of the art and positioning of the device

Important requirements:
- Format as a professional CER section with markdown-style headings (using # for top level, ## for second, etc.)
- Include relevant citations indicated with brackets [x] where appropriate (these will be replaced with actual citations later)
- Ensure the content is factual, evidence-based, and appropriate for regulatory submission
- Compare current treatment options with objective criteria
- Use neutral, scientific language appropriate for a regulatory document
- Follow the exact structure outlined above with proper headings
- Provide specific mentions of applicable quality standards (ISO, IEC, ASTM) relevant to this device type
- Include information about key performance indicators and safety considerations

The output should be a complete, well-structured State of the Art section ready for inclusion in a ${regulatoryFramework}-compliant Clinical Evaluation Report.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specialized in Clinical Evaluation Reports under EU MDR and MEDDEV 2.7/1 Rev 4.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    // Get the generated content
    const generatedContent = response.choices[0].message.content;

    // Return the generated SOTA section
    res.json({
      content: generatedContent,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('Simplified SOTA analysis generated successfully', {
      module: 'sota-api',
      device: deviceName,
      type: deviceType,
    });
  } catch (error) {
    logger.error('Error generating simplified SOTA analysis', {
      module: 'sota-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate State of the Art analysis',
      message: error.message,
    });
  }
});

/**
 * Generate an enhanced State of the Art analysis with comparative assessment
 * against standard of care treatments and competitor devices
 * Route: POST /api/cer/sota/comparative
 */
router.post('/comparative', async (req, res) => {
  const {
    deviceName,
    deviceType,
    indication,
    regulatoryFramework = 'EU MDR',
    manufacturers = [],
    competitorDevices = [],
    outcomeMetrics = [],
  } = req.body;

  // Validate essential parameters
  if (!deviceName || !deviceType) {
    return res.status(400).json({
      error: 'Missing required parameters. Device name and device type are required.',
    });
  }

  try {
    logger.info('Generating comparative SOTA analysis', {
      module: 'sota-api',
      device: deviceName,
      type: deviceType,
      framework: regulatoryFramework,
    });

    // Build a comprehensive prompt that follows MEDDEV 2.7/1 Rev 4 requirements
    // with enhanced focus on comparative assessment
    const prompt = `
You are a medical device regulatory expert specialized in Clinical Evaluation Reports under ${regulatoryFramework}.
Create a comprehensive and enhanced "State of the Art" section for a Clinical Evaluation Report following MEDDEV 2.7/1 Rev 4 and BSI Group requirements.
This SOTA analysis should specifically focus on comparative assessment of the subject device against standard of care treatments and competitor devices.

Device Information:
- Subject Device Name: ${deviceName}
- Device Type/Classification: ${deviceType}
${indication ? `- Indications for Use: ${indication}` : '- Indications for Use: Based on the device type and common indications'}
${competitorDevices.length > 0 ? `- Competitor Devices: ${competitorDevices.join(', ')}` : ''}
${manufacturers.length > 0 ? `- Manufacturers in Space: ${manufacturers.join(', ')}` : ''}
${outcomeMetrics.length > 0 ? `- Key Outcome Metrics: ${outcomeMetrics.join(', ')}` : ''}

Create a well-researched comparative State of the Art section with the following structure:
1. Introduction - Brief overview of the medical condition and device's purpose
2. Current Understanding of the Medical Condition - Prevalence, pathophysiology, impacts on patients
3. Standard of Care and Treatment Options - Current treatment approaches, competing products and alternatives
4. Comparative Safety Analysis - Subject device's safety profile compared to standard of care (benefits, risks, adverse events)
5. Comparative Performance Analysis - Subject device's performance metrics compared to alternatives
6. Comparative Clinical Outcomes - Expected outcomes for the subject device compared to alternatives
7. Technical Standards and Requirements - Applicable technical standards and their relevance
8. Conclusion - Positioning of the subject device within the state of the art landscape

Important requirements:
- Format as a professional CER section with markdown-style headings (using # for top level, ## for second, etc.)
- Include relevant citations indicated with brackets [x] where appropriate
- Using authentic data sources, compare the subject device's safety/performance with established therapies and competitor devices
- Structure the comparative analysis to clearly highlight areas where the subject device has advantages or disadvantages
- Include information on clinically significant differences in outcomes between the subject device and alternatives
- Use unbiased, objective language appropriate for EU/UK regulatory expectations on benefit-risk assessment
- Include applicable quality standards (ISO, IEC, ASTM) relevant to this device type
- Include a table or structured format comparing key performance indicators across competitor devices
- For each comparative claim, include some reference to the supporting evidence type (clinical study, post-market data, literature)

The output should be a complete, well-structured comparative State of the Art section ready for inclusion in a ${regulatoryFramework}-compliant Clinical Evaluation Report.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specialized in Clinical Evaluation Reports under EU MDR and MEDDEV 2.7/1 Rev 4, with expertise in comparative assessment of medical devices against standard of care and competitor devices.',
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

    // Return the generated SOTA section
    res.json({
      content: generatedContent,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('Comparative SOTA analysis generated successfully', {
      module: 'sota-api',
      device: deviceName,
      type: deviceType,
    });
  } catch (error) {
    logger.error('Error generating comparative SOTA analysis', {
      module: 'sota-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate comparative State of the Art analysis',
      message: error.message,
    });
  }
});

export default router;
