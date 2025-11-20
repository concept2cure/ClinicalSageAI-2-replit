const express = require('express');
const axios = require('axios');
const router = express.Router();

// Simple in-memory conversation storage (in production, use a database)
const conversations = new Map();

router.post('/chat', async (req, res) => {
  try {
    const { message, context, conversation_history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build conversation context
    let conversationPrompt = `You are an embedded AI coding assistant in the TrialSage regulatory platform. You help users with:
- Writing and debugging code
- Explaining complex concepts  
- Reviewing files and suggesting improvements
- Answering questions about software development

Be helpful, concise, and professional. Format code with \`\`\` blocks when appropriate.

User's question: ${message}`;

    // Add conversation history for context
    if (conversation_history && Array.isArray(conversation_history)) {
      const recentHistory = conversation_history
        .slice(-3)
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      if (recentHistory) {
        conversationPrompt = `Previous conversation:\n${recentHistory}\n\n${conversationPrompt}`;
      }
    }

    // Try OpenAI first (if configured)
    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content:
                  'You are an embedded AI coding assistant in the TrialSage regulatory platform. Be helpful, concise, and professional.',
              },
              {
                role: 'user',
                content: message,
              },
            ],
            max_tokens: 500,
            temperature: 0.7,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const reply =
          openaiResponse.data.choices[0]?.message?.content ||
          'I apologize, but I received an empty response.';

        return res.json({
          reply,
          source: 'openai',
          timestamp: new Date().toISOString(),
        });
      } catch (openaiError) {
        console.warn('OpenAI API failed, falling back to local response:', openaiError.message);
      }
    }

    // Try Anthropic Claude (if configured)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claudeResponse = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-sonnet-20240229',
            max_tokens: 500,
            messages: [
              {
                role: 'user',
                content: conversationPrompt,
              },
            ],
          },
          {
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
          }
        );

        const reply =
          claudeResponse.data.content[0]?.text || 'I apologize, but I received an empty response.';

        return res.json({
          reply,
          source: 'claude',
          timestamp: new Date().toISOString(),
        });
      } catch (claudeError) {
        console.warn('Claude API failed, falling back to local response:', claudeError.message);
      }
    }

    // Fallback to smart local responses
    const smartResponse = generateSmartResponse(message, context);

    res.json({
      reply: smartResponse,
      source: 'local',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      reply:
        "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
    });
  }
});

function generateSmartResponse(message, context) {
  const msg = message.toLowerCase();

  // Code-related responses
  if (msg.includes('code') || msg.includes('function') || msg.includes('bug')) {
    return `🔧 I'd be happy to help with your code! Based on your question about "${message}", here are some suggestions:

1. **Debug approach**: Check console logs and error messages first
2. **Best practices**: Ensure proper error handling and validation
3. **Code review**: Look for common issues like null references or async/await problems

Can you share the specific code you're working on? I can provide more targeted assistance.`;
  }

  // File-related responses
  if (msg.includes('file') || msg.includes('component') || msg.includes('jsx')) {
    return `📁 For file and component questions, I can help with:

• **React components**: Structure, props, state management
• **File organization**: Best practices for folder structure
• **Import/export**: Module management and dependencies

What specific file or component are you working with? Share the code and I'll review it!`;
  }

  // General help
  if (msg.includes('help') || msg.includes('how') || msg.includes('what')) {
    return `💡 I'm here to help! I can assist with:

• **Code debugging**: Find and fix issues in your code
• **Explanations**: Break down complex programming concepts
• **Best practices**: Suggest improvements and optimizations
• **Reviews**: Analyze your code for potential issues

What specific challenge are you facing? The more details you provide, the better I can help!`;
  }

  // Error-related responses
  if (msg.includes('error') || msg.includes('problem') || msg.includes('issue')) {
    return `🚨 Let's debug this issue! To help you effectively:

1. **Share the error message**: Exact text helps identify the problem
2. **Provide context**: What were you trying to do when it occurred?
3. **Show relevant code**: The specific lines causing trouble

Common fixes:
• Check for typos in variable/function names
• Verify all imports are correct
• Ensure dependencies are installed

What's the specific error you're encountering?`;
  }

  // Default response
  return `👋 Thanks for your question: "${message}"

I'm your embedded AI coding assistant! While I don't have access to external AI services right now, I can still help with:

• **Code review and debugging**
• **Best practices and suggestions**  
• **Explaining programming concepts**
• **File structure and organization**

For the most accurate help, please share:
1. The specific code you're working on
2. Any error messages you're seeing
3. What you're trying to accomplish

How can I assist you today?`;
}

module.exports = router;