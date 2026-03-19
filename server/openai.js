/**
 * OpenAI Integration API for Concept2Cure
 *
 * This module provides secure endpoints to interact with OpenAI services.
 * It implements proper validation, error handling, rate limiting, and audit logging.
 */

import { getOpenAIClient } from './services/openai-client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Initialize OpenAI client
const openai = getOpenAIClient();

// Create rate limiter
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Input validation schemas using Zod
const generateCMCSchema = z.object({
  sectionType: z.string().min(1).max(100),
  drugDetails: z
    .object({
      name: z.string().min(1).max(200),
    })
    .optional(),
  currentContent: z.string().optional(),
  targetRegulations: z.array(z.string()).optional(),
});

const equipmentImageSchema = z.object({
  image: z.string().min(1),
  processDetails: z.object({}).optional(),
});

const regulatoryAssistantSchema = z.object({
  query: z.string().min(1).max(2000),
  threadId: z.string().nullable().optional(),
  files: z.array(z.string()).optional(),
});

const visualizeStructureSchema = z.object({
  moleculeDetails: z.object({
    name: z.string().min(1).max(200),
    formula: z.string().min(1).max(100),
    structureType: z.string(),
    properties: z.string().optional(),
  }),
  visualizationType: z.string().optional(),
  resolution: z.string().optional(),
});

// Audit logging function
function logApiUsage(req, endpoint, success, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    userId: req.user?.id || 'anonymous',
    success,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    ...details,
  };

  // In production, this would be saved to a database or logging service
  console.log('API Usage:', JSON.stringify(logEntry));
}

/**
 * Register OpenAI API routes
 * @param {Express} app - Express app instance
 */
