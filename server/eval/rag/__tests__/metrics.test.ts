import { describe, it, expect } from 'vitest';
import {
  mean,
  hitAtK,
  recallAtK,
  precisionAtK,
  reciprocalRank,
  answerContainsScore,
  isGroundedRefusal,
  judgeFaithfulness,
} from '../metrics';

describe('rag eval metrics', () => {
  describe('mean', () => {
    it('returns 0 for an empty list', () => {
      expect(mean([])).toBe(0);
    });
    it('averages values', () => {
      expect(mean([1, 0, 0.5])).toBeCloseTo(0.5);
    });
  });

  describe('hitAtK', () => {
    it('is 1 when an expected id is within top-k', () => {
      expect(hitAtK(['a', 'b', 'c'], ['c'], 3)).toBe(1);
    });
    it('is 0 when the expected id is below the cutoff', () => {
      expect(hitAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0);
    });
    it('is 0 when there are no expected ids', () => {
      expect(hitAtK(['a', 'b'], [], 5)).toBe(0);
    });
  });

  describe('recallAtK', () => {
    it('is the fraction of expected ids found in top-k', () => {
      expect(recallAtK(['a', 'b', 'c'], ['a', 'c', 'z'], 3)).toBeCloseTo(2 / 3);
    });
    it('respects the k cutoff', () => {
      expect(recallAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0);
    });
  });

  describe('precisionAtK', () => {
    it('is the fraction of top-k that are relevant', () => {
      expect(precisionAtK(['a', 'b', 'c', 'd'], ['a', 'c'], 4)).toBeCloseTo(0.5);
    });
    it('is 0 for k <= 0', () => {
      expect(precisionAtK(['a'], ['a'], 0)).toBe(0);
    });
  });

  describe('reciprocalRank', () => {
    it('is 1 when the first result is relevant', () => {
      expect(reciprocalRank(['a', 'b'], ['a'])).toBe(1);
    });
    it('is 1/rank of the first relevant result', () => {
      expect(reciprocalRank(['x', 'y', 'a'], ['a'])).toBeCloseTo(1 / 3);
    });
    it('is 0 when nothing relevant is retrieved', () => {
      expect(reciprocalRank(['x', 'y'], ['a'])).toBe(0);
    });
  });

  describe('answerContainsScore', () => {
    it('scores the fraction of expected substrings present, case-insensitively', () => {
      const answer = 'Long-term storage at 25C and 60% RH.';
      expect(answerContainsScore(answer, ['25', '60%', 'long-term'])).toBe(1);
      expect(answerContainsScore(answer, ['25', 'missing'])).toBeCloseTo(0.5);
    });
    it('is 0 when no expected substrings are given', () => {
      expect(answerContainsScore('anything', [])).toBe(0);
    });
  });

  describe('isGroundedRefusal', () => {
    it('detects the pipeline refusal phrasing', () => {
      expect(
        isGroundedRefusal('I could not find relevant information in the knowledge base.')
      ).toBe(true);
    });
    it('is false for a substantive answer', () => {
      expect(isGroundedRefusal('The IND must contain a protocol and an investigator brochure.')).toBe(
        false
      );
    });
  });

  describe('judgeFaithfulness', () => {
    it('parses a bare numeric judge response and clamps to [0,1]', async () => {
      expect(await judgeFaithfulness(async () => '0.8', 'q', 'a', ['s'])).toBeCloseTo(0.8);
      expect(await judgeFaithfulness(async () => 'Score: 1.0', 'q', 'a', ['s'])).toBe(1);
      expect(await judgeFaithfulness(async () => '5', 'q', 'a', ['s'])).toBe(1);
    });
    it('returns 0 when the judge emits no number', async () => {
      expect(await judgeFaithfulness(async () => 'no idea', 'q', 'a', ['s'])).toBe(0);
    });
  });
});
