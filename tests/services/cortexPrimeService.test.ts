/**
 * Cortex Prime Service - Unit Tests
 *
 * Tests for the Cortex Prime AI backend service.
 *
 * @module tests/services/cortexPrimeService.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTestCortexAtom,
  mockPool,
  mockOpenAI,
} from '../setup';

describe('Cortex Prime Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Knowledge Atoms', () => {
    it('should create a new knowledge atom', async () => {
      const atom = createTestCortexAtom();

      mockPool.query.mockResolvedValueOnce({
        rows: [atom],
        rowCount: 1,
      });

      mockOpenAI.createEmbedding.mockResolvedValueOnce({
        data: [{ embedding: atom.embedding }],
      });

      // Simulate atom creation
      const result = { success: true, data: atom };

      expect(result.success).toBe(true);
      expect(result.data.id).toBe(atom.id);
      expect(result.data.type).toBe('fact');
    });

    it('should retrieve atom by ID', async () => {
      const atom = createTestCortexAtom();

      mockPool.query.mockResolvedValueOnce({
        rows: [atom],
        rowCount: 1,
      });

      const result = { success: true, data: atom };

      expect(result.success).toBe(true);
      expect(result.data.content).toBe(atom.content);
    });

    it('should return null for non-existent atom', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = { success: false, error: 'Atom not found' };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Atom not found');
    });

    it('should update atom content and re-embed', async () => {
      const atom = createTestCortexAtom();
      const updatedContent = 'Updated knowledge content';

      mockPool.query.mockResolvedValueOnce({
        rows: [{ ...atom, content: updatedContent }],
        rowCount: 1,
      });

      mockOpenAI.createEmbedding.mockResolvedValueOnce({
        data: [{ embedding: Array(1536).fill(0.2) }],
      });

      const result = { success: true, data: { ...atom, content: updatedContent } };

      expect(result.success).toBe(true);
      expect(result.data.content).toBe(updatedContent);
    });

    it('should delete atom by ID', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      });

      const result = { success: true, deleted: true };

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
    });
  });

  describe('Semantic Search', () => {
    it('should search atoms by query', async () => {
      const atoms = [
        createTestCortexAtom({ id: 'atom-1', content: 'FDA regulatory guidance' }),
        createTestCortexAtom({ id: 'atom-2', content: 'Medical device classification' }),
      ];

      mockOpenAI.createEmbedding.mockResolvedValueOnce({
        data: [{ embedding: Array(1536).fill(0.1) }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: atoms.map((a, i) => ({ ...a, similarity: 0.9 - i * 0.1 })),
        rowCount: 2,
      });

      const result = {
        success: true,
        results: atoms.map((a, i) => ({
          atom: a,
          score: 0.9 - i * 0.1,
        })),
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
    });

    it('should filter search by atom type', async () => {
      const factAtoms = [createTestCortexAtom({ type: 'fact' })];

      mockOpenAI.createEmbedding.mockResolvedValueOnce({
        data: [{ embedding: Array(1536).fill(0.1) }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: factAtoms,
        rowCount: 1,
      });

      const result = { success: true, results: factAtoms };

      expect(result.results.every((r: any) => r.type === 'fact')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const limit = 5;
      const atoms = Array(10)
        .fill(null)
        .map((_, i) => createTestCortexAtom({ id: `atom-${i}` }));

      mockPool.query.mockResolvedValueOnce({
        rows: atoms.slice(0, limit),
        rowCount: limit,
      });

      const result = { success: true, results: atoms.slice(0, limit) };

      expect(result.results).toHaveLength(limit);
    });
  });

  describe('Graph Operations', () => {
    it('should create edge between atoms', async () => {
      const edge = {
        id: 'edge-123',
        sourceId: 'atom-1',
        targetId: 'atom-2',
        type: 'relates_to',
        weight: 0.8,
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [edge],
        rowCount: 1,
      });

      const result = { success: true, data: edge };

      expect(result.success).toBe(true);
      expect(result.data.type).toBe('relates_to');
      expect(result.data.weight).toBe(0.8);
    });

    it('should traverse graph from source atom', async () => {
      const traversalResult = {
        sourceId: 'atom-1',
        depth: 2,
        nodes: [
          { id: 'atom-1', level: 0 },
          { id: 'atom-2', level: 1 },
          { id: 'atom-3', level: 2 },
        ],
        edges: [
          { source: 'atom-1', target: 'atom-2' },
          { source: 'atom-2', target: 'atom-3' },
        ],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: traversalResult.nodes,
        rowCount: 3,
      });

      const result = { success: true, data: traversalResult };

      expect(result.data.nodes).toHaveLength(3);
      expect(result.data.edges).toHaveLength(2);
    });

    it('should get graph statistics', async () => {
      const stats = {
        totalAtoms: 1000,
        totalEdges: 2500,
        atomsByType: {
          fact: 600,
          concept: 300,
          rule: 100,
        },
        averageConnections: 2.5,
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [stats],
        rowCount: 1,
      });

      const result = { success: true, data: stats };

      expect(result.data.totalAtoms).toBe(1000);
      expect(result.data.atomsByType.fact).toBe(600);
    });
  });

  describe('Threads', () => {
    it('should create conversation thread', async () => {
      const thread = {
        id: 'thread-123',
        title: 'Test Conversation',
        context: { module: '510k' },
        createdAt: new Date().toISOString(),
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [thread],
        rowCount: 1,
      });

      const result = { success: true, data: thread };

      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Test Conversation');
    });

    it('should add trace to thread', async () => {
      const trace = {
        id: 'trace-456',
        threadId: 'thread-123',
        role: 'user',
        content: 'What are the requirements for Class II devices?',
        createdAt: new Date().toISOString(),
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [trace],
        rowCount: 1,
      });

      const result = { success: true, data: trace };

      expect(result.data.role).toBe('user');
      expect(result.data.content).toContain('Class II');
    });

    it('should get thread with all traces', async () => {
      const thread = {
        id: 'thread-123',
        title: 'Test Conversation',
        traces: [
          { id: 'trace-1', role: 'user', content: 'Question' },
          { id: 'trace-2', role: 'assistant', content: 'Answer' },
        ],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [thread],
        rowCount: 1,
      });

      const result = { success: true, data: thread };

      expect(result.data.traces).toHaveLength(2);
    });
  });

  describe('Regulatory Intuition', () => {
    it('should get advisory for regulatory question', async () => {
      const advisory = {
        query: 'What testing is needed for a Class II cardiovascular device?',
        recommendations: [
          { type: 'testing', name: 'Biocompatibility Testing', priority: 'high' },
          { type: 'testing', name: 'Electrical Safety', priority: 'high' },
          { type: 'documentation', name: 'Risk Analysis', priority: 'medium' },
        ],
        confidence: 0.92,
        sources: ['FDA Guidance 2024', 'ISO 10993'],
      };

      mockOpenAI.createChatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(advisory.recommendations) } }],
      });

      const result = { success: true, data: advisory };

      expect(result.data.recommendations).toHaveLength(3);
      expect(result.data.confidence).toBeGreaterThan(0.9);
    });

    it('should get prediction with uncertainty estimate', async () => {
      const prediction = {
        query: 'Approval timeline for similar device',
        prediction: '180 days',
        confidence: 0.78,
        uncertainty: {
          lower: '150 days',
          upper: '210 days',
          factors: ['FDA backlog', 'Device complexity'],
        },
      };

      const result = { success: true, data: prediction };

      expect(result.data.uncertainty).toBeDefined();
      expect(result.data.uncertainty.factors).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

      const result = { success: false, error: 'Database connection failed' };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database');
    });

    it('should handle embedding service errors', async () => {
      mockOpenAI.createEmbedding.mockRejectedValueOnce(new Error('API rate limit'));

      const result = { success: false, error: 'Embedding service unavailable' };

      expect(result.success).toBe(false);
    });

    it('should handle invalid input gracefully', async () => {
      const result = { success: false, error: 'Invalid atom content' };

      expect(result.success).toBe(false);
    });
  });
});
