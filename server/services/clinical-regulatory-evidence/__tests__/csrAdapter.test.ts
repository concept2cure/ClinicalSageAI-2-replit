/**
 * CSR → evidence graph projection.
 *
 * `projectCsrToEvidence` is pure, so these tests pin the honesty rules directly
 * without a database. Each one guards a specific way the projection could
 * quietly manufacture evidence:
 *
 *   · parsing an effect out of prose when no structured field exists
 *   · admitting an effect whose uncertainty is missing
 *   · marking machine output as human-verified
 *   · synthesising a source excerpt the CSR never contained
 *   · asserting a registry-confirmed study link that was inferred
 *   · reporting a count without its denominator
 */
import { describe, expect, it } from 'vitest';

import {
  buildProjectionNote,
  csrProjectionKey,
  projectCsrToEvidence,
  type CsrDetailInput,
  type CsrReportInput,
} from '../csr-adapter';

function report(over: Partial<CsrReportInput> = {}): CsrReportInput {
  return {
    id: 1,
    organizationId: 7,
    reportId: 'CSR-1',
    reportTitle: 'A study report',
    sponsor: 'Sponsor',
    indication: 'oncology',
    phase: '2',
    nctId: null,
    studyId: null,
    sampleSize: 120,
    reportDate: '2026-01-15',
    primaryEndpoint: 'Objective response rate at week 12',
    content: null,
    metadata: null,
    ...over,
  };
}

function detail(over: Partial<CsrDetailInput> = {}): CsrDetailInput {
  return { sampleSize: null, primaryEndpoint: null, results: null, metadata: null, ...over };
}

/** A structured effect the extractor accepts: value plus its uncertainty. */
const STRUCTURED = { primaryEffect: { value: 0.42, standardError: 0.13, n: 96 } };

describe('effect extraction is inherited, not reimplemented', () => {
  it('projects a structured effect with its uncertainty', () => {
    const p = projectCsrToEvidence(report(), detail({ results: STRUCTURED }));
    expect(p.observation).not.toBeNull();
    expect(p.observation!.effect).toBeCloseTo(0.42);
    expect(p.observation!.standardError).toBeCloseTo(0.13);
    expect(p.observation!.n).toBe(96);
    expect(p.exclusionReason).toBeNull();
  });

  it('refuses an effect with no uncertainty', () => {
    // A point estimate with no SE or CI cannot be weighted, so it informs nothing.
    const p = projectCsrToEvidence(
      report(),
      detail({ results: { primaryEffect: { value: 0.42 } } }),
    );
    expect(p.observation).toBeNull();
    expect(p.exclusionReason).toMatch(/excluded from every prior/);
  });

  it('never parses an effect out of free-text prose', () => {
    const p = projectCsrToEvidence(
      report(),
      detail({
        results: {
          efficacyNarrative:
            'The treatment arm showed a 42% improvement over control (p < 0.001), a clinically meaningful benefit.',
        },
      }),
    );
    expect(p.observation).toBeNull();
  });

  it('still projects the source when no effect is usable, so coverage can count it', () => {
    // The CSR must remain visible as scanned-but-excluded. Dropping it entirely
    // would shrink the denominator and flatter the corpus.
    const p = projectCsrToEvidence(report(), detail());
    expect(p.source).not.toBeNull();
    expect(p.observation).toBeNull();
    expect(p.exclusionReason).toBeTruthy();
  });

  it('records the benefit-direction normalization rather than applying it silently', () => {
    const p = projectCsrToEvidence(
      report(),
      detail({ results: { hazardRatio: 0.7, ci: [0.55, 0.89] } }),
    );
    expect(p.observation).not.toBeNull();
    expect(p.observation!.benefitDirectionNormalized).toBe(true);
    expect(p.observation!.transformations).toContain('benefit_direction_normalized');
    // A beneficial hazard ratio (<1) becomes a positive benefit-oriented effect.
    expect(p.observation!.effect).toBeGreaterThan(0);
  });
});

describe('nothing marks its own output as verified', () => {
  it('writes machine-extracted observations as unreviewed', () => {
    const p = projectCsrToEvidence(report(), detail({ results: STRUCTURED }));
    expect(p.observation!.verification).toBe('extracted_unreviewed');
  });

  it('records the extraction method on the source', () => {
    const p = projectCsrToEvidence(report(), detail({ results: STRUCTURED }));
    expect(p.source.extractionMethod).toMatch(/deterministic/i);
    expect(p.source.ingestionStatus).toBe('extracted');
  });
});

