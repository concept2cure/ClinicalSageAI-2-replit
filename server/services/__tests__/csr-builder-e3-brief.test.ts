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
 * The builder's synopsis (§2.x) and objectives (§8.x) children are its own
 * decomposition, which E3 does not number, so the resolver has nothing for
 * them; they are briefed with their parent heading and told so. A number with
 * no E3 heading at any level is said to be unindexed, never briefed from
 * recall.
 *
 * The AI client is mocked (same pattern as csr-builder-completeness.test.ts),
 * so the assertions read the exact messages the model would have received.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => 'DRAFTED BODY'),
}));
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock },
  default: { complete: completeMock },
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
  ICH_E3_STRUCTURE,
  type CSRSection,
  type CSRBuildRequest,
} from '../csr-builder';
import { renderE3Brief } from '../ind/ctd/csr-e3-guidance';
import { resolveRequirements } from '../ind/ctd/requirements-resolver';

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
  const found = flattenICHE3Sections(ICH_E3_STRUCTURE).find((s) => s.number === number);
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
  it('§12 is drafted against the E3 record, not "per ICH E3 guidelines"', async () => {
    const msg = await draft(section('12'));
    const firstLine = renderE3Brief('12')!.split('\n')[0];
    expect(firstLine).toBe('## ICH E3 §12 Safety Evaluation');
    expect(msg).toContain(firstLine);
    // A bullet from the body of the brief, so a heading alone does not pass.
    const bullet = renderE3Brief('12')!.split('\n').find((l) => l.startsWith('- '));
    expect(bullet).toBeTruthy();
    expect(msg).toContain(bullet);
    expect(msg).not.toContain(RECALL_SENTENCE);
    expect(msg).toMatch(/do not add requirements from memory/i);
  });

  it('§2.3, the builder\'s own synopsis child, is briefed with E3 §2 and told so', async () => {
    const msg = await draft(section('2.3'));
    expect(msg).toContain('## ICH E3 §2 Synopsis');
    expect(msg).toMatch(/ICH E3 does not number §2\.3/);
    expect(msg).not.toContain(RECALL_SENTENCE);
  });

  it('§8.1 is briefed with E3 §8', async () => {
    const msg = await draft(section('8.1'));
    expect(msg).toContain('## ICH E3 §8 Study Objectives');
    expect(msg).not.toContain(RECALL_SENTENCE);
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

  it('falls back to the parent heading for the builder\'s §2.x and §8.x', () => {
    expect(builder.e3RequirementsFor('2.10')?.heading).toBe('2');
    expect(builder.e3RequirementsFor('8.2')?.heading).toBe('8');
  });

  it('every section the builder drafts resolves to an E3 brief', () => {
    const missing = flattenICHE3Sections(ICH_E3_STRUCTURE)
      .map((s) => s.number)
      .filter((n) => builder.e3RequirementsFor(n) === null);
    expect(missing).toEqual([]);
  });

  it('a number E3 does not have at any level resolves to null', () => {
    expect(builder.e3RequirementsFor('99')).toBeNull();
    expect(builder.e3RequirementsFor('99.1')).toBeNull();
  });
});

describe('a section with no E3 heading at any level', () => {
  it('is drafted with an honest "not indexed" line, never a recall instruction', async () => {
    const orphan: CSRSection = { number: '99', title: 'Unknown', required: false, status: 'empty', description: 'none' };
    await draftCSRSectionWithProvenance(orphan, REQUEST);
    const msg = userMessage();
    expect(msg).toMatch(/no ICH E3 requirements indexed for §99/);
    expect(msg).toMatch(/do not supply them from memory/i);
    expect(msg).not.toContain(RECALL_SENTENCE);
    expect(msg).not.toContain('## ICH E3');
  });
});
