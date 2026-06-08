/**
 * CMC CoPilot
 *
 * This module provides an intelligent assistant API for CMC-related functions,
 * offering natural language interactions, data retrieval, and task automation
 * across all aspects of Chemistry, Manufacturing, and Controls documentation.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Rate limiter for CMC CoPilot
const copilotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many copilot requests, please try again after a minute',
});
import { ai } from '../../lib/unified-ai-client';

// Create router
const router = express.Router();

// Get OpenAI client
// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// System base prompt for the CMC CoPilot
const CMC_COPILOT_BASE_PROMPT = `You are CMC CoPilot, an expert AI assistant specializing in Chemistry, Manufacturing, and Controls for pharmaceutical products.

Your expertise covers:
1. ICH, FDA, EMA, PMDA, and global regulatory CMC guidelines
2. Formulation development and manufacturing processes
3. Analytical methods and specifications
4. Stability studies and shelf-life determination
5. Process validation and control strategies
6. Pharmaceutical quality systems and GMP
7. CMC regulatory submissions (IND, NDA, MAA, etc.)
8. Regulatory inspection preparation and response

You communicate clearly, concisely, and accurately. For technical topics, you use precise scientific and regulatory terminology. You cite relevant guidelines where appropriate.

Your goal is to assist pharmaceutical professionals with accurate information and actionable assistance for CMC tasks.`;

/**
 * CMC CoPilot query endpoint
 * POST /api/cmc/cmc-copilot/query
 */
router.post('/query', checkForOpenAIKey, copilotLimiter, async (req, res) => {
  try {
    const { query, conversationId, context, previousMessages = [] } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Generate conversation ID if not provided
    const chatId = conversationId || uuidv4();

    // Prepare messages array
    let messages = [
      {
        role: 'system',
        content: CMC_COPILOT_BASE_PROMPT,
      },
    ];

    // Add context if provided
    if (context) {
      messages.push({
        role: 'system',
        content: `Additional context: ${context}`,
      });
    }

    // Add previous messages
    if (previousMessages && previousMessages.length > 0) {
      // Make sure messages alternate between user and assistant
      // and system messages remain at the beginning
      const formattedPreviousMessages = previousMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      messages = [...messages, ...formattedPreviousMessages];
    }

    // Add current query
    messages.push({
      role: 'user',
      content: query,
    });

    // Call OpenAI API
    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Extract the response
    const responseContent = aiResult.content;

    // Log the conversation
    logConversation(chatId, {
      timestamp: new Date().toISOString(),
      query,
      response: responseContent,
      context,
    });

    // Return the response
    return res.status(200).json({
      success: true,
      conversationId: chatId,
      query,
      response: responseContent,
      usage: completion.usage,
    });
  } catch (error) {
    console.error('Error in CMC CoPilot query:', error);
    return res.status(500).json({
      error: 'An error occurred while processing the query',
      details: error.message,
    });
  }
});

/**
 * CMC CoPilot specialized query endpoint
 * POST /api/cmc/cmc-copilot/specialized-query
 */
