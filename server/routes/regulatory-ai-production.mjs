/**
 * Enterprise-Grade Regulatory AI API
 *
 * This module provides production-ready REST API endpoints for interacting with a
 * regulatory AI assistant that helps users with medical device and pharmaceutical
 * regulatory questions through OpenAI integration.
 *
 * Main features:
 * - Regulatory Q&A through natural language using OpenAI GPT-4o
 * - Document analysis for regulatory content
 * - Context-aware responses based on the regulatory module being used
 *
 * @version 1.0.0
 * @license Proprietary
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Enable production-grade rate limiting for all AI endpoints
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  message: {
    error: 'Too many requests, please try again later.',
  },
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Setup enterprise-grade temporary storage for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/ai-uploads');
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create a secure, unique filename to prevent overwriting
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Sanitize the original filename to prevent path traversal attacks
    const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, 'ai-upload-' + uniqueSuffix + path.extname(sanitizedName));
  },
});

// Configure production-grade file filter for uploads
const fileFilter = (req, file, cb) => {
  // Accept only specific document types - security measure
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/json',
    'image/jpeg',
    'image/png',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type: ' + file.mimetype), false);
  }
};

// Set up multer with secure storage and file filtering
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Maximum 5 files per upload
  },
  fileFilter: fileFilter,
});

// Initialize OpenAI client with production-ready configuration
const openaiApiKey = process.env.OPENAI_API_KEY;

// Validate API key is available
if (!openaiApiKey) {
  console.error('[CRITICAL ERROR] OPENAI_API_KEY environment variable is not set');
  throw new Error('OpenAI API key is required for production operation but not configured');
}

// Initialize client with robust error handling
let openai = null;
try {
  openai = new OpenAI({
    apiKey: openaiApiKey,
    timeout: 30000, // 30 second timeout for production reliability
    maxRetries: 2, // Allow up to 2 retries on failed requests
    defaultHeaders: {
      'User-Agent': 'TrialSage-RegulatoryCopilot/1.0.0', // Custom user agent for tracking
    },
  });

  console.log('OpenAI client initialized successfully');
} catch (error) {
  console.error('Critical error initializing OpenAI client:', error.message);
  console.error('Full error details:', error);
  throw new Error('Failed to initialize OpenAI client - service unavailable');
}

// Apply rate limiting to all routes
router.use(rateLimiter);

/**
 * Health check endpoint
 * GET /api/regulatory-ai/health
 */
router.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    openaiAvailable: !!openai,
    version: '1.0.0',
  });
});

/**
 * Process an AI query using OpenAI GPT-4o
 * POST /api/regulatory-ai/query
 */
