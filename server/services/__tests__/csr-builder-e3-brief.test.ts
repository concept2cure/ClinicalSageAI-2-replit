/**
 * The CSR builder drafts every section against what ICH E3 says it contains.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * Both CSR drafting paths — draftCSRSectionWithProvenance (the job runner) and
 * draftCSRSection → generateSectionWithAI (the on-demand route) — told the
 * model only "Include all required elements per ICH E3 guidelines". What those
 * elements are came from the model's memory of E3, although the platform holds
 * E3 heading by heading (server/services/ind/ctd/csr-e3-guidance.ts) and
 * answers "what must this section contain" through one resolver
 * (server/services/ind/ctd/requirements-resolver.ts). D2 finding 74(c),
 * 2026-10-05.
 *
 * Since 2026-10-29 every heading the builder drafts is an ICH_E3_GUIDANCE
 * heading (its own §2.x/§8.x decomposition was deleted with ICH_E3_STRUCTURE),
 * so each is briefed with exactly its own E3 record. A number that is not a
 * drafting target — no E3 heading, a bare parent, or a manual §3/§14–16 — is
 * refused before any model call.
 *
 * The AI client is mocked (same pattern as csr-builder-completeness.test.ts),
 * so the assertions read the exact messages the model would have received.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => 'DRAFTED BODY'),
}));
// The provenance drafter reads the gateway's full reply (content + served model).
const chat = async (messages: unknown, options?: unknown) => ({ content: await completeMock(messages, options), model: 'test-model' });
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock, chat },
  default: { complete: completeMock, chat },
}));
vi.mock('../usage-metering.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
  recordUsage: vi.fn(async () => undefined),
}));

import * as builder from '../csr-builder';
import {
  draftCSRSection,
  draftCSRSectionWithProvenance,
  flattenICHE3Sections,
  getICHE3Structure,
  resolveCSRDraftTargets,
  type CSRSection,
  type CSRBuildRequest,
} from '../csr-builder';
import { renderE3Brief } from '../ind/ctd/csr-e3-guidance';
import { resolveRequirements } from '../ind/ctd/requirements-resolver';
import { buildCsrAuthoringEvidence } from '../csr/cortex-authoring-context';

const STUDY: CSRBuildRequest['studyInfo'] = {
  title: 'A Study of Drug X',
  protocolNumber: 'PROTO-001',
  phase: 'Phase 3',
  indication: 'Type 2 Diabetes',
  sponsor: 'Acme Pharma',
  investigationalProduct: 'Drug X',
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'change in HbA1c from baseline',
};
const REQUEST: CSRBuildRequest = { organizationId: 1, userId: 1, studyInfo: STUDY };

const RECALL_SENTENCE = 'per ICH E3 guidelines';

function section(number: string): CSRSection {
  const found = flattenICHE3Sections(getICHE3Structure()).find((s) => s.number === number);
  if (!found) throw new Error(`builder has no section ${number}`);
  return found;
}

/** The user message of the one ai.complete call made so far. */
function userMessage(): string {
  expect(completeMock).toHaveBeenCalledTimes(1);
  const messages = completeMock.mock.calls[0][0] as Array<{ role: string; content: string }>;
  const user = messages.filter((m) => m.role === 'user');
  expect(user).toHaveLength(1);
  return user[0].content;
}

/** Both drafting paths, each yielding the user message it sent. */
const PATHS: Array<[string, (s: CSRSection) => Promise<string>]> = [
  ['draftCSRSectionWithProvenance (job runner)', async (s) => {
    await draftCSRSectionWithProvenance(s, REQUEST);
    return userMessage();
  }],
  ['draftCSRSection → generateSectionWithAI (on-demand route)', async (s) => {
    await draftCSRSection(s.number, STUDY);
    return userMessage();
  }],
];

beforeEach(() => {
  completeMock.mockClear();
});

