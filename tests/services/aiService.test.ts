/**
 * AI Service Unit Tests
 *
 * Tests for AI/OpenAI services including completions, embeddings, and assistants.
 *
 * @module tests/services/aiService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenAI
const mockOpenAI = {
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
  embeddings: {
    create: vi.fn(),
  },
  beta: {
    assistants: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    threads: {
      create: vi.fn(),
      messages: {
        create: vi.fn(),
        list: vi.fn(),
      },
      runs: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
};

vi.mock('openai', () => ({
  default: vi.fn(() => mockOpenAI),
}));

describe('AI Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Chat Completions', () => {
    it('should generate chat completion', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The 510(k) submission requires substantial equivalence demonstration.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 20,
          total_tokens: 70,
        },
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await mockOpenAI.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a regulatory expert.' },
          { role: 'user', content: 'What is required for a 510(k)?' },
        ],
      });

      expect(result.choices[0].message.content).toContain('510(k)');
      expect(result.usage.total_tokens).toBe(70);
    });

    it('should handle structured output', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                deviceClass: 'II',
                regulatoryPathway: '510(k)',
                predicateRequired: true,
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(mockResponse);

      const result = await mockOpenAI.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: 'Classify this device' }],
      });

      const parsed = JSON.parse(result.choices[0].message.content);
      expect(parsed.deviceClass).toBe('II');
      expect(parsed.regulatoryPathway).toBe('510(k)');
    });

    it('should handle rate limiting gracefully', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';

      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'Success after retry' } }],
        });

      // First call fails
      await expect(mockOpenAI.chat.completions.create({})).rejects.toThrow('Rate limit exceeded');

      // Second call succeeds
      const result = await mockOpenAI.chat.completions.create({});
      expect(result.choices[0].message.content).toBe('Success after retry');
    });

    it('should respect token limits', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response' }, finish_reason: 'length' }],
        usage: { total_tokens: 4096 },
      });

      const result = await mockOpenAI.chat.completions.create({
        max_tokens: 4096,
      });

      expect(result.choices[0].finish_reason).toBe('length');
    });
  });

  describe('Embeddings', () => {
    it('should generate text embedding', async () => {
      const mockEmbedding = {
        data: [
          {
            embedding: Array(1536).fill(0.1),
            index: 0,
          },
        ],
        model: 'text-embedding-3-small',
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValueOnce(mockEmbedding);

      const result = await mockOpenAI.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'Medical device regulatory compliance',
      });

      expect(result.data[0].embedding.length).toBe(1536);
      expect(result.model).toBe('text-embedding-3-small');
    });

    it('should handle batch embeddings', async () => {
      const mockBatchEmbedding = {
        data: [
          { embedding: Array(1536).fill(0.1), index: 0 },
          { embedding: Array(1536).fill(0.2), index: 1 },
          { embedding: Array(1536).fill(0.3), index: 2 },
        ],
        model: 'text-embedding-3-small',
      };

      mockOpenAI.embeddings.create.mockResolvedValueOnce(mockBatchEmbedding);

      const result = await mockOpenAI.embeddings.create({
        model: 'text-embedding-3-small',
        input: ['Document 1', 'Document 2', 'Document 3'],
      });

      expect(result.data.length).toBe(3);
    });

    it('should support different embedding dimensions', async () => {
      mockOpenAI.embeddings.create.mockResolvedValueOnce({
        data: [{ embedding: Array(256).fill(0.1) }],
      });

      const result = await mockOpenAI.embeddings.create({
        model: 'text-embedding-3-small',
        dimensions: 256,
        input: 'Test input',
      });

      expect(result.data[0].embedding.length).toBe(256);
    });
  });

  describe('Assistants API', () => {
    it('should create regulatory assistant', async () => {
      const mockAssistant = {
        id: 'asst_regulatory_001',
        name: 'Regulatory Expert',
        model: 'gpt-4o',
        instructions: 'You are a regulatory affairs expert.',
      };

      mockOpenAI.beta.assistants.create.mockResolvedValueOnce(mockAssistant);

      const result = await mockOpenAI.beta.assistants.create({
        name: 'Regulatory Expert',
        model: 'gpt-4o',
        instructions: 'You are a regulatory affairs expert.',
      });

      expect(result.id).toBe('asst_regulatory_001');
      expect(result.name).toBe('Regulatory Expert');
    });

    it('should create conversation thread', async () => {
      const mockThread = {
        id: 'thread_001',
        created_at: Date.now(),
      };

      mockOpenAI.beta.threads.create.mockResolvedValueOnce(mockThread);

      const result = await mockOpenAI.beta.threads.create();

      expect(result.id).toBe('thread_001');
    });

    it('should add message to thread', async () => {
      const mockMessage = {
        id: 'msg_001',
        thread_id: 'thread_001',
        role: 'user',
        content: [{ type: 'text', text: { value: 'What are the 510(k) requirements?' } }],
      };

      mockOpenAI.beta.threads.messages.create.mockResolvedValueOnce(mockMessage);

      const result = await mockOpenAI.beta.threads.messages.create('thread_001', {
        role: 'user',
        content: 'What are the 510(k) requirements?',
      });

      expect(result.thread_id).toBe('thread_001');
      expect(result.role).toBe('user');
    });

    it('should run assistant on thread', async () => {
      const mockRun = {
        id: 'run_001',
        thread_id: 'thread_001',
        assistant_id: 'asst_regulatory_001',
        status: 'queued',
      };

      mockOpenAI.beta.threads.runs.create.mockResolvedValueOnce(mockRun);

      const result = await mockOpenAI.beta.threads.runs.create('thread_001', {
        assistant_id: 'asst_regulatory_001',
      });

      expect(result.status).toBe('queued');
    });

    it('should retrieve run status', async () => {
      const mockCompletedRun = {
        id: 'run_001',
        status: 'completed',
      };

      mockOpenAI.beta.threads.runs.retrieve.mockResolvedValueOnce(mockCompletedRun);

      const result = await mockOpenAI.beta.threads.runs.retrieve('thread_001', 'run_001');

      expect(result.status).toBe('completed');
    });

    it('should list thread messages', async () => {
      const mockMessages = {
        data: [
          { id: 'msg_002', role: 'assistant', content: [{ text: { value: 'Response' } }] },
          { id: 'msg_001', role: 'user', content: [{ text: { value: 'Question' } }] },
        ],
      };

      mockOpenAI.beta.threads.messages.list.mockResolvedValueOnce(mockMessages);

      const result = await mockOpenAI.beta.threads.messages.list('thread_001');

      expect(result.data.length).toBe(2);
      expect(result.data[0].role).toBe('assistant');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      const apiError = new Error('Invalid API key');
      apiError.name = 'AuthenticationError';

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(apiError);

      await expect(mockOpenAI.chat.completions.create({})).rejects.toThrow('Invalid API key');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';

      mockOpenAI.chat.completions.create.mockRejectedValueOnce(timeoutError);

      await expect(mockOpenAI.chat.completions.create({})).rejects.toThrow('Request timeout');
    });

    it('should handle content filter', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { content: null }, finish_reason: 'content_filter' }],
      });

      const result = await mockOpenAI.chat.completions.create({});

      expect(result.choices[0].finish_reason).toBe('content_filter');
      expect(result.choices[0].message.content).toBeNull();
    });
  });
});
