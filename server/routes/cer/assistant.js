/**
 * CER AI Assistant API
 *
 * This API provides the intelligence for the Clinical Evaluation Report AI Assistant.
 * It leverages OpenAI's GPT-4o model to provide contextual responses about CER content,
 * regulatory compliance, and FAERS data interpretation.
 */

const express = require('express');
const router = express.Router();

// AI Gateway integration — centralised LLM routing, audit & policy
let _gateway = null;
async function getGatewayInstance() {
  if (!_gateway) {
    const mod = await import('../../services/ai-gateway/index.ts');
    _gateway = mod.getGateway();
  }
  return _gateway;
}

/**
 * POST /api/cer/assistant
 *
 * Handles AI assistant questions about CER content, regulatory requirements,
 * or FAERS data interpretation. Provides contextual responses with relevant
 * regulatory references when appropriate.
 */
router.post('/', async (req, res) => {
  try {
    const { question, context } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get existing context if provided
    const sections = context?.sections || [];
    const faers = context?.faers || [];
    const selectedSection = context?.selectedSection || null;
    const title = context?.title || 'Clinical Evaluation Report';

    // Prepare the context for the AI
    let contextualPrompt = generateContextualPrompt({
      question,
      sections,
      faers,
      selectedSection,
      title,
    });

    // Route through AI Gateway — centralised audit, policy & rate limiting
    const gateway = await getGatewayInstance();
    const gatewayResponse = await gateway.route({
      taskType: 'cer_assistant',
      messages: [
        {
          role: 'system',
          content: `You are an expert AI assistant specializing in Clinical Evaluation Reports (CERs) and medical device regulatory compliance.
          Your purpose is to help users understand regulatory requirements, interpret FAERS data, and improve their CER documentation.

          Always provide accurate, regulatory-focused answers that include:
          1. Direct answers to user questions
          2. Specific regulatory references when relevant (EU MDR, ISO 14155, FDA 21 CFR 812, etc.)
          3. Evidence-based insights, not opinions

          Important: Your responses should be structured in a clear, professional format.
          When appropriate, cite specific regulatory clauses, standards, or guidelines.
          Format your response as plain text.

          The conversation is taking place within the CER Builder platform.`,
        },
        {
          role: 'user',
          content: contextualPrompt,
        },
      ],
      temperature: 0.7,
      maxTokens: 1000,
      jsonMode: true,
      callerModule: 'cer-assistant',
      metadata: { cerTitle: title },
    });

    // Parse and process the AI response
    const aiResponse = JSON.parse(gatewayResponse.content);

    // Return structured response to the client
    return res.json({
      answer:
        aiResponse.answer ||
        aiResponse.response ||
        "I'm sorry, I couldn't generate a proper response.",
      references: aiResponse.references || aiResponse.citations || [],
    });
  } catch (error) {
    console.error('Error in CER assistant API:', error);
    return res.status(500).json({
      error: 'Failed to get AI assistant response',
      details: error.message,
    });
  }
});

/**
 * Generate a contextual prompt for the AI based on the question and available context
 */
function generateContextualPrompt({ question, sections, faers, selectedSection, title }) {
  let prompt = `User Question: ${question}\n\n`;

  // Add CER title context
  prompt += `CER Title: ${title}\n\n`;

  // Add selected section context if any
  if (selectedSection) {
    prompt += `The user is specifically asking about the "${selectedSection.title}" section of their CER.\n`;
    prompt += `Section Content:\n${selectedSection.content}\n\n`;
  }

  // Add FAERS data context if any
  if (faers && faers.length > 0) {
    prompt += `The CER includes FAERS data with ${faers.length} adverse event reports.\n\n`;

    // Include a summary of FAERS data
    // Group events by type for a summary
    const eventTypes = {};
    faers.slice(0, 10).forEach(report => {
      if (report.event_type) {
        eventTypes[report.event_type] = (eventTypes[report.event_type] || 0) + 1;
      }
    });

    if (Object.keys(eventTypes).length > 0) {
      prompt += 'FAERS Data Summary:\n';
      for (const [type, count] of Object.entries(eventTypes)) {
        prompt += `- ${type}: ${count} reports\n`;
      }
      prompt += '\n';
    }
  }

  // Add sections overview if not asking about a specific section
  if (!selectedSection && sections.length > 0) {
    prompt += 'CER Sections Overview:\n';
    sections.forEach(section => {
      prompt += `- ${section.title}\n`;
    });
    prompt += '\n';
  }

  // Add final instructions for the AI
  prompt += `Please provide a concise, regulatory-focused answer to the user's question.
  Include specific references to relevant regulations when appropriate.
  Format your response as JSON with 'answer' containing the main response and 'references'
  as an array of relevant regulatory citations or references.`;

  return prompt;
}

module.exports = router;
