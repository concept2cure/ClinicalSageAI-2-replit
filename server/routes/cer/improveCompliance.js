/**
 * CER Compliance Improvement Handler
 *
 * This module provides an AI-powered service to improve CER sections
 * by enhancing compliance with specific regulatory frameworks.
 */

// AI Gateway integration — centralised LLM routing, audit & policy
let _gateway = null;
async function getGatewayInstance() {
  if (!_gateway) {
    const mod = await import('../../services/ai-gateway/index.js');
    _gateway = mod.getGateway();
  }
  return _gateway;
}

/**
 * Get AI-generated improvements for a CER section to increase compliance
 * @param {Request} req - Express request object with section, compliance data, and standard
 * @param {Response} res - Express response object
 */
async function improveComplianceHandler(req, res) {
  try {
    const { section, complianceData, standard } = req.body;

    if (!section || !section.content) {
      return res.status(400).json({ error: 'Valid section content is required' });
    }

    if (!standard) {
      return res.status(400).json({ error: 'Regulatory standard is required' });
    }

    // Extract compliance issues if available
    let complianceIssues = [];
    if (complianceData && complianceData.standards && complianceData.standards[standard]) {
      if (complianceData.standards[standard].criticalGaps) {
        complianceIssues = complianceData.standards[standard].criticalGaps;
      }
      if (complianceData.standards[standard].suggestions) {
        complianceIssues = [...complianceIssues, ...complianceData.standards[standard].suggestions];
      }
    }

    // Format compliance issues for the prompt
    const issuesText =
      complianceIssues.length > 0
        ? 'Identified compliance issues:\n' + complianceIssues.map(issue => `- ${issue}`).join('\n')
        : 'No specific issues identified, but please improve overall compliance.';

    // Construct the prompt for improvement
    const systemMessage = {
      role: 'system',
      content: `You are an expert medical device regulatory specialist with deep knowledge of Clinical Evaluation Reports.
      Your task is to improve the content of a CER section to enhance its compliance with ${standard} requirements.

      ${issuesText}

      IMPORTANT GUIDELINES:
      1. Maintain the original section structure and intent
      2. Add necessary regulatory content and context
      3. Ensure comprehensive coverage of required elements for ${standard}
      4. Improve clarity, precision, and technical language
      5. Preserve any factual information present in the original
      6. Use appropriate regulatory terminology
      7. Include specific references to standards where relevant

      Return ONLY the improved content, formatted with markdown as needed.`,
    };

    // User message with the section content
    const userMessage = {
      role: 'user',
      content: `SECTION TITLE: ${section.title || 'Untitled Section'}\n\nCURRENT CONTENT:\n${section.content}`,
    };

    console.log(
      `Improving compliance for "${section.title}" against ${standard} standard via AI Gateway...`
    );

    // Route through AI Gateway — centralised audit, policy & rate limiting
    const gateway = await getGatewayInstance();
    const gatewayResponse = await gateway.route({
      taskType: 'cer_compliance_improve',
      messages: [systemMessage, userMessage],
      temperature: 0.3,
      maxTokens: 2500,
      callerModule: 'cer-improve-compliance',
      metadata: { sectionTitle: section.title, standard },
    });

    // Return the improved section
    res.json({
      originalTitle: section.title,
      originalType: section.type,
      improvedContent: gatewayResponse.content,
      standard,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error improving compliance:', error);
    res.status(500).json({
      error: 'Failed to improve section compliance',
      message: error.message || 'An unknown error occurred',
    });
  }
}

module.exports = improveComplianceHandler;