export function registerOpenAIRoutes(app) {
  /**
   * Generate CMC content
   */
  app.post('/api/openai/generate-cmc', apiRateLimiter, async (req, res) => {
    try {
      // Validate request
      const validation = generateCMCSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }

      const { sectionType, drugDetails, currentContent, targetRegulations } = validation.data;

      // Generate prompt
      let prompt = `Generate content for the following CMC section: ${sectionType}.`;

      if (drugDetails) {
        prompt += ` The drug in question is ${drugDetails.name}.`;
      }

      if (currentContent) {
        prompt += ` Here is the current content which should be expanded: ${currentContent}`;
      }

      if (targetRegulations && targetRegulations.length > 0) {
        prompt += ` Ensure compliance with the following regulations: ${targetRegulations.join(', ')}.`;
      }

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in pharmaceutical Chemistry, Manufacturing, and Controls (CMC) writing. Provide detailed, scientifically accurate, and regulatory compliant content.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });

      // Log successful usage
      logApiUsage(req, 'generate-cmc', true, { sectionType });

      // Return response
      res.json({
        content: response.choices[0].message.content,
        usage: response.usage,
      });
    } catch (error) {
      console.error('Error generating CMC content:', error);

      // Log error
      logApiUsage(req, 'generate-cmc', false, { error: error.message });

      // Handle different error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Invalid input', details: error.message });
      }

      if (error.name === 'APIError') {
        return res.status(502).json({ error: 'OpenAI API error', details: error.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Process equipment image analysis
   */
  app.post('/api/openai/analyze-equipment-image', apiRateLimiter, async (req, res) => {
    try {
      // Validate request
      const validation = equipmentImageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }

      const { image, processDetails } = validation.data;

      // Call OpenAI Vision API
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: [
          {
            role: 'system',
            content:
              'You are an expert in pharmaceutical manufacturing equipment and GMP compliance. Analyze the provided image in detail.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this pharmaceutical manufacturing equipment image for regulatory compliance. Identify the equipment type, components, and any potential GMP issues.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      // Log successful usage
      logApiUsage(req, 'analyze-equipment-image', true);

      // Return response
      res.json({
        analysis: response.choices[0].message.content,
        usage: response.usage,
      });
    } catch (error) {
      console.error('Error analyzing equipment image:', error);

      // Log error
      logApiUsage(req, 'analyze-equipment-image', false, { error: error.message });

      // Handle different error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Invalid input', details: error.message });
      }

      if (error.name === 'APIError') {
        return res.status(502).json({ error: 'OpenAI API error', details: error.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Generate crystalline structure visualization
   */
  app.post('/api/openai/visualize-crystalline-structure', apiRateLimiter, async (req, res) => {
    try {
      // Validate request
      const validation = visualizeStructureSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }

      const { moleculeDetails, visualizationType, resolution } = validation.data;

      // Generate prompt
      const prompt = `
        Create a detailed visualization of the molecular structure of ${moleculeDetails.name} (${moleculeDetails.formula}).
        This is a ${moleculeDetails.structureType} structure${moleculeDetails.properties ? ` with ${moleculeDetails.properties}` : ''}.
        The visualization should be scientifically accurate, highly detailed, and suitable for pharmaceutical regulatory documentation.
        Show the 3D crystalline structure with clear molecular bonds, atomic positions, and lattice arrangement.
        Use a professional color scheme with light blue, navy, and white.
      `;

      // Call DALL-E 3 API
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: resolution || '1024x1024',
        quality: 'standard',
        style: 'natural',
      });

      // Log successful usage
      logApiUsage(req, 'visualize-crystalline-structure', true, {
        molecule: moleculeDetails.name,
        formula: moleculeDetails.formula,
      });

      // Return response
      res.json({
        image: response.data[0].url,
        revisedPrompt: response.data[0].revised_prompt,
      });
    } catch (error) {
      console.error('Error generating crystalline visualization:', error);

      // Log error
      logApiUsage(req, 'visualize-crystalline-structure', false, { error: error.message });

      // Handle different error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Invalid input', details: error.message });
      }

      if (error.name === 'APIError') {
        return res.status(502).json({ error: 'OpenAI API error', details: error.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Interact with CMC regulatory assistant
   */
  app.post('/api/openai/cmc-assistant', apiRateLimiter, async (req, res) => {
    try {
      // Validate request
      const validation = regulatoryAssistantSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }

      const { query, threadId, files } = validation.data;

      // The assistant ID would normally be stored in a database or config
      // Here we're hard-coding for simplicity
      const assistantId = 'asst_cmc_regulatory_expert';

      // Create or retrieve thread
      let thread;
      if (threadId) {
        try {
          thread = await openai.beta.threads.retrieve(threadId);
        } catch (error) {
          // If thread not found, create a new one
          thread = await openai.beta.threads.create();
        }
      } else {
        thread = await openai.beta.threads.create();
      }

      // Add message to thread
      await openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: query,
        file_ids: files || [],
      });

      // Run the assistant
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId,
      });

      // Poll for completion (in production, this would be handled with webhooks)
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);

      // Simple polling with a timeout (in production, use async patterns)
      let retries = 0;
      const maxRetries = 20;
      while (runStatus.status !== 'completed' && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        retries++;
      }

      if (runStatus.status !== 'completed') {
        throw new Error('Assistant run timed out or failed to complete');
      }

      // Get messages
      const messages = await openai.beta.threads.messages.list(thread.id);

      // Get the latest assistant message
      const latestMessage = messages.data
        .filter(message => message.role === 'assistant')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

      if (!latestMessage) {
        throw new Error('No assistant message found');
      }

      // Log successful usage
      logApiUsage(req, 'cmc-assistant', true, {
        threadId: thread.id,
        queryLength: query.length,
      });

      // Return response
      res.json({
        response: latestMessage.content[0].text.value,
        threadId: thread.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error querying regulatory assistant:', error);

      // Log error
      logApiUsage(req, 'cmc-assistant', false, { error: error.message });

      // Handle different error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Invalid input', details: error.message });
      }

      if (error.name === 'APIError') {
        return res.status(502).json({ error: 'OpenAI API error', details: error.message });
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