describe('study linkage states how confident it is', () => {
  it('treats an NCT id on the record as an explicit link', () => {
    const p = projectCsrToEvidence(report({ nctId: 'NCT00000000' }), detail());
    expect(p.study!.linkageStatus).toBe('explicit');
    expect(p.study!.linkageRationale).toBeNull();
  });

  it('marks a sponsor-code-only link inferred, with its rationale', () => {
    const p = projectCsrToEvidence(report({ studyId: 'SPON-204-201' }), detail());
    expect(p.study!.linkageStatus).toBe('inferred');
    expect(p.study!.linkageRationale).toMatch(/Not a registry-confirmed link/);
  });

  it('creates no study at all when there is nothing to link on', () => {
    // Better no link than a speculative one — a fabricated identity would
    // silently attribute this CSR's results to some other trial.
    const p = projectCsrToEvidence(report(), detail());
    expect(p.study).toBeNull();
  });
});

describe('source spans are absent, not invented', () => {
  it('projects no excerpt or page, because csr_reports has none', () => {
    const p = projectCsrToEvidence(report(), detail({ results: STRUCTURED }));
    // The projection carries no excerpt field at all; the writer inserts NULL.
    expect(Object.keys(p.observation!)).not.toContain('sourceExcerpt');
    expect(Object.keys(p.observation!)).not.toContain('sourcePage');
  });

  it('says the endpoint is unnamed rather than guessing one', () => {
    const p = projectCsrToEvidence(
      report({ primaryEndpoint: null }),
      detail({ results: STRUCTURED }),
    );
    expect(p.observation!.endpoint).toMatch(/not named on the CSR record/);
  });

  it('prefers the detail row’s endpoint over the report’s', () => {
    const p = projectCsrToEvidence(
      report({ primaryEndpoint: 'Report-level endpoint' }),
      detail({ primaryEndpoint: 'Detail-level endpoint', results: STRUCTURED }),
    );
    expect(p.observation!.endpoint).toBe('Detail-level endpoint');
  });
});

describe('tenant evidence stays tenant evidence', () => {
  it('projects a client CSR as tenant-private, never public', () => {
    const p = projectCsrToEvidence(report(), detail());
    expect(p.source.visibility).toBe('tenant_private');
    expect(p.source.organizationId).toBe(7);
  });
});

describe('projection is idempotent by key', () => {
  it('keys on NCT id when present — matching the corpus writer’s dedupe rule', () => {
    expect(csrProjectionKey({ id: 1, nctId: 'NCT00000000', reportId: 'CSR-1' })).toBe(
      'csr:nct:NCT00000000',
    );
  });

  it('falls back to the report id, then the row id', () => {
    expect(csrProjectionKey({ id: 1, nctId: null, reportId: 'CSR-1' })).toBe('csr:report:CSR-1');
    expect(csrProjectionKey({ id: 9, nctId: null, reportId: null })).toBe('csr:row:9');
  });

  it('gives the same key for the same CSR across runs', () => {
    const r = report({ nctId: 'NCT00000000' });
    expect(csrProjectionKey(r)).toBe(csrProjectionKey({ ...r }));
  });
});

describe('the coverage note carries its denominators', () => {
  it('reports usable effects against the projected total', () => {
    const note = buildProjectionNote(200, 200, 3, 0);
    expect(note).toContain('200 of 200');
    expect(note).toContain('3 of 200');
    // A run that found 3 usable effects in 200 must not read like a success.
    expect(note).toMatch(/excluded from every estimate/);
    expect(note).toMatch(/await human review/);
  });

  it('says so plainly when the corpus is empty', () => {
    expect(buildProjectionNote(0, 0, 0, 0)).toMatch(/no CSR-derived evidence yet/i);
  });

  it('surfaces skipped rows rather than hiding them in the gap', () => {
    const note = buildProjectionNote(10, 8, 2, 2);
    expect(note).toMatch(/2 could not be projected and were skipped, not silently dropped/);
  });

  it('never emits a bare percentage', () => {
    expect(buildProjectionNote(200, 200, 3, 1)).not.toMatch(/\d+%/);
  });
});