describe.each(PATHS)('%s', (_label, draft) => {
  it('§9.1 is drafted against the E3 record, not "per ICH E3 guidelines"', async () => {
    const msg = await draft(section('9.1'));
    const firstLine = renderE3Brief('9.1')!.split('\n')[0];
    expect(firstLine).toBe('## ICH E3 §9.1 Overall Study Design and Plan — Description');
    expect(msg).toContain(firstLine);
    // A bullet from the body of the brief, so a heading alone does not pass.
    const bullet = renderE3Brief('9.1')!.split('\n').find((l) => l.startsWith('- '));
    expect(bullet).toBeTruthy();
    expect(msg).toContain(bullet);
    expect(msg).not.toContain(RECALL_SENTENCE);
    expect(msg).toMatch(/do not add requirements from memory/i);
  });

  it('§8, study objectives, is briefed with E3 §8 itself — E3 numbers no objectives children', async () => {
    const msg = await draft(section('8'));
    expect(msg).toContain('## ICH E3 §8 Study Objectives');
    expect(msg).not.toMatch(/does not number/);
    expect(msg).not.toContain(RECALL_SENTENCE);
  });

  it('a detailed statistical-plan heading is briefed with its own E3 record', async () => {
    const msg = await draft(section('9.7.1'));
    expect(msg).toContain(renderE3Brief('9.7.1')!.split('\n')[0]);
  });
});

describe('result messages use an actual canonical retained evidence pack', () => {
  it.each(['12.6', '2', '12.2.1'])('§%s preserves its own E3 brief and quotes its source at user priority', async number => {
    const programId = '11111111-1111-4111-8111-111111111111';
    const runId = '22222222-2222-4222-8222-222222222222';
    const evidence = buildCsrAuthoringEvidence({
      programId, runId, historical: true, releaseEligibilityVerified: false,
      studies: [{ source: { documentId: '33333333-3333-4333-8333-333333333333', version: '1', sha256: 'a'.repeat(64),
        studyId: 'STUDY-ALPHA', protocolNumber: STUDY.protocolNumber, dataCutDate: '2026-10-01', clinicalVerification: 'not-established' },
      tables: { analysisPopulations: { title: 'Recorded analysis populations', headers: ['Analysis set', 'Recorded count'], rows: [['Full analysis set', '120']] } } }],
    }, { programId, runId, studyId: 'STUDY-ALPHA', sectionNumber: number });
    const result = await draftCSRSectionWithProvenance(section(number), REQUEST, undefined, evidence);
    expect(result.source).toBe('ai');
    expect(completeMock).toHaveBeenCalledTimes(1);
    const messages = completeMock.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const users = messages.filter(message => message.role === 'user');
    expect(users).toHaveLength(2);
    expect(users[0].content).toContain(renderE3Brief(number)!.split('\n')[0]);
    expect(users[0].content).not.toContain(RECALL_SENTENCE);
    expect(users[0].content).toMatch(/do not add requirements from memory/i);
    expect(JSON.parse(users[1].content)).toMatchObject({ type: 'retained_csr_evidence', evidence: { evidenceDigest: evidence.evidenceDigest } });
    expect(messages.filter(message => message.role === 'system').map(message => message.content).join('\n')).not.toContain(evidence.evidenceDigest);
  });
});

describe('e3RequirementsFor', () => {
  it('is the resolver\'s answer for an E3 heading — one source, not a second rendering', () => {
    const answer = resolveRequirements({ document: 'csr', section: '9.1' });
    expect(answer.kind).toBe('answer');
    expect(builder.e3RequirementsFor('9.1')).toEqual({
      requirements: (answer as { requirements: string }).requirements,
      heading: '9.1',
    });
  });

  it('has no parent fallback: the deleted §2.x and §8.x children resolve to nothing', () => {
    expect(builder.e3RequirementsFor('2.10')).toBeNull();
    expect(builder.e3RequirementsFor('8.2')).toBeNull();
  });

  it('every section the builder drafts resolves to its own E3 brief', () => {
    const missing = resolveCSRDraftTargets()
      .map((s) => s.number)
      .filter((n) => builder.e3RequirementsFor(n) === null);
    expect(missing).toEqual([]);
  });

  it('a number E3 does not have at any level resolves to null', () => {
    expect(builder.e3RequirementsFor('99')).toBeNull();
    expect(builder.e3RequirementsFor('99.1')).toBeNull();
  });
});

describe('a number that is not a drafting target', () => {
  it.each(['99', '12', '3', '16.2.7'])('§%s is refused before any model call', async (n) => {
    const node: CSRSection = { number: n, title: 'X', required: false, status: 'empty', description: 'none', draftingMode: 'narrative' };
    await expect(draftCSRSectionWithProvenance(node, REQUEST)).rejects.toThrow('CSR_SECTION_NOT_DRAFTABLE');
    const onDemand = await draftCSRSection(n, STUDY);
    expect(onDemand).toEqual({ content: '', isAI: false });
    expect(completeMock).not.toHaveBeenCalled();
  });
});
