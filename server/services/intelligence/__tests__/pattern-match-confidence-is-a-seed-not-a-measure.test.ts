/**
 * A pattern hit is not reported as a measured confidence (finding 15,
 * 2026-10-15).
 *
 * What the code used to do: scanText reported matchConfidence as the
 * pattern's hand-set seed value — 95 for a substring hit on "we chose" — with
 * nothing saying it was a seed. capturePatternSignals filed that as the RIM
 * signal's confidence; persistPatternRegistry stamped its memory row
 * confidenceScore 1 and nominateCandidatePattern stamped 0.5.
 *
 * matchConfidence itself still carries the seed value: the pre-mortem tools
 * read it as a number (outside this change). The match now says what it is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where']) chain[m] = () => chain;
  chain.limit = async () => h.selectRows.shift() ?? [];
  return {
    db: {
      select: () => chain,
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          h.inserts.push(v);
        },
      }),
    },
  };
});

import {
  nominateCandidatePattern,
  patternRegistry,
  persistPatternRegistry,
} from '../pattern-registry';
import { capturePatternSignals } from '../signal-capture';

const TEXT = 'For the pivotal study we chose overall survival as the endpoint.';

beforeEach(() => {
  h.selectRows = [];
  h.inserts.length = 0;
});

describe('a pattern match', () => {
  it('names the phrase that matched and labels the seed value it carries', () => {
    const [match] = patternRegistry.scanText(TEXT, '2.5');
    expect(match.patternId).toBe('DEF-001');
    expect(match.matchedPhrase).toBe('we chose');
    expect(match.matchConfidenceBasis).toBe('pattern_seed_value');
  });

  it('files no confidence on the RIM signal', () => {
    const matches = patternRegistry.scanText(TEXT, '2.5');
    const signals = capturePatternSignals(71, 72, matches, {
      judgmentFrameworkVersion: 't',
      patternRegistryVersion: 't',
      runId: 'r1',
      runType: 'pattern_scan',
    });
    expect(signals.map(s => [s.patternIds[0], s.confidence])).toEqual([['DEF-001', null]]);
  });
});

describe('registry memory rows', () => {
  it('the registry export carries no confidence (was 1)', async () => {
    h.selectRows = [[{ id: 1, projectId: 2 }]];
    const result = await persistPatternRegistry(73);
    expect(result.success).toBe(true);
    expect(h.inserts.map(v => v.confidenceScore)).toEqual([null]);
  });

  it('a nominated candidate carries no confidence (was 0.5)', async () => {
    h.selectRows = [[{ id: 3 }], []];
    await nominateCandidatePattern({
      organizationId: 74,
      projectId: 75,
      text: 'The stability data is incomplete and does not meet ICH Q1A(R2) requirements for the proposed shelf life of 24 months.',
      sourceContext: 'chat',
    });
    expect(h.inserts.map(v => [v.category, v.confidenceScore])).toEqual([['candidate_learned_pattern', null]]);
  });
});
