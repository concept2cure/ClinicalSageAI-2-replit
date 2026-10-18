import { describe, expect, it } from 'vitest';
import { validateSourceFactBatch, verifySourceFactCandidate } from '../document-catalog-core';
import { scientificSourceFactFixtures } from './fixtures/scientific-source-facts';

describe('independent scientific source-statement corpus', () => {
  for (const item of scientificSourceFactFixtures) {
    it(`${item.id}: ${item.title}`, () => {
      const batch = validateSourceFactBatch([item.candidate]);
      if (item.expected === 'schema_refused') {
        expect(batch.ok, item.rationale).toBe(false);
        return;
      }
      expect(batch.ok, item.rationale).toBe(true);
      if (!batch.ok) throw new Error(`Unexpected invalid fixture: ${item.id}`);
      const result = verifySourceFactCandidate(batch.candidates[0], item.source);
      expect(result.persisted).toBe(false);
      expect(result.reviewState).toBe('not_recorded');
      expect(result.scientificQualification).toBe('unassessed');
      expect(result.source).toEqual({ documentId: item.source.documentId, contentHash: item.source.contentHash, extractedTextSha256: item.source.extractedTextSha256 });
      expect(result.checkerRevision).toMatch(/\S/);

      if (item.expected === 'transcription_refused') {
        expect(result.ok, item.rationale).toBe(false);
        expect(result.transcription.state, item.rationale).toBe('failed');
        expect(result.transcription.reasons.length).toBeGreaterThan(0);
        expect(result.context.state).not.toBe('passed');
        return;
      }

      expect(result.ok, item.rationale).toBe(true);
      expect(result.transcription.state, item.rationale).toBe('passed');
      expect(result.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
      if (item.expected === 'pass') {
        expect(result.context.state, item.rationale).toBe('passed');
      } else if (item.expected === 'not_established') {
        expect(result.context.state, item.rationale).toBe('not_established');
        expect(result.context.reasons.length).toBeGreaterThan(0);
      } else {
        expect(['failed', 'not_established'], item.rationale).toContain(result.context.state);
        expect(result.context.reasons.length).toBeGreaterThan(0);
      }
    });
  }
});