router.post('/specialized-query', checkForOpenAIKey, copilotLimiter, async (req, res) => {
  try {
    const {
      query,
      area, // 'formulation', 'process', 'analytical', 'regulatory', etc.
      product,
      documentType,
      targetMarket,
      conversationId,
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Generate conversation ID if not provided
    const chatId = conversationId || uuidv4();

    // Prepare specialized context based on area
    let specializedContext = '';

    switch (area) {
      case 'formulation':
        specializedContext = `You are now focusing specifically on pharmaceutical formulation development and optimization. 
        Draw on your expertise in preformulation, excipient selection, formulation stability, and dosage form development.
        ${product ? `The product in question is: ${product}.` : ''}`;
        break;
      case 'process':
        specializedContext = `You are now focusing specifically on pharmaceutical manufacturing processes and scale-up. 
        Draw on your expertise in unit operations, process parameters, equipment selection, and process validation.
        ${product ? `The product in question is: ${product}.` : ''}`;
        break;
      case 'analytical':
        specializedContext = `You are now focusing specifically on pharmaceutical analytical methods and specifications. 
        Draw on your expertise in method development, validation, stability-indicating methods, and impurity analysis.
        ${product ? `The product in question is: ${product}.` : ''}`;
        break;
      case 'regulatory':
        specializedContext = `You are now focusing specifically on CMC regulatory strategy and submissions. 
        Draw on your expertise in ${targetMarket ? targetMarket + ' requirements' : 'global regulatory requirements'}, 
        ${documentType ? documentType + ' preparation' : 'regulatory documentation'}, and regulatory interactions.
        ${product ? `The product in question is: ${product}.` : ''}`;
        break;
      default:
        specializedContext = `You are focusing on general CMC topics.
        ${product ? `The product in question is: ${product}.` : ''}
        ${targetMarket ? `The target market is: ${targetMarket}.` : ''}
        ${documentType ? `The document type relevant to this query is: ${documentType}.` : ''}`;
    }

    // Prepare messages array
    const messages = [
      {
        role: 'system',
        content: CMC_COPILOT_BASE_PROMPT,
      },
      {
        role: 'system',
        content: specializedContext,
      },
      {
        role: 'user',
        content: query,
      },
    ];

    // Call OpenAI API
    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.2,
      max_tokens: 2000,
    });

    // Extract the response
    const responseContent = aiResult.content;

    // Log the conversation
    logConversation(chatId, {
      timestamp: new Date().toISOString(),
      query,
      response: responseContent,
      area,
      product,
      documentType,
      targetMarket,
    });

    // Return the response
    return res.status(200).json({
      success: true,
      conversationId: chatId,
      query,
      response: responseContent,
      area,
      usage: completion.usage,
    });
  } catch (error) {
    console.error('Error in CMC CoPilot specialized query:', error);
    return res.status(500).json({
      error: 'An error occurred while processing the specialized query',
      details: error.message,
    });
  }
});

/**
 * CMC CoPilot function calling endpoint for executing tasks
 * POST /api/cmc/cmc-copilot/execute-task
 */
