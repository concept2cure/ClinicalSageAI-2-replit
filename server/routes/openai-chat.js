const express = require('express');
const router = express.Router();
const { analyzeText } = require('../openai-service');

// Simple conversational chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Get the latest user message
    const userMessages = messages.filter(msg => msg.role === 'user');
    const latestMessage = userMessages[userMessages.length - 1]?.content || '';

    // Create conversation context
    const conversationHistory = messages
      .slice(-10) // Keep last 10 messages for context
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are a helpful AI assistant for the TrialSage regulatory platform. You can:
- Discuss the user's project and files
- Explain regulatory concepts and clinical trial processes
- Provide guidance on document management
- Answer questions about pharmaceutical development
- Help understand code concepts (without writing code)

Be conversational, helpful, and knowledgeable about regulatory affairs and clinical trials.

Recent conversation:
${conversationHistory}`;

    const response = await analyzeText(
      latestMessage,
      systemPrompt,
      0.7, // Slightly higher temperature for conversational responses
      1000
    );

    res.json({ response });
  } catch (error) {
    console.error('OpenAI chat error:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      response: 'I apologize, but I encountered an error. Please try your question again.',
    });
  }
});

module.exports = router;
