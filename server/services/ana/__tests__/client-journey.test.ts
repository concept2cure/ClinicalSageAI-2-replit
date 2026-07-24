/**
 * Tests — client onboarding journey: pure stage resolution across the
 * license→submission lifecycle, per-stage guidance (each offer tied to a real
 * capability), and the get_client_journey tool wiring (definition, handler,
 * transparency label, deterministic pedigree). No DB touched.
 */

import { describe, it, expect } from 'vitest';

import {
  resolveClientJourneyStage,
  describeClientJourney,
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
    expect(step.label).toBe('Getting your bearings — from license to submission');
  });

  it('classifies as deterministic_query (a reproducible read over live state)', () => {
    expect(getToolPedigree('get_client_journey').pedigree).toBe('deterministic_query');
  });
});
