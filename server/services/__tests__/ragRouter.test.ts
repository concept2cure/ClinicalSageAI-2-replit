import { describe, it, expect } from 'vitest';
import { optionsForIntent } from '../ragRouter';

/**
 * The router's value is its policy layer: intent picks defaults, explicit params
 * override. These tests lock that merge down (notably that an explicit `false`
 * overrides a default `true` — i.e. the merge keys on `!== undefined`, not truthiness).
 */
describe('ragRouter optionsForIntent', () => {
  describe('intent defaults', () => {
    it('regulatory_qa (and default) uses advanced + rerank + mmr at lambda 0.7', () => {
      const o = optionsForIntent({ query: 'q', intent: 'regulatory_qa' });
      expect(o.strategy).toBe('advanced');
      expect(o.useReranking).toBe(true);
      expect(o.useMmr).toBe(true);
      expect(o.mmrLambda).toBe(0.7);
      expect(o.limit).toBe(5);
    });

    it('falls back to regulatory_qa policy when intent is omitted', () => {
      expect(optionsForIntent({ query: 'q' }).mmrLambda).toBe(0.7);
    });

    it('project_scoped favours precision (lambda 0.8)', () => {
      expect(optionsForIntent({ query: 'q', intent: 'project_scoped' }).mmrLambda).toBe(0.8);
    });

    it('foresight favours diversity (lambda 0.6)', () => {
      expect(optionsForIntent({ query: 'q', intent: 'foresight' }).mmrLambda).toBe(0.6);
    });
  });

  describe('explicit overrides', () => {
    it('an explicit false overrides a default true (not truthiness-based)', () => {
      const o = optionsForIntent({ query: 'q', intent: 'regulatory_qa', useMmr: false });
      expect(o.useMmr).toBe(false);
    });

    it('overrides strategy, mmrLambda, and limit', () => {
      const o = optionsForIntent({
        query: 'q',
        intent: 'project_scoped',
        strategy: 'basic',
        mmrLambda: 0.7,
        limit: 12,
      });
      expect(o.strategy).toBe('basic');
      expect(o.mmrLambda).toBe(0.7);
      expect(o.limit).toBe(12);
    });

    it('passes through scope, threshold, filters, persistCitations', () => {
      const artifactScope = { projectId: 42, organizationUuid: 'org-uuid' };
      const o = optionsForIntent({
        query: 'q',
        intent: 'project_scoped',
        organizationUuid: 'org-uuid',
        artifactScope,
        threshold: 0.6,
        persistCitations: true,
        filters: { atomType: 'study' },
      });
      expect(o.organizationUuid).toBe('org-uuid');
      expect(o.artifactScope).toEqual(artifactScope);
      expect(o.threshold).toBe(0.6);
      expect(o.persistCitations).toBe(true);
      expect(o.filters).toEqual({ atomType: 'study' });
    });

    it('leaves threshold undefined when not provided (pipeline default applies)', () => {
      expect(optionsForIntent({ query: 'q' }).threshold).toBeUndefined();
    });
  });

  describe('corpus selection', () => {
    it('defaults corpus to undefined (pipeline reads the vault)', () => {
      const o = optionsForIntent({ query: 'q' });
      expect(o.corpus).toBeUndefined();
      expect(o.organizationId).toBeUndefined();
    });

    it('passes through corpus rag_chunks + integer organizationId', () => {
      const o = optionsForIntent({
        query: 'q',
        corpus: 'rag_chunks',
        organizationId: 7,
      });
      expect(o.corpus).toBe('rag_chunks');
      expect(o.organizationId).toBe(7);
    });

    it('passes through the client_memory corpus + memoryScope', () => {
      const o = optionsForIntent({
        query: 'q',
        corpus: 'client_memory',
        organizationId: 3,
        memoryScope: { profileId: 11, category: 'regulatory' },
      });
      expect(o.corpus).toBe('client_memory');
      expect(o.organizationId).toBe(3);
      expect(o.memoryScope).toEqual({ profileId: 11, category: 'regulatory' });
    });

    it('passes through the project_memory corpus + project scope', () => {
      const o = optionsForIntent({
        query: 'q',
        corpus: 'project_memory',
        organizationId: 3,
        memoryScope: { projectId: 99, projectProfileId: 5 },
      });
      expect(o.corpus).toBe('project_memory');
      expect(o.memoryScope).toEqual({ projectId: 99, projectProfileId: 5 });
    });

    it('the memory shims invoke a pure-similarity policy (basic, rerank/mmr/compression off)', () => {
      // This is the exact option shape the memory shims pass so the document
      // reranker never runs on memory atoms — ranking stays similarity-pure.
      const o = optionsForIntent({
        query: 'q',
        corpus: 'client_memory',
        organizationId: 3,
        threshold: 0.65,
        strategy: 'basic',
        useReranking: false,
        useMmr: false,
        useCompression: false,
        memoryScope: { profileId: null },
      });
      expect(o.strategy).toBe('basic');
      expect(o.useReranking).toBe(false);
      expect(o.useMmr).toBe(false);
      expect(o.useCompression).toBe(false);
      expect(o.threshold).toBe(0.65);
    });
  });
});
