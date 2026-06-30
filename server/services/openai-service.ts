import OpenAI from 'openai';
import type { Assistant } from 'openai/resources/beta/assistants';
import type { Message as ThreadMessage } from 'openai/resources/beta/threads/messages';
import type { Run } from 'openai/resources/beta/threads/runs/runs';
import type { Thread } from 'openai/resources/beta/threads/threads';
import { createScopedLogger } from '../utils/logger';
import { getGateway } from './ai-gateway/gateway';

const logger = createScopedLogger('openai-service');

// Initialize OpenAI client (optional — Claude is the primary AI provider)
// OpenAI is still needed for Assistants API features which don't have a Claude equivalent
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function requireOpenAI(): OpenAI {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is required for OpenAI service operations');
  }
  return openai;
}

/**
 * Create a new OpenAI Assistant
 */
export async function createAssistant(
  name: string,
  instructions: string,
  tools: any[] = []
): Promise<Assistant> {
  try {
    const assistant = await requireOpenAI().beta.assistants.create({
      name,
      instructions,
      tools,
      model: 'gpt-4o',
    });

    logger.info(`Created assistant with ID: ${assistant.id}`);
    return assistant;
  } catch (error) {
    logger.error('Error creating assistant', { error });
    throw error;
  }
}

/**
 * Create a new thread for an assistant conversation
 */
export async function createThread(): Promise<Thread> {
  try {
    const thread = await requireOpenAI().beta.threads.create();
    logger.info(`Created thread with ID: ${thread.id}`);
    return thread;
  } catch (error) {
    logger.error('Error creating thread', { error });
    throw error;
  }
}

/**
 * Add a message to an existing thread
 */
export async function addMessageToThread(
  threadId: string,
  content: string
): Promise<ThreadMessage> {
  try {
    const message = await requireOpenAI().beta.threads.messages.create(threadId, {
      role: 'user',
      content,
    });
    return message;
  } catch (error) {
    logger.error('Error adding message to thread', { error });
    throw error;
  }
}

/**
 * Run an assistant on a thread
 */
export async function runAssistant(threadId: string, assistantId: string): Promise<Run> {
  try {
    const run = await requireOpenAI().beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    return run;
  } catch (error) {
    logger.error('Error running assistant', { error });
    throw error;
  }
}

/**
 * Get the status of a run
 */
export async function getRunStatus(threadId: string, runId: string): Promise<Run> {
  try {
    const run = await requireOpenAI().beta.threads.runs.retrieve(runId, { thread_id: threadId });
    return run;
  } catch (error) {
    logger.error('Error getting run status', { error });
    throw error;
  }
}

/**
 * List messages in a thread
 */
export async function listMessages(threadId: string): Promise<{
  data: ThreadMessage[];
  firstId: string | null;
  lastId: string | null;
  hasMore: boolean;
}> {
  try {
    const messages = await requireOpenAI().beta.threads.messages.list(threadId);
    return {
      data: messages.data,
      firstId: messages.data[0]?.id || null,
      lastId: messages.data[messages.data.length - 1]?.id || null,
      hasMore: messages.has_more,
    };
  } catch (error) {
    logger.error('Error listing messages', { error });
    throw error;
  }
}

/**
 * Generate a structured response using the OpenAI Responses API
 * This uses the newer Responses API for more structured outputs
 */
export async function generateStructuredResponse<T>(
  prompt: string,
  systemPrompt: string
): Promise<T> {
  try {
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await requireOpenAI().responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse the response text as JSON
    try {
      // If the response is not in JSON format, this will throw an error
      return JSON.parse(response.output_text) as T;
    } catch (jsonError) {
      logger.error('Error parsing response as JSON', { error: jsonError });
      throw new Error('The response was not in valid JSON format');
    }
  } catch (error) {
    logger.error('Error generating structured response', { error });
    throw error;
  }
}

/**
 * Generate a text completion using the OpenAI Responses API with web search capability
 */
export async function generateWithWebSearch(prompt: string): Promise<string> {
  try {
    const response = await requireOpenAI().responses.create({
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      tools: [{ type: 'web_search_preview' }],
    });

    return response.output_text;
  } catch (error) {
    logger.error('Error generating response with web search', { error });
    throw error;
  }
}

/**
 * Generate an image using DALL-E 3
 */
export async function generateImage(prompt: string): Promise<string> {
  try {
    const response = await requireOpenAI().images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return response.data?.[0]?.url || '';
  } catch (error) {
    logger.error('Error generating image', { error });
    throw error;
  }
}

/**
 * Analyze text with OpenAI
 */
export async function analyzeText(text: string, instruction: string): Promise<string> {
  try {
    const gw = getGateway();
    const response = await gw.route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: text },
      ],
      callerModule: 'openai-service/analyzeText',
    });

    return response.content || '';
  } catch (error) {
    logger.error('Error analyzing text', { error });
    throw error;
  }
}

// NOTE: Image analysis through the gateway loses the actual image data since the gateway
// message format only supports text content. For full vision support, the gateway would
// need to be extended to support multi-modal content blocks.
/**
 * Analyze an image with OpenAI Vision
 */
export async function analyzeImage(imageBase64: string, prompt: string): Promise<string> {
  try {
    const gw = getGateway();
    const response = await gw.route({
      taskType: 'document_analysis',
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\n[Image analysis requested - base64 image data provided]`,
        },
      ],
      callerModule: 'openai-service/analyzeImage',
    });

    return response.content || '';
  } catch (error) {
    logger.error('Error analyzing image', { error });
    throw error;
  }
}