router.post('/execute-task', checkForOpenAIKey, copilotLimiter, async (req, res) => {
  try {
    const {
      instruction,
      conversationId,
      productContext,
      availableFunctions = [
        'createCapa',
        'updateDocument',
        'prepareSubmissionAnnex',
        'scheduleValidation',
      ],
    } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: 'Task instruction is required' });
    }

    // Generate conversation ID if not provided
    const chatId = conversationId || uuidv4();

    // Define available functions for the model
    const functions = [
      {
        name: 'createCapa',
        description: 'Create a Corrective and Preventive Action (CAPA) record',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Brief title for the CAPA',
            },
            description: {
              type: 'string',
              description: 'Detailed description of the issue',
            },
            priority: {
              type: 'string',
              enum: ['High', 'Medium', 'Low'],
              description: 'Priority level of the CAPA',
            },
            dueDate: {
              type: 'string',
              description: 'Due date for the CAPA in YYYY-MM-DD format',
            },
            assignee: {
              type: 'string',
              description: 'Person or role responsible for the CAPA',
            },
          },
          required: ['title', 'description', 'priority'],
        },
      },
      {
        name: 'updateDocument',
        description: 'Update a regulatory document with new or revised content',
        parameters: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'ID of the document to update',
            },
            section: {
              type: 'string',
              description: 'Section of the document to update',
            },
            content: {
              type: 'string',
              description: 'New content to add or replace existing content',
            },
            reason: {
              type: 'string',
              description: 'Reason for the update',
            },
          },
          required: ['documentId', 'section', 'content'],
        },
      },
      {
        name: 'prepareSubmissionAnnex',
        description: 'Prepare an annex document for regulatory submission',
        parameters: {
          type: 'object',
          properties: {
            annexType: {
              type: 'string',
              description: 'Type of annex to prepare',
            },
            product: {
              type: 'string',
              description: 'Product name',
            },
            targetMarket: {
              type: 'string',
              description: 'Target regulatory market',
            },
            relatedDocuments: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Related document IDs',
            },
          },
          required: ['annexType', 'product'],
        },
      },
      {
        name: 'scheduleValidation',
        description: 'Schedule a validation activity',
        parameters: {
          type: 'object',
          properties: {
            validationType: {
              type: 'string',
              description: 'Type of validation to schedule',
            },
            product: {
              type: 'string',
              description: 'Product name',
            },
            startDate: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format',
            },
            duration: {
              type: 'number',
              description: 'Duration in days',
            },
            resources: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Required resources or personnel',
            },
          },
          required: ['validationType', 'product', 'startDate'],
        },
      },
    ];

    // Filter functions based on availableFunctions
    const filteredFunctions = functions.filter(func => availableFunctions.includes(func.name));

    // Prepare messages
    const messages = [
      {
        role: 'system',
        content: `${CMC_COPILOT_BASE_PROMPT}
        
        You are now in task execution mode. You will analyze the user's instruction and determine which function to call to execute their request.
        
        ${productContext ? `Current product context: ${productContext}` : ''}
        
        Only use the functions you have been provided with. If the user's request cannot be fulfilled with these functions, explain what you cannot do instead of making a function call.`,
      },
      {
        role: 'user',
        content: instruction,
      },
    ];

    // Call OpenAI API with function calling
    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: messages,
      temperature: 0.1,
      max_tokens: 1500,
      tools: filteredFunctions.map(func => ({
        type: 'function',
        function: func,
      })),
    });

    // Extract the response
    const responseMessage = completion.choices[0].message;

    // Check if there's a function call
    let functionResponse = null;
    let functionCall = null;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Get the function call details
      functionCall = responseMessage.tool_calls[0];
      const functionName = functionCall.function.name;
      const functionArgs = JSON.parse(functionCall.function.arguments);

      // Simulate function execution (in a real implementation, these would be actual functions)
      switch (functionName) {
        case 'createCapa':
          functionResponse = {
            success: true,
            capaId: `CAPA-${Date.now().toString().substring(7)}`,
            title: functionArgs.title,
            priority: functionArgs.priority,
            createdAt: new Date().toISOString(),
            status: 'Open',
          };
          break;
        case 'updateDocument':
          functionResponse = {
            success: true,
            documentId: functionArgs.documentId,
            section: functionArgs.section,
            updateId: `UPDATE-${Date.now().toString().substring(7)}`,
            status: 'Pending Review',
            updatedAt: new Date().toISOString(),
          };
          break;
        case 'prepareSubmissionAnnex':
          functionResponse = {
            success: true,
            annexId: `ANNEX-${Date.now().toString().substring(7)}`,
            annexType: functionArgs.annexType,
            product: functionArgs.product,
            status: 'Draft',
            createdAt: new Date().toISOString(),
          };
          break;
        case 'scheduleValidation':
          functionResponse = {
            success: true,
            validationId: `VAL-${Date.now().toString().substring(7)}`,
            validationType: functionArgs.validationType,
            product: functionArgs.product,
            startDate: functionArgs.startDate,
            status: 'Scheduled',
            scheduledAt: new Date().toISOString(),
          };
          break;
        default:
          functionResponse = {
            success: false,
            error: 'Unknown function',
          };
      }
    }

    // Get a follow-up response to explain what was done
    const followUpMessages = [...messages];
    if (functionCall) {
      followUpMessages.push(responseMessage);
      followUpMessages.push({
        role: 'function',
        name: functionCall.function.name,
        content: JSON.stringify(functionResponse),
      });
    } else {
      followUpMessages.push(responseMessage);
    }

    const followUpCompletion = await ai.chat({
      model: 'gpt-4o',
      messages: followUpMessages,
      temperature: 0.2,
      max_tokens: 1000,
    });

    const followUpResponse = followUpCompletion.choices[0].message.content;

    // Log the task execution
    logConversation(chatId, {
      timestamp: new Date().toISOString(),
      instruction,
      functionCall: functionCall
        ? {
            name: functionCall.function.name,
            arguments: JSON.parse(functionCall.function.arguments),
          }
        : null,
      functionResponse,
      explanation: followUpResponse,
    });

    // Return the results
    return res.status(200).json({
      success: true,
      conversationId: chatId,
      instruction,
      functionCall: functionCall
        ? {
            name: functionCall.function.name,
            arguments: JSON.parse(functionCall.function.arguments),
          }
        : null,
      functionResponse,
      explanation: followUpResponse,
    });
  } catch (error) {
    console.error('Error in CMC CoPilot task execution:', error);
    return res.status(500).json({
      error: 'An error occurred while executing the task',
      details: error.message,
    });
  }
});

