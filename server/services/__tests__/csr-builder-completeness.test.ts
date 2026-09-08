/**
 * CSR builder — data-completeness / status reporting.
 *
 * Regression coverage for the bug where a CSR whose sections are still full
 * of unresolved data placeholders ([DATA TO BE INSERTED], [N], [value], ...)
 * was reported `status: 'complete'`, `progress: 100` — because
 * `generateCSRSections` derived a section's status from "is content
 * non-empty?" rather than "is content numerically complete?", and
 * `launchCSRBuild` unconditionally returned `status: 'complete',
 * progress: 100` regardless of section content.
 *
 * A downstream consumer that gates export/submission on job status would
 * treat a numerically-empty CSR as filing-ready. These tests assert the
 * fixed, fail-closed behavior: a section with residual placeholders is
 * 'needs_data' (never 'drafted'), and a job with any such section is
 * 'needs_data' / progress < 100 (never 'complete' / 100). They fail against
 * the old unconditional `status: 'complete', progress: 100`.
 *
 * The AI gateway is mocked (mirroring server/services/authoring/__tests__/
 * ib-builder.test.ts's approach for the same dynamic-import-of-unified-ai-
 * client pattern used by csr-builder.ts) so drafting runs offline and its
 * output is fully controlled by the test, not a live model. The quota /
 * usage-metering envelope is mocked so the test never touches a real DB.
 *
 * Note on `sectionsToGenerate`: the existing (unmodified) filter in
 * `generateCSRSections` skips a whole top-level entry — including its
 * children — when the *parent's* number is not itself in the filter list.
 * Tests below that use `sectionsToGenerate` therefore restrict to
 * top-level, childless section numbers (e.g. '1', '5', '7') so the filter
 * behaves simply; tests that need a nested section (e.g. '11.4', '12.3')
 * run a full, unfiltered build instead. This is a pre-existing quirk of the
 * filter, out of scope for this fix, and is worked around rather than
 * exercised here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the unified AI client BEFORE importing csr-builder ────────────────
// csr-builder.ts does `await import('../lib/unified-ai-client.js')` at
// module load (top-level await), so the mock must be registered first via
// vi.hoisted so `completeMock` exists when the hoisted vi.mock factory runs.
const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => ''),
}));
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock },
  default: { complete: completeMock },
}));

// ── Mock quota/usage-metering so launchCSRBuild never touches a real DB ────
const { checkQuotaMock, recordUsageMock } = vi.hoisted(() => ({
  checkQuotaMock: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
  recordUsageMock: vi.fn(async () => undefined),
}));
vi.mock('../usage-metering.js', () => ({
  checkQuota: checkQuotaMock,
  recordUsage: recordUsageMock,
}));

import {
  launchCSRBuild,
  generateCSRSections,
  hasUnresolvedPlaceholders,
  flattenICHE3Sections,
  ICH_E3_STRUCTURE,
  type CSRSection,
  type CSRBuildRequest,
} from '../csr-builder';

function makeRequest(overrides: Partial<CSRBuildRequest> = {}): CSRBuildRequest {
  return {
    organizationId: 1,
    userId: 1,
    studyInfo: {
      title: 'A Study of Drug X',
      protocolNumber: 'PROTO-001',
      phase: 'Phase 3',
      indication: 'Type 2 Diabetes',
      sponsor: 'Acme Pharma',
      investigationalProduct: 'Drug X',
      studyDesign: 'randomized, double-blind, placebo-controlled',
      primaryEndpoint: 'change in HbA1c from baseline',
    },
    ...overrides,
  };
}

beforeEach(() => {
  completeMock.mockReset();
  checkQuotaMock.mockClear();
  recordUsageMock.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// hasUnresolvedPlaceholders — the placeholder-detection primitive
// ═══════════════════════════════════════════════════════════════════════════

describe('hasUnresolvedPlaceholders', () => {
  it('detects the documented placeholder tokens', () => {
    expect(hasUnresolvedPlaceholders('[DATA TO BE INSERTED]')).toBe(true);
    expect(hasUnresolvedPlaceholders('A total of [N] patients were enrolled.')).toBe(true);
    expect(hasUnresolvedPlaceholders('demonstrated [result] (p=[value]).')).toBe(true);
    expect(hasUnresolvedPlaceholders('reasons were [reasons].')).toBe(true);
  });

  it('detects a general bracketed placeholder even outside the known token list', () => {
    expect(hasUnresolvedPlaceholders('Effect size was [TBD] pending analysis.')).toBe(true);
    expect(hasUnresolvedPlaceholders('[To be drafted based on study results]')).toBe(true);
  });

  it('returns false for clean prose with no bracketed content', () => {
    expect(
      hasUnresolvedPlaceholders(
        'A total of 240 patients were enrolled; 238 completed the study treatment period.'
      )
    ).toBe(false);
  });

  it('returns false for empty/undefined/null content', () => {
    expect(hasUnresolvedPlaceholders('')).toBe(false);
    expect(hasUnresolvedPlaceholders(undefined)).toBe(false);
    expect(hasUnresolvedPlaceholders(null)).toBe(false);
  });

  it('does not flag a bare numeric-only bracket (e.g. a citation marker)', () => {
    // Deliberately narrower than "any bracket": a span with no letters at
    // all (like a citation index) is not one of this drafting pipeline's
    // placeholder conventions.
    expect(hasUnresolvedPlaceholders('as previously reported [12].')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateCSRSections — per-section status must reflect data-completeness
// ═══════════════════════════════════════════════════════════════════════════

describe('generateCSRSections — section status', () => {
  it('marks a section with residual placeholders "needs_data", not "drafted"', async () => {
    completeMock.mockResolvedValue(
      '[DATA TO BE INSERTED]\n\nThe primary endpoint was met/not met (p=[value]).'
    );
    const sections = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];
    const generated = await generateCSRSections(sections, makeRequest());

    const s114 = flattenICHE3Sections(generated).find(s => s.number === '11.4')!;
    expect(s114.status).toBe('needs_data');
    expect(s114.needsData).toBe(true);
    expect(s114.status).not.toBe('drafted');
  });

  it('marks a section with fully-resolved content "drafted"', async () => {
    completeMock.mockResolvedValue(
      'A total of 312 deaths occurred during the study. 47 serious adverse events were reported.'
    );
    const sections = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];
    const generated = await generateCSRSections(sections, makeRequest());

    const s123 = flattenICHE3Sections(generated).find(s => s.number === '12.3')!;
    expect(s123.status).toBe('drafted');
    expect(s123.needsData).toBeFalsy();
  });

  it('marks a section with no content "empty" (unchanged behavior)', async () => {
    completeMock.mockResolvedValue('');
    const sections = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];
    const generated = await generateCSRSections(sections, makeRequest());

    const s5 = generated.find(s => s.number === '5')!;
    expect(s5.status).toBe('empty');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// launchCSRBuild — job-level status/progress must fail closed
// ═══════════════════════════════════════════════════════════════════════════

describe('launchCSRBuild — job status/progress (fail closed)', () => {
  it('does NOT report complete/100 when generated sections still carry data placeholders', async () => {
    // Simulate the exact bug scenario: every section drafts with the
    // documented [DATA TO BE INSERTED]-style placeholder convention, as
    // §11.4/§12.3 do by default even in the template fallback.
    completeMock.mockResolvedValue(
      '[DATA TO BE INSERTED]\n\nIn the ITT population, the primary endpoint showed [result] (p=[value]).'
    );

    const job = await launchCSRBuild(makeRequest());

    // The old buggy behavior was an UNCONDITIONAL status:'complete',
    // progress:100 — assert the opposite so this test fails against it.
    expect(job.status).not.toBe('complete');
    expect(job.progress).toBeLessThan(100);
    expect(job.status).toBe('needs_data');

    // And the underlying section-level signal is present too, so a caller
    // inspecting individual sections gets the same honest answer.
    const flat = flattenICHE3Sections(job.sections);
    const nonEmpty = flat.filter(s => s.content && s.content.length > 0);
    expect(nonEmpty.length).toBeGreaterThan(0);
    for (const s of nonEmpty) {
      expect(s.status).toBe('needs_data');
      expect(s.needsData).toBe(true);
    }
  });

  it('reports complete/100 when generated sections have no residual placeholders', async () => {
    completeMock.mockResolvedValue(
      'This section reports finalized study data with no missing values pending.'
    );

    // Restrict to top-level, childless section numbers so the
    // sectionsToGenerate filter behaves simply (see file header note).
    const request = makeRequest({ sectionsToGenerate: ['1', '5', '7'] });
    const job = await launchCSRBuild(request);

    expect(job.status).toBe('complete');
    expect(job.progress).toBe(100);

    const targeted = flattenICHE3Sections(job.sections).filter(s =>
      request.sectionsToGenerate!.includes(s.number)
    );
    expect(targeted).toHaveLength(3);
    for (const s of targeted) {
      expect(s.status).toBe('drafted');
      expect(hasUnresolvedPlaceholders(s.content)).toBe(false);
    }
  });

  it('reports partial progress (0 < progress < 100) when only some targeted sections are data-complete', async () => {
    completeMock.mockImplementation(async (messages: unknown) => {
      const msgs = messages as Array<{ role: string; content: string }>;
      const userMsg = msgs.find(m => m.role === 'user')?.content ?? '';
      // §5 (Ethics) drafts clean; §7 (Introduction) still needs real
      // numbers — mirrors a realistic partially-complete CSR.
      if (userMsg.includes('Section 5:')) {
        return 'This study was conducted in accordance with ICH/GCP; IRB approval was obtained at all sites.';
      }
      return '[DATA TO BE INSERTED]\n\n[N] deaths occurred during the study.';
    });

    const request = makeRequest({ sectionsToGenerate: ['5', '7'] });
    const job = await launchCSRBuild(request);

    expect(job.status).toBe('needs_data');
    expect(job.progress).toBeGreaterThan(0);
    expect(job.progress).toBeLessThan(100);
  });
});
