const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
require('dotenv').config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let threadId = null;

const MODE_INTROS = {
  pm: 'You are acting as a biotech product manager and strategist.',
  compliance: 'You are acting as a regulatory compliance expert with deep ICH/FDA/GCP knowledge.',
  developer:
    'You are acting as a senior full-stack engineer advising on backend, frontend, and architecture.',
};

const BASE_PROMPT = `You are an advanced assistant in biotech, regulatory writing, and full stack software engineering. Stay on task. Help without breaking code or compliance. Be focused and context-aware.`;

router.post('/message', async (req, res) => {
  const { message, mode = 'pm', documentSection = '' } = req.body;

  try {
    if (!threadId) {
      const thread = await client.beta.threads.create();
      threadId = thread.id;
    }

    const systemPrompt = `${BASE_PROMPT}\n${MODE_INTROS[mode]}\n\nCurrent section:\n${documentSection}`;

    await client.beta.threads.messages.create({
      thread_id: threadId,
      role: 'user',
      content: `${systemPrompt}\n\nUser: ${message}`,
    });

    const run = await client.beta.threads.runs.create({
      thread_id: threadId,
      assistant_id: process.env.ASSISTANT_ID,
    });

    let runStatus = run.status;
    while (runStatus !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const updated = await client.beta.threads.runs.retrieve(run.id);
      runStatus = updated.status;
    }

    const response = await client.beta.threads.messages.list({ thread_id: threadId });
    const lastMsg = response.data[0].content[0].text.value;
    res.json({ reply: lastMsg });
  } catch (err) {
    console.error(err);
    res.status(500).send('Assistant error');
  }
});

module.exports = router;
