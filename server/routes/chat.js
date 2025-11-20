/**
 * Chat API Routes
 *
 * These routes handle the AI chat functionality for document-related queries
 * and regulatory assistance.
 */

import { Router } from 'express';
import * as aiUtils from '../services/aiUtils.js';

const router = Router();

/**
 * POST /api/chat/message - Send a chat message and get AI response
 */
router.post('/chat/message', async (req, res, next) => {
  try {
    const { message, context, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create the system message based on context
    let systemInstruction = `You are TrialSage AI, a regulatory intelligence assistant specializing in pharmaceutical and clinical trial documentation.
    You provide concise, accurate, and helpful responses about regulatory documents, clinical trials, and regulatory compliance.
    Always base your responses on regulatory standards, guidelines, and best practices.`;

    // Add context-specific instructions
    if (context === 'csr') {
      systemInstruction += `\nYou are currently working in the context of Clinical Study Reports (CSRs).
      Focus on ICH E3 guidance, structure, content requirements, and best practices for CSRs.`;
    } else if (context === 'protocol') {
      systemInstruction += `\nYou are currently working in the context of Clinical Trial Protocols.
      Focus on ICH E6(R2) guidance, protocol design, essential elements, and best practices.`;
    } else if (context === 'ind') {
      systemInstruction += `\nYou are currently working in the context of Investigational New Drug (IND) applications.
      Focus on FDA requirements, CTD format, and best practices for IND submissions.`;
    }

    // Create the full conversation history for context
    const conversationHistory = [
      { role: 'system', content: systemInstruction },
      ...history.map(entry => ({
        role: entry.isUser ? 'user' : 'assistant',
        content: entry.content,
      })),
      { role: 'user', content: message },
    ];

    // Process with OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: conversationHistory,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in chat API:', error);

    if (error.message.includes('OpenAI API error')) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        details: error.message,
      });
    }

    next(error);
  }
});

/**
 * POST /api/chat/document-query - Query about a specific document
 */
router.post('/chat/document-query', async (req, res, next) => {
  try {
    const { query, documentId, documentText } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!documentText) {
      return res.status(400).json({ error: 'Document text is required' });
    }

    // Create prompt for document-specific query
    const instruction = `You are an expert in regulatory documentation analysis.
    Answer the following query about a specific document, using only the
    document text provided. Be precise and concise in your response.
    If the answer cannot be found in the document, clearly state that.`;

    // Combine document text and query
    const contextAndQuery = `
    Document text:
    ${documentText.substring(0, 8000)}
    
    User query: ${query}
    `;

    const response = await aiUtils.processWithOpenAI(contextAndQuery, instruction);

    res.json({
      response,
      documentId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in document query API:', error);
    next(error);
  }
});

export default router;