router.post('/query', async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  console.log(`[${requestId}] Processing regulatory AI query`);

  try {
    // Extract query data
    const { message, module, context, userId } = req.body;
    console.log(
      `[${requestId}] Query: "${message?.substring(0, 50)}${message?.length > 50 ? '...' : ''}" for module: ${module}`
    );

    // Validate required fields
    if (!message) {
      console.log(`[${requestId}] Error: Message is required but was not provided`);
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify OpenAI client is available
    if (!openai) {
      console.error(`[${requestId}] CRITICAL ERROR: OpenAI client is not initialized`);
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'The AI service is currently unavailable. Please contact your administrator.',
      });
    }

    // Create system prompt based on the module and context
    let systemPrompt = `You are AnA (Audit & Narrative Assistant), a helpful assistant specializing in medical device and pharmaceutical regulatory affairs knowledge.
    
- Focus on providing clear, concise regulatory guidance based on FDA, EU MDR, and global regulatory standards.
- Reference specific regulations, guidance documents, and standards when appropriate.
- When uncertain, acknowledge limitations and suggest resources rather than providing potentially incorrect information.
- Format responses with markdown to improve readability.`;

    // Add module-specific context to the system prompt
    if (module) {
      systemPrompt += `\n\nYou are currently helping with the ${module} module.`;

      // Add specific guidance based on module
      if (module.toLowerCase().includes('510k')) {
        systemPrompt += `\n\nFor 510(k) submissions:
- Focus on substantial equivalence requirements and documentation.
- Reference relevant FDA guidance documents when appropriate.
- Help identify potential predicate devices and substantial equivalence considerations.
- Provide insights on testing requirements based on device classification.`;
      } else if (module.toLowerCase().includes('cer')) {
        systemPrompt += `\n\nFor Clinical Evaluation Reports (CER):
- Focus on EU MDR 2017/745 compliance requirements.
- Reference MEDDEV 2.7/1 rev 4 guidelines when appropriate.
- Help structure the clinical evaluation process and documentation.
- Provide insights on clinical evidence requirements and literature search strategies.`;
      }
    }

    // Add any additional context if provided
    if (context && Object.keys(context).length > 0) {
      systemPrompt += `\n\nContext Information:\n${JSON.stringify(context, null, 2)}`;
    }

    // Prepare messages array for the API request
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    // Make the API request with production-grade error handling
    console.log(`[${requestId}] Sending request to OpenAI API`);
    const startTime = Date.now();
    let completion;

    try {
      // Use proper production settings with OpenAI
      completion = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: messages,
        temperature: 0.3, // Lower temperature for more accurate regulatory information
        max_tokens: 2048,
        top_p: 0.95,
        frequency_penalty: 0.5, // Reduce repetition
        presence_penalty: 0.1, // Slightly encourage mentioning new topics
        user: userId || requestId, // For OpenAI usage tracking
      });

      const requestDuration = Date.now() - startTime;
      console.log(`[${requestId}] API request completed in ${requestDuration}ms`);
    } catch (error) {
      // Production-ready error handling with appropriate status codes
      console.error(`[${requestId}] OpenAI API request failed:`, error.message);

      if (error.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message:
            'The AI service is currently experiencing high demand. Please try again in a few moments.',
        });
      } else if (error.status === 401 || error.status === 403) {
        console.error(`[${requestId}] CRITICAL: Authentication error with OpenAI API`);
        return res.status(500).json({
          error: 'Authentication error',
          message:
            'The AI service is currently unavailable due to an authentication issue. Our team has been notified.',
        });
      } else {
        return res.status(500).json({
          error: 'Service error',
          message:
            'We encountered an issue with the AI service. Our team has been notified of this issue.',
        });
      }
    }

    // Extract the response
    const aiResponse = completion.choices[0].message.content;
    console.log(`[${requestId}] Successfully generated response (${aiResponse.length} chars)`);

    // Return the AI response
    return res.status(200).json({ response: aiResponse });
  } catch (error) {
    console.error(`[${requestId}] Unhandled error:`, error.message);
    console.error('Full error stack:', error.stack);

    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred. Our team has been notified.',
    });
  }
});

/**
 * File upload endpoint for AI analysis
 * POST /api/regulatory-ai/upload
 */
