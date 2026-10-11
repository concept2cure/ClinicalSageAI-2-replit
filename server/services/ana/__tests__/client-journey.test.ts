/**
 * Tests — client onboarding journey: pure stage resolution across the
 * license→submission lifecycle, per-stage guidance (each offer tied to a real
 * capability), and the get_client_journey tool wiring (definition, handler,
 * transparency label, deterministic pedigree). No DB touched.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';

import {
  resolveClientJourneyStage,
  describeClientJourney,
  buildClientJourneyPromptBlock,
  getClientJourney,
  SUBMISSION_READY_THRESHOLD,
  FRESH_LICENSE_DAYS,
  type ClientJourneySignals,
  type ClientJourneyStage,
} from '../client-journey.js';
import { getAllEnabledTools } from '../AnaToolDefinitions.js';
import { getToolHandler } from '../AnaToolExecutor.js';
import { describeToolPlan } from '../agentic-loop.js';
import { getToolPedigree } from '../tool-pedigree.js';

const sig = (over: Partial<ClientJourneySignals>): ClientJourneySignals => ({
  projectCount: 0,
  artifactCount: 0,
  advancedArtifactCount: 0,
  maxReadiness: null,
  submittedCount: 0,
  orgAgeDays: null,
  ...over,
});

describe('resolveClientJourneyStage — license → submission', () => {
  it('a brand-new license with nothing yet lands on just_licensed', () => {
    expect(resolveClientJourneyStage(sig({ orgAgeDays: 0 }))).toBe('just_licensed');
    expect(resolveClientJourneyStage(sig({}))).toBe('just_licensed'); // unknown age = fresh
  });

  it('an older org that still made no project is nudged into onboarding', () => {
    expect(resolveClientJourneyStage(sig({ orgAgeDays: FRESH_LICENSE_DAYS + 5 }))).toBe('onboarding');
  });

  it('a project with no content is project_started', () => {
    expect(resolveClientJourneyStage(sig({ projectCount: 1, orgAgeDays: 30 }))).toBe('project_started');
  });

  it('draft artifacts mean authoring', () => {
    expect(resolveClientJourneyStage(sig({ projectCount: 1, artifactCount: 4 }))).toBe('authoring');
  });

  it('advanced (review/approved) artifacts mean in_review', () => {
    expect(
      resolveClientJourneyStage(sig({ projectCount: 1, artifactCount: 8, advancedArtifactCount: 3 })),
    ).toBe('in_review');
  });

  it('high readiness means submission_ready', () => {
    expect(
      resolveClientJourneyStage(
        sig({ projectCount: 1, artifactCount: 10, advancedArtifactCount: 6, maxReadiness: SUBMISSION_READY_THRESHOLD }),
      ),
    ).toBe('submission_ready');
  });

  it('a transmitted submission always wins — submitted', () => {
    // Even mid-authoring signals never mask a real transmit.
    expect(
      resolveClientJourneyStage(
        sig({ projectCount: 2, artifactCount: 10, advancedArtifactCount: 4, maxReadiness: 40, submittedCount: 1 }),
      ),
    ).toBe('submitted');
  });

  it('is monotonic along the happy path', () => {
    const order: ClientJourneyStage[] = [
      'just_licensed',
      'project_started',
      'authoring',
      'in_review',
      'submission_ready',
      'submitted',
    ];
    const stages = [
      resolveClientJourneyStage(sig({ orgAgeDays: 0 })),
      resolveClientJourneyStage(sig({ projectCount: 1, orgAgeDays: 30 })),
      resolveClientJourneyStage(sig({ projectCount: 1, artifactCount: 2 })),
      resolveClientJourneyStage(sig({ projectCount: 1, artifactCount: 5, advancedArtifactCount: 1 })),
      resolveClientJourneyStage(sig({ projectCount: 1, artifactCount: 9, advancedArtifactCount: 5, maxReadiness: 90 })),
      resolveClientJourneyStage(sig({ submittedCount: 1 })),
    ];
    expect(stages).toEqual(order);
  });
});

describe('describeClientJourney — guidance tied to real capabilities', () => {
  it('welcome stages point at the onboarding questionnaire', () => {
    for (const stage of ['just_licensed', 'onboarding'] as const) {
      const j = describeClientJourney(stage);
      expect(j.anaOffer).toContain('start_intelligence_flow');
      expect(j.anaOffer).toContain('project_setup');
      expect(j.nextMilestone.length).toBeGreaterThan(0);
    }
  });

  it('authoring offers the drafting council', () => {
    expect(describeClientJourney('authoring').anaOffer).toContain('convene_drafting_council');
  });

  it('submission_ready is about pre-flight + transmittal', () => {
    const j = describeClientJourney('submission_ready', { signals: { maxReadiness: 88 } });
    expect(j.anaOffer.toLowerCase()).toContain('pre-flight');
    expect(j.whereYouAre).toContain('88%');
  });

  it('tailors the welcome framing to the segment', () => {
    expect(describeClientJourney('just_licensed', { segment: 'mdx' }).anaOffer).toContain('devices');
    expect(describeClientJourney('just_licensed', { segment: 'biotech' }).anaOffer).toContain('biologics');
  });

  it('carries the resolved stage + signals for transparency', () => {
    const j = describeClientJourney('authoring', { signals: { artifactCount: 3 } });
    expect(j.stage).toBe('authoring');
    expect(j.signals.artifactCount).toBe(3);
    expect(j.whereYouAre).toContain('3 artifacts');
  });

  it('honors the tone floor (no exclamation marks, no emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const stages: ClientJourneyStage[] = [
      'just_licensed', 'onboarding', 'project_started', 'authoring', 'in_review', 'submission_ready', 'submitted',
    ];
    for (const s of stages) {
      const j = describeClientJourney(s, { segment: 'pharma', signals: { artifactCount: 2, maxReadiness: 85, projectCount: 1 } });
      const text = [j.label, j.whereYouAre, j.nextMilestone, j.anaOffer].join(' ');
      expect(text).not.toContain('!');
      expect(text).not.toMatch(emoji);
    }
  });
});

describe('buildClientJourneyPromptBlock — proactive greeting block', () => {
  it('carries the stage, situation, milestone, and the offer, and tells AnA to lead with it', () => {
    const journey = describeClientJourney('authoring', { signals: { artifactCount: 4 } });
    const block = buildClientJourneyPromptBlock(journey);
    expect(block).toContain('journey (license → submission)');
    expect(block).toContain('`authoring`');
    expect(block).toContain(journey.whereYouAre);
    expect(block).toContain(journey.nextMilestone);
    expect(block).toContain('Lead with this');
    expect(block).toContain(journey.anaOffer);
  });

  it('honors the tone floor (no exclamation marks, no emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const stage of ['just_licensed', 'submission_ready', 'submitted'] as const) {
      const block = buildClientJourneyPromptBlock(describeClientJourney(stage, { segment: 'mdx' }));
      expect(block).not.toContain('!');
      expect(block).not.toMatch(emoji);
    }
  });
});

describe('get_client_journey — tool wiring', () => {
  it('is a registered tool that needs no input', () => {
    const tool = getAllEnabledTools().find(t => t.name === 'get_client_journey') as any;
    expect(tool).toBeDefined();
    expect(tool.input_schema.required).toEqual([]);
    expect(tool.description).toMatch(/where do i start|where does my program stand/i);
  });

  it('has a handler that orients an anonymous (no-org) caller without a DB', async () => {
    const handler = getToolHandler('get_client_journey')!;
    const result = JSON.parse(await handler({ segment: 'biotech' }, {}));
    expect(result.stage).toBe('just_licensed');
    expect(result.anaOffer).toContain('project_setup');
    expect(result.segment).toBe('biotech');
  });

  it('ignores an invalid segment hint', async () => {
    const handler = getToolHandler('get_client_journey')!;
    const result = JSON.parse(await handler({ segment: 'nonsense' }, {}));
    expect(result.segment).toBeNull();
  });

  it('gets a calm transparency label', () => {
    const [step] = describeToolPlan([{ id: '1', name: 'get_client_journey', input: {} }]);
    // From its register entry (ANA-SUMMARY S3).
    expect(step.label).toBe('Looking up where you are in your journey');
  });

  it('classifies as deterministic_query (a reproducible read over live state)', () => {
    expect(getToolPedigree('get_client_journey').pedigree).toBe('deterministic_query');
  });
});

type Rows = { rows: Array<Record<string, unknown>> };
const healthy: Rows[] = [
    { rows: [{ c: 2 }] },
    { rows: [{ total: 6, advanced: 3 }] },
    { rows: [{ c: 0 }] },
    { rows: [{ days: '12.5' }] },
];
const expectedSignals = {
    projectCount: 2, artifactCount: 6, advancedArtifactCount: 3,
    submittedCount: 0, orgAgeDays: 12.5, maxReadiness: null,
};
const clientFor = (query: ReturnType<typeof vi.fn>) => ({ query }) as unknown as Pool;

describe('live client-journey reads overlap without changing their meaning', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('admits all four tenant-scoped reads before any settles and accepts out-of-order completion', async () => {
    const reads = healthy.map(value => {
      let resolve!: (rows: Rows) => void;
      const promise = new Promise<Rows>(r => { resolve = r; });
      return { promise, resolve, value };
    });
    let index = 0;
    const query = vi.fn((_sql: string, _values: number[]) => reads[index++].promise);
    const settled = vi.fn();
    const pending = getClientJourney(clientFor(query), 7, { segment: 'pharma' }).then(settled);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(query).toHaveBeenCalledTimes(4);
      expect(query.mock.calls.map(call => call[1])).toEqual([[7], [7], [7], [7]]);
      reads[3].resolve(reads[3].value);
      reads[2].resolve(reads[2].value);
      reads[1].resolve(reads[1].value);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      reads[0].resolve(reads[0].value);
      await pending;
      const journey = settled.mock.calls[0][0];
      expect(journey).toEqual(describeClientJourney('in_review', { segment: 'pharma', signals: expectedSignals }));
    } finally {
      reads.forEach(read => read.resolve(read.value));
      await pending;
    }
  });

  it('finishes four 750ms pooled reads after one wait instead of four', async () => {
    let index = 0;
    const query = vi.fn(() => {
      const value = healthy[index++];
      return new Promise<Rows>(resolve => setTimeout(() => resolve(value), 750));
    });
    const settled = vi.fn();
    const pending = getClientJourney(clientFor(query), 7).then(settled);
    try {
      await vi.advanceTimersByTimeAsync(749);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledTimes(1);
      expect(settled.mock.calls[0][0].signals).toEqual(expectedSignals);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await vi.advanceTimersByTimeAsync(3000);
      await pending;
    }
  });
});

describe('live client-journey reads preserve signal meaning', () => {
  it('preserves segment and precomputed readiness without adding a query', async () => {
    let index = 0;
    const query = vi.fn(async () => healthy[index++]);
    const journey = await getClientJourney(clientFor(query), 7, { segment: 'mdx', maxReadiness: 90 });
    expect(query).toHaveBeenCalledTimes(4);
    expect(journey).toEqual(describeClientJourney('submission_ready', {
      segment: 'mdx', signals: { ...expectedSignals, maxReadiness: 90 },
    }));
  });

  it.each([0, 1, 2, 3])('keeps healthy signal values when read %s rejects', async failedIndex => {
    let index = 0;
    const query = vi.fn(async () => {
      const current = index++;
      if (current === failedIndex) throw new Error('read failed');
      return current === 2 ? { rows: [{ c: 1 }] } : healthy[current];
    });
    const journey = await getClientJourney(clientFor(query), 7);
    const expected: ClientJourneySignals = { ...expectedSignals, submittedCount: 1 };
    if (failedIndex === 0) expected.projectCount = 0;
    if (failedIndex === 1) { expected.artifactCount = 0; expected.advancedArtifactCount = 0; }
    if (failedIndex === 2) expected.submittedCount = 0;
    if (failedIndex === 3) expected.orgAgeDays = null;
    expect(query).toHaveBeenCalledTimes(4);
    expect(journey.signals).toEqual(expected);
    expect(journey.stage).toBe(resolveClientJourneyStage(expected));
  });

  it.each(['throw', 'reject'] as const)('retains defaults and completes every read when all queries %s', async failure => {
    const query = vi.fn(() => {
      if (failure === 'throw') throw new Error('query threw');
      return Promise.reject(new Error('query rejected'));
    });
    const journey = await getClientJourney(clientFor(query), 7);
    expect(query).toHaveBeenCalledTimes(4);
    expect(journey).toEqual(describeClientJourney('just_licensed', { signals: sig({}) }));
  });

  it('preserves empty rows and clamps a negative organization age', async () => {
    let index = 0;
    const query = vi.fn(async () => ++index === 4 ? { rows: [{ days: '-2' }] } : { rows: [] });
    const journey = await getClientJourney(clientFor(query), 7);
    expect(journey.signals).toEqual(sig({ orgAgeDays: 0 }));
    expect(journey.stage).toBe('just_licensed');
  });

  it('keeps concurrent tenant calls separate and reads again on later calls', async () => {
    const query = vi.fn(async (_sql: string, values: number[]) => {
      const org = values[0];
      if (_sql.includes('FROM projects')) return { rows: [{ c: org }] };
      if (_sql.includes('FROM concept2cure_artifacts')) return { rows: [{ total: org, advanced: 0 }] };
      if (_sql.includes('FROM audit_logs')) return { rows: [{ c: org === 8 ? 1 : 0 }] };
      return { rows: [{ days: 10 }] };
    });
    const client = clientFor(query);
    const [a, b] = await Promise.all([getClientJourney(client, 7), getClientJourney(client, 8)]);
    expect(a.signals.projectCount).toBe(7);
    expect(a.stage).toBe('authoring');
    expect(b.signals.projectCount).toBe(8);
    expect(b.stage).toBe('submitted');
    expect(query.mock.calls.filter(call => call[1][0] === 7)).toHaveLength(4);
    expect(query.mock.calls.filter(call => call[1][0] === 8)).toHaveLength(4);
    await getClientJourney(client, 7);
    expect(query).toHaveBeenCalledTimes(12);
  });
});
