import { describe, expect, it } from 'vitest';
import { validateSourceFactBatch, verifySourceFactCandidate } from '../document-catalog-core';
import { heldOutScientificSourceFactFixtures } from './fixtures/scientific-source-facts-heldout';

describe('held-out scientific source/anchor adversaries', () => {
  for (const item of heldOutScientificSourceFactFixtures) {
    it(`${item.id}: ${item.title}`, () => {
      const batch = validateSourceFactBatch([item.candidate]);
      if (item.expected === 'schema_refused') {
        expect(batch.ok, item.rationale).toBe(false);
        return;
      }
      expect(batch.ok, item.rationale).toBe(true);
      if (!batch.ok) throw new Error(`Unexpected invalid held-out fixture: ${item.id}`);
      const result = verifySourceFactCandidate(batch.candidates[0], item.source);
      expect(result.persisted).toBe(false);
      expect(result.reviewState).toBe('not_recorded');
      expect(result.scientificQualification).toBe('unassessed');
      if (item.expected === 'transcription_refused') {
        expect(result.ok, item.rationale).toBe(false);
        expect(result.transcription.state, item.rationale).toBe('failed');
        expect(result.transcription.reasons.length).toBeGreaterThan(0);
        expect(result.context.state).not.toBe('passed');
      } else {
        expect(result.ok, item.rationale).toBe(true);
        expect(result.transcription.state, item.rationale).toBe('passed');
        if (item.expected === 'pass') {
          expect(result.context.state, item.rationale).toBe('passed');
        } else {
          expect(result.context.state, item.rationale).not.toBe('passed');
          if (item.expected === 'not_established') expect(result.context.state, item.rationale).toBe('not_established');
          expect(result.context.reasons.length).toBeGreaterThan(0);
        }
      }
    });
  }
});