/**
 * Get CMC CoPilot suggestions for a specific context
 * POST /api/cmc/cmc-copilot/get-suggestions
 */
router.post('/get-suggestions', checkForOpenAIKey, copilotLimiter, async (req, res) => {
  try {
    const { context, documentType, currentContent, userRole = 'Regulatory Affairs' } = req.body;

    if (!context) {
      return res.status(400).json({ error: 'Context is required' });
    }

    // Prepare the prompt
    const suggestionsPrompt = `Based on the following context:
    
    Context: ${context}
    Document Type: ${documentType || 'Not specified'}
    User Role: ${userRole}
    ${currentContent ? `Current Content: ${currentContent.substring(0, 500)}...` : ''}
    
    Provide 3-5 actionable suggestions that would be helpful for a ${userRole} professional working on 
    ${documentType ? `a ${documentType} document` : 'CMC documentation'}.
    
    For each suggestion:
    1. Provide a concise, actionable recommendation
    2. Explain briefly why this is important or helpful
    3. Include any relevant regulatory considerations
    
    Format as a numbered list of suggestions, each with a clear title and brief explanation.`;

    // Call OpenAI API
    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: CMC_COPILOT_BASE_PROMPT,
        },
        {
          role: 'user',
          content: suggestionsPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    // Extract the suggestions
    const suggestions = aiResult.content;

    // Return the suggestions
    return res.status(200).json({
      success: true,
      context,
      documentType: documentType || 'Not specified',
      userRole,
      suggestions,
    });
  } catch (error) {
    console.error('Error in CMC CoPilot suggestions:', error);
    return res.status(500).json({
      error: 'An error occurred while generating suggestions',
      details: error.message,
    });
  }
});

/**
 * Get conversation history
 * GET /api/cmc/cmc-copilot/conversation/:conversationId
 */
router.get('/conversation/:conversationId', (req, res) => {
  try {
    const { conversationId } = req.params;

    // Sanitize the conversation ID to prevent directory traversal
    const sanitizedId = conversationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the log file path
    const logFilePath = path.join(logsDir, `conversation_${sanitizedId}.json`);

    // Check if the log file exists
    if (!fs.existsSync(logFilePath)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Read the conversation history
    const conversationHistory = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));

    // Return the conversation history
    return res.json(conversationHistory);
  } catch (error) {
    console.error('Error in getting conversation history:', error);
    return res.status(500).json({
      error: 'An error occurred while getting the conversation history',
      details: error.message,
    });
  }
});

/**
 * Helper function to log conversations
 */
function logConversation(conversationId, entry) {
  try {
    // Sanitize the conversation ID to prevent directory traversal
    const sanitizedId = conversationId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the log file path
    const logFilePath = path.join(logsDir, `conversation_${sanitizedId}.json`);

    // Get existing history or initialize new history
    let history = [];
    if (fs.existsSync(logFilePath)) {
      history = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
    }

    // Add new entry
    history.push(entry);

    // Write updated history
    fs.writeFileSync(logFilePath, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('Error logging conversation:', error);
    // Continue even if logging fails
  }
}

export default router;
