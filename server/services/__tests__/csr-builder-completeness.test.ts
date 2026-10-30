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
 * Nested section selection is supported: selecting a child does not require
 * selecting its parent, and an invalid section code cannot produce 100%.
 *
 * 2026-10-29: the tree is ICH_E3_GUIDANCE (the builder's ICH_E3_STRUCTURE copy
 * was deleted), so section numbers here are E3's own: ethics is drafted as
 * §5.1–5.3, efficacy results as §11.4.1–11.4.7, deaths and SAEs as §12.3.x.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the unified AI client BEFORE importing csr-builder ────────────────
// CSR drafting lazily imports the canonical unified client. Register its mock
// before drafting so these cases remain offline with controlled model output.
const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => ''),
}));
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock },
  default: { complete: completeMock },
}));

// ── Mock quota/usage-metering so the build launch never touches a real DB ──
const { checkQuotaMock, recordUsageMock } = vi.hoisted(() => ({
  checkQuotaMock: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
  recordUsageMock: vi.fn(async () => undefined),
}));
vi.mock('../usage-metering.js', () => ({
  checkQuota: checkQuotaMock,
  recordUsage: recordUsageMock,
}));

import {
  launchCSRBuildAsync,
  generateCSRSections,
  hasUnresolvedPlaceholders,
  flattenICHE3Sections,
  getICHE3Structure,
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

/** The build's execution context, as POST /api/csr/jobs passes it. */
const CTX = { organizationId: 1, requestedBy: 1 };

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
    const sections = getICHE3Structure();
    const generated = await generateCSRSections(sections, makeRequest());

    const s114 = flattenICHE3Sections(generated).find(s => s.number === '11.4.1')!;
    expect(s114.status).toBe('needs_data');
    expect(s114.needsData).toBe(true);
    expect(s114.status).not.toBe('drafted');
  });

  it('marks a section with fully-resolved content "drafted"', async () => {
    completeMock.mockResolvedValue(
      'The study was conducted in accordance with the Declaration of Helsinki and ICH GCP.'
    );
    const sections = getICHE3Structure();
    const generated = await generateCSRSections(sections, makeRequest());

    const s5 = flattenICHE3Sections(generated).find(s => s.number === '5.2')!;
    expect(s5.status).toBe('drafted');
    expect(s5.needsData).toBeFalsy();
  });

  // Until 2026-10-05 this file asserted that a §12.3 model draft reading "312
  // deaths … 47 serious adverse events" — counts nobody supplied — was stored
  // as 'drafted'. That is the fabrication csr/unsupplied-statistics.ts now
  // refuses (CLAUDE.md Rule 2): the section falls back to its template and
  // needs data.
  it('does not mark a results section drafted from statistics nobody supplied', async () => {
    completeMock.mockResolvedValue(
      'A total of 312 deaths occurred during the study. 47 serious adverse events were reported.'
    );
    const sections = getICHE3Structure();
    const generated = await generateCSRSections(sections, makeRequest());

    const s123 = flattenICHE3Sections(generated).find(s => s.number === '12.3.3')!;
    expect(s123.content).not.toContain('312');
    expect(s123.status).toBe('needs_data');
  });

  it('marks a section with no content "empty" (unchanged behavior)', async () => {
    completeMock.mockResolvedValue('');
    const sections = getICHE3Structure();
    const generated = await generateCSRSections(sections, makeRequest());

    const s5 = flattenICHE3Sections(generated).find(s => s.number === '5.2')!;
    expect(s5.status).toBe('empty');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section selection is refused by the one build path, before billing
// ═══════════════════════════════════════════════════════════════════════════

describe('targeted ICH E3 subsection drafting', () => {
  it('drafts a selected nested section without drafting its parent', async () => {
    completeMock.mockResolvedValue('Reviewed, source-linked narrative draft.');
    const sections = getICHE3Structure();
    const generated = await generateCSRSections(sections, makeRequest({ sectionsToGenerate: ['11.4.1'] }));
    const flat = flattenICHE3Sections(generated);
    expect(flat.find(s => s.number === '11.4.1')?.content).toBeTruthy();
    expect(flat.find(s => s.number === '11.4')?.content).toBeFalsy();
    expect(flat.find(s => s.number === '11')?.content).toBeFalsy();
    expect(flat.find(s => s.number === '12.3.3')?.content).toBeFalsy();
  });

  it('drafts a selected bare parent through its children, never itself', async () => {
    completeMock.mockResolvedValue('Reviewed, source-linked narrative draft.');
    const flat = flattenICHE3Sections(await generateCSRSections(getICHE3Structure(), makeRequest({ sectionsToGenerate: ['5'] })));
    expect(flat.find(s => s.number === '5')?.content).toBeFalsy();
    for (const n of ['5.1', '5.2', '5.3']) expect(flat.find(s => s.number === n)?.content).toBeTruthy();
  });

  it('refuses a manual heading by name before billing', async () => {
    await expect(launchCSRBuildAsync(makeRequest({ sectionsToGenerate: ['16'] }), CTX))
      .rejects.toThrow('CSR_SECTION_MANUAL');
    expect(checkQuotaMock).not.toHaveBeenCalled();
  });

  it('does not call a nonexistent section complete', async () => {
    completeMock.mockResolvedValue('Reviewed, source-linked narrative draft.');
    await expect(launchCSRBuildAsync(makeRequest({ sectionsToGenerate: ['99.99'] }), CTX))
      .rejects.toThrow('CSR_SECTION_SELECTION_INVALID');
    expect(checkQuotaMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate targets before billing', async () => {
    await expect(launchCSRBuildAsync(makeRequest({ sectionsToGenerate: ['5', '5'] }), CTX))
      .rejects.toThrow('CSR_SECTION_SELECTION_INVALID');
    expect(checkQuotaMock).not.toHaveBeenCalled();
  });

  it('rejects an explicit empty selection before billing', async () => {
    await expect(launchCSRBuildAsync(makeRequest({ sectionsToGenerate: [] }), CTX))
      .rejects.toThrow('CSR_SECTION_SELECTION_INVALID');
    expect(checkQuotaMock).not.toHaveBeenCalled();
  });

  it('does not mark a partly invalid section selection complete', async () => {
    completeMock.mockResolvedValue('Reviewed, source-linked narrative draft.');
    await expect(launchCSRBuildAsync(makeRequest({ sectionsToGenerate: ['5', '99.99'] }), CTX))
      .rejects.toThrow('CSR_SECTION_SELECTION_INVALID');
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});

// The job-level fail-closed status rule (a CSR with an unresolved placeholder,
// a missing output or a changed checksum is never 'complete'/100) belongs to
// the one build path's runner since 2026-10-30, when the synchronous
// launchCSRBuild was deleted: csr/__tests__/csr-job-runner.placeholder-gate.test.ts.
