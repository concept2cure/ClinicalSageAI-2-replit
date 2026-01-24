import express from 'express';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Basic OpenAI integration (you'll need to set OPENAI_API_KEY in environment)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Log function
async function logAgentActivity(logEntry) {
  try {
    const logDir = path.join(__dirname, '../../logs');
    await fs.mkdir(logDir, { recursive: true });

    const logFile = path.join(logDir, 'agent-history.json');
    let history = [];

    try {
      const existing = await fs.readFile(logFile, 'utf8');
      history = JSON.parse(existing);
    } catch (err) {
      // File doesn't exist yet, start with empty array
    }

    history.push(logEntry);
    await fs.writeFile(logFile, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Failed to log agent activity:', error);
  }
}

// Handle embedded agent requests
router.post('/embedded-agent', async (req, res) => {
  try {
    const { messages, prompt } = req.body;

    // For now, forward to the main assistant endpoint
    const assistantResponse = await fetch(
      `${req.protocol}://${req.get('host')}/api/assistant/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt || (messages && messages[messages.length - 1]?.content) || 'Hello',
          mode: 'developer',
          context: 'Embedded Coding Agent',
        }),
      }
    );

    const data = await assistantResponse.json();

    res.json({
      success: true,
      reply: data.reply || 'Agent response received',
    });
  } catch (error) {
    console.error('Embedded agent error:', error);
    res.status(500).json({
      success: false,
      reply: 'Agent temporarily unavailable',
    });
  }
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    message: 'Embedded coding agent is running',
    timestamp: new Date().toISOString(),
    modes: ['build', 'fix', 'summarize'],
  });
});

export default router;