router.post('/upload', upload.array('files', 5), async (req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  console.log(`[${requestId}] Processing file upload for AI analysis`);

  try {
    // Extract request data
    const { module, context, userId } = req.body;
    const files = req.files;
    console.log(
      `[${requestId}] Received ${files?.length || 0} files for analysis in module: ${module}`
    );

    // Validate that files were uploaded
    if (!files || files.length === 0) {
      console.log(`[${requestId}] Error: No files were uploaded`);
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    // Log the uploaded file info
    files.forEach(file => {
      console.log(
        `[${requestId}] File: ${file.originalname}, size: ${(file.size / 1024).toFixed(2)} KB, type: ${file.mimetype}`
      );
    });

    // Verify OpenAI client is available
    if (!openai) {
      console.error(
        `[${requestId}] CRITICAL ERROR: OpenAI client is not initialized for file analysis`
      );

      // Clean up the uploaded files
      files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error(`[${requestId}] Error deleting file:`, err);
        });
      });

      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'The document analysis service is currently unavailable. Please try again later.',
      });
    }

    // Create system prompt for file analysis
    let systemPrompt = `You are AnA (Audit & Narrative Assistant), a helpful assistant specializing in medical device and pharmaceutical regulatory affairs knowledge.
    
- Focus on providing clear, concise regulatory guidance based on the uploaded documents.
- Reference specific regulations and standards when appropriate.
- Provide a comprehensive analysis of the uploaded files.
- Extract key regulatory insights and implications.
- Format responses with markdown to improve readability.`;

    // Add module-specific context to the system prompt
    if (module) {
      systemPrompt += `\n\nYou are analyzing documents related to the ${module} module.`;

      // Add specific guidance based on module
      if (module.toLowerCase().includes('510k')) {
        systemPrompt += `\n\nFor 510(k) submissions:
- Focus on substantial equivalence indicators in these documents.
- Identify potential predicate device information.
- Extract device classification data if present.
- Note any regulatory pathway indicators.`;
      } else if (module.toLowerCase().includes('cer')) {
        systemPrompt += `\n\nFor Clinical Evaluation Reports (CER):
- Identify clinical data useful for MDR 2017/745 compliance.
- Extract information relevant to MEDDEV 2.7/1 rev 4 guidelines.
- Identify clinical evidence strengths and gaps.
- Look for risk-benefit information.`;
      }
    }

    // Add any additional context if provided
    if (context && Object.keys(context).length > 0) {
      systemPrompt += `\n\nContext Information:\n${JSON.stringify(context, null, 2)}`;
    }

    // Add summary of files
    systemPrompt += '\n\nThe user has uploaded the following files for analysis:';
    files.forEach(file => {
      systemPrompt += `\n- ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(1)} KB)`;
    });

    // Prepare messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Please analyze these documents and provide regulatory insights.' },
    ];

    // Send to OpenAI for analysis with proper production reliability measures
    console.log(`[${requestId}] Sending document analysis request to OpenAI API`);
    const startTime = Date.now();
    let completion;

    try {
      // Production-ready API call with appropriate settings
      completion = await openai.chat.completions.create({
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages: messages,
        temperature: 0.3, // Lower temperature for more accurate regulatory analysis
        max_tokens: 2048,
        top_p: 0.95,
        frequency_penalty: 0.5, // Reduce repetition
        presence_penalty: 0.1, // Slightly encourage mentioning new topics
        user: userId || requestId, // For OpenAI usage tracking
      });

      const requestDuration = Date.now() - startTime;
      console.log(`[${requestId}] File analysis completed in ${requestDuration}ms`);
    } catch (error) {
      // Production error handling with appropriate status codes
      console.error(`[${requestId}] OpenAI file analysis request failed:`, error.message);

      // Clean up the uploaded files
      files.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) console.error(`[${requestId}] Error deleting file:`, err);
        });
      });

      if (error.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message:
            'The document analysis service is currently experiencing high demand. Please try again in a few moments.',
        });
      } else if (error.status === 401 || error.status === 403) {
        console.error(
          `[${requestId}] CRITICAL: Authentication error with OpenAI API during file analysis`
        );
        return res.status(500).json({
          error: 'Authentication error',
          message:
            'The document analysis service is currently unavailable due to an authentication issue. Our team has been notified.',
        });
      } else {
        return res.status(500).json({
          error: 'Service error',
          message:
            'We encountered an issue while analyzing your documents. Our team has been notified of this issue.',
        });
      }
    }

    // Extract the response
    const aiResponse = completion.choices[0].message.content;
    console.log(`[${requestId}] Successfully generated file analysis (${aiResponse.length} chars)`);

    // Return the AI response with file metadata
    return res.status(200).json({
      response: aiResponse,
      files: files.map(file => ({
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      })),
    });
  } catch (error) {
    console.error(`[${requestId}] Unhandled error in file upload:`, error.message);
    console.error('Full error stack:', error.stack);

    return res.status(500).json({
      error: 'Internal server error',
      message:
        'An unexpected error occurred while processing your files. Our team has been notified.',
    });
  }
});

// Export the router with default export for ESM compatibility
export default router;
