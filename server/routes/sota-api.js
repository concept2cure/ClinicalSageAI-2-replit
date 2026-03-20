const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { ai } = require('../lib/unified-ai-client');

/**
 * State of the Art (SOTA) API
 *
 * This module provides endpoints for generating comprehensive State of the Art
 * analysis sections for Clinical Evaluation Reports as required by EU MDR and
 * MEDDEV 2.7/1 Rev 4.
 */

// Configure OpenAI
/**
 * Generate a State of the Art section based on provided medical and device information
 * Route: POST /api/cer/generate-sota
 */
router.post('/generate-sota', async (req, res) => {
  const {
    medicalCondition,
    conditionEpidemiology,
    currentTreatments,
    clinicalGuidelines,
    relevantStandards,
    deviceType,
    indications,
    expectedOutcomes,
    additionalContext,
  } = req.body;

  // Validate essential parameters
  if (!medicalCondition || !deviceType) {
    return res.status(400).json({
      error: 'Missing required parameters. Medical condition and device type are required.',
    });
  }

  try {
    logger.info('Generating SOTA section', {
      module: 'sota-api',
      condition: medicalCondition,
      device: deviceType,
    });

    // Build a comprehensive prompt that follows MEDDEV 2.7/1 Rev 4 requirements
    const prompt = `
You are a medical device regulatory expert specialized in Clinical Evaluation Reports under EU MDR.
Create a comprehensive "State of the Art" section for a Clinical Evaluation Report following MEDDEV 2.7/1 Rev 4 requirements.

Device Information:
- Medical Condition/Disease: ${medicalCondition}
- Device Type: ${deviceType}
${indications ? `- Indications for Use: ${indications}` : ''}
${expectedOutcomes ? `- Expected Clinical Outcomes: ${expectedOutcomes}` : ''}

${
  conditionEpidemiology
    ? `Epidemiology and Disease Burden:
${conditionEpidemiology}`
    : ''
}

${
  currentTreatments
    ? `Current Treatment Options:
${currentTreatments}`
    : ''
}

${
  clinicalGuidelines
    ? `Clinical Guidelines and Practice Standards:
${clinicalGuidelines}`
    : ''
}

${
  relevantStandards
    ? `Relevant Technical and Harmonized Standards:
${relevantStandards}`
    : ''
}

${
  additionalContext
    ? `Additional Context:
${additionalContext}`
    : ''
}

Create a complete State of the Art section with the following structure:
1. Introduction - Brief overview of the medical condition and device's purpose
2. Current Understanding of the Medical Condition - Prevalence, pathophysiology, impacts on patients
3. Standard of Care and Treatment Options - Current treatment approaches, competing products and alternatives
4. Clinical Guidelines and Best Practices - Relevant clinical practice guidelines and recommendations
5. Expected Performance Benchmarks - Typical outcomes, success criteria, and performance metrics for this type of device
6. Technical Standards and Requirements - Applicable technical standards and their relevance
7. Conclusion - Summary of the state of the art and positioning of the device

Important requirements:
- Format as a professional CER section with clear headings and structured paragraphs
- Include relevant citations indicated with brackets [x] where appropriate (these will be replaced with actual citations later)
- Ensure the content is factual, evidence-based, and appropriate for regulatory submission
- Compare current treatment options with objective criteria
- Use neutral, scientific language appropriate for a regulatory document
- Follow the exact structure outlined above with proper headings

The output should be a complete, well-structured State of the Art section ready for inclusion in an EU MDR-compliant Clinical Evaluation Report.
`;

    const aiResult = await ai.chat({
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
      max_tokens: 2500,
    });

    // Get the generated content
    const generatedContent = aiResult.content;

    // Return the generated SOTA section
    res.json({
      content: generatedContent,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });

    logger.info('SOTA section generated successfully', {
      module: 'sota-api',
      condition: medicalCondition,
      device: deviceType,
    });
  } catch (error) {
    logger.error('Error generating SOTA section', {
      module: 'sota-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate State of the Art section',
      message: error.message,
    });
  }
});

// Export using default for ESM compatibility
module.exports = router;
module.exports.default = router;
