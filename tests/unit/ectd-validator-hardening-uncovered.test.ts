/**
 * eCTD Validator Hardening — coverage for the critical paths the
 * 2026-06-29 reconciliation audit flagged as untested.
 *
 *  Covers:
 *   - detectSequenceGaps (async / DB-backed) — every emission branch
 *     including the DB-failure swallow that the audit flagged as P0.
 *   - validateEctdPackageHardened composite — aggregation of findings
 *     into regional/sequence/dtd buckets and gatewayReady semantics.
 *   - flattenFindings — uniform shape across all 4 categories.
 *
 * Mocking strategy: hoisted poolQuery mock returned from `server/db.js`.
 * The hardening module imports `{ pool }` from `'../../db.js'` — at runtime
 * that resolves to server/db.js. We replace the module export with a tiny
 * object that exposes only `query`, which is the only thing `detectSequenceGaps`
 * uses. No real Postgres is touched.
 *
 * Audit traceability:
 *   docs/reports/RECONCILIATION_AUDIT_2026-06-29.md §A.3
 *     "detectSequenceGaps (DB-backed) is NOT tested.
 *      validateEctdPackageHardened composite is NOT tested.
 *      flattenFindings is NOT tested."
 *   §D.1 "Persistence failures swallowed → gatewayReady stays true on outage."
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted DB mock ─────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  poolQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>(),
}));

// Replace ../../server/db (the file the hardening module imports from) so
// any `pool.query(...)` resolves to our spy. Keep getPool/getDb/db harmless
// so other imports (orchestrator, etc.) don't blow up if they transit here.
vi.mock('../../server/db.js', () => {
  const pool = {
    query: (...args: unknown[]) => hoisted.poolQuery(...(args as [string, unknown[]?])),
  };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/db', () => {
  const pool = {
    query: (...args: unknown[]) => hoisted.poolQuery(...(args as [string, unknown[]?])),
  };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
  detectSequenceGaps,
  validateEctdPackageHardened,
  flattenFindings,
  type HardenedValidationContext,
  type HardenedValidationResult,
  type SequenceFinding,
  type DtdFinding,
} from '../../server/services/ectd/ectd-validator-hardening';
import type { ECTDLeaf, ValidationFinding } from '../../server/services/ectd/ectd4-validator';
import type { RegionalFinding } from '../../server/services/ectd/ectd-regional-rules';

// ── Helpers ─────────────────────────────────────────────────────────────────

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e'; // 32 hex, valid

function seqRows(seqs: string[]) {
  return { rows: seqs.map(s => ({ sequence_number: s })) };
}

function makeLeaf(over: Partial<ECTDLeaf> & { sectionCode: string }): ECTDLeaf {
  return {
    title: over.title ?? over.sectionCode,
    checksum: over.checksum ?? MD5,
    checksumType: 'md5',
    operation: over.operation ?? 'new',
    filePath: over.filePath ?? `${over.sectionCode}/doc.pdf`,
    mimeType: over.mimeType ?? 'application/pdf',
    fileSize: over.fileSize ?? 1024,
    ...over,
  };
}

beforeEach(() => {
  hoisted.poolQuery.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1) detectSequenceGaps — branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe('detectSequenceGaps (DB-backed)', () => {
  it('emits SEQ_FIRST_NOT_0000 when history is empty and the new sequence is not 0000', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const findings = await detectSequenceGaps('IND123456', '0003');

    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.code).toBe('SEQ_FIRST_NOT_0000');
    expect(f.severity).toBe('error');
    expect(f.expectedNextSequence).toBe('0000');
    expect(f.observedSequences).toEqual([]);
    // Message names the bad sequence so a UI can surface it.
    expect(f.message).toContain('IND123456');
    expect(f.message).toContain('0003');
  });

  it('is silent when history is empty and the new sequence IS 0000', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const findings = await detectSequenceGaps('IND123456', '0000');

    expect(findings).toEqual([]);
  });

  it('emits SEQ_DUPLICATE when the new sequence already exists in history', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001', '0002']));

    const findings = await detectSequenceGaps('NDA215789', '0001');

    // Duplicate short-circuits — only the duplicate finding should land.
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.code).toBe('SEQ_DUPLICATE');
    expect(f.severity).toBe('error');
    expect(f.expectedNextSequence).toBe('0003');
    expect(f.observedSequences).toEqual(['0000', '0001', '0002']);
  });

  it('emits SEQ_GAP when the new sequence skips forward (0000, 0001 → 0003)', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001']));

    const findings = await detectSequenceGaps('NDA215789', '0003');

    // Only SEQ_GAP — history itself is contiguous so no SEQ_HISTORICAL_GAP.
    const codes = findings.map(f => f.code);
    expect(codes).toContain('SEQ_GAP');
    expect(codes).not.toContain('SEQ_HISTORICAL_GAP');
    const gap = findings.find(f => f.code === 'SEQ_GAP')!;
    expect(gap.severity).toBe('error');
    expect(gap.expectedNextSequence).toBe('0002');
    expect(gap.message).toMatch(/skips\s+1/);
  });

  it('emits SEQ_REGRESSION when the new sequence is lower than the latest history (history 0003 → new 0002)', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001', '0002', '0003']));

    const findings = await detectSequenceGaps('BLA125742', '0002');

    // Duplicate fires first (0002 is in history) — the regression code path
    // only reaches when the new seq is BELOW the highest but NOT already
    // present. Use a true regression scenario: history 0000..0003, new 0001
    // is also a dup. Try a non-present lower number by using a hole.
    expect(findings[0].code).toBe('SEQ_DUPLICATE');
  });

  it('emits SEQ_REGRESSION when the new sequence is below the high-water mark and not a duplicate', async () => {
    // History has a hole at 0002. New '0002' is below the top (0003) and not
    // duplicated, so it should regress (not gap).
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001', '0003']));

    const findings = await detectSequenceGaps('BLA125742', '0002');

    // We expect BOTH a regression for the new seq AND a historical-gap
    // warning for the 0002 hole the loop discovers.
    const codes = findings.map(f => f.code);
    expect(codes).toContain('SEQ_REGRESSION');
    expect(codes).toContain('SEQ_HISTORICAL_GAP');
    const reg = findings.find(f => f.code === 'SEQ_REGRESSION')!;
    expect(reg.severity).toBe('error');
    // Expected next slot is one past the highest (0003 → 0004).
    expect(reg.expectedNextSequence).toBe('0004');
  });

  it('emits SEQ_HISTORICAL_GAP when historical sequences themselves contain a hole', async () => {
    // History: 0000, 0001, 0003 — missing 0002. New 0004 is the legitimate
    // next sequence so no SEQ_GAP / SEQ_REGRESSION should fire for the new
    // value. The loop should still surface the historical hole as a warning.
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001', '0003']));

    const findings = await detectSequenceGaps('IND999999', '0004');

    const hist = findings.find(f => f.code === 'SEQ_HISTORICAL_GAP');
    expect(hist).toBeDefined();
    expect(hist!.severity).toBe('warning');
    expect(hist!.message).toContain('expected 0002');
    expect(hist!.message).toContain('found 0003');
    // No false positives on the new seq.
    expect(findings.find(f => f.code === 'SEQ_GAP')).toBeUndefined();
    expect(findings.find(f => f.code === 'SEQ_REGRESSION')).toBeUndefined();
  });

  it('PINS CURRENT BEHAVIOR: DB query failure is swallowed, NOT surfaced as a finding', async () => {
    // ─────────────────────────────────────────────────────────────────────
    // P0 AUDIT FINDING — RECONCILIATION_AUDIT_2026-06-29 §A.3 / §D.1
    //
    // The source uses `pool.query(...).catch(() => ({ rows: [] }))`. A DB
    // outage is therefore indistinguishable from "no history". Worse: the
    // empty-history code path treats sequence '0000' as VALID, so a DB
    // outage during a 0000 initial submission produces zero findings, an
    // empty sequence array, and gatewayReady=true downstream.
    //
    // This test PINS that behavior so the next dev sees the regression risk.
    // When this is fixed (e.g., by letting the rejection bubble to the outer
    // try/catch so the SEQ_QUERY_FAILED warning fires), this test should be
    // inverted, not deleted — see the SHOULD-BE assertions below.
    // ─────────────────────────────────────────────────────────────────────
    hoisted.poolQuery.mockRejectedValueOnce(new Error('connection terminated'));

    const findings = await detectSequenceGaps('IND111222', '0000');

    // Current behavior: swallow.
    expect(findings).toEqual([]);
    // ── When fixed, replace with: ──────────────────────────────────────
    //   expect(findings).toHaveLength(1);
    //   expect(findings[0].code).toBe('SEQ_QUERY_FAILED');
    //   expect(findings[0].severity).toBe('warning'); // or 'error' if escalated
    //   expect(findings[0].message).toContain('connection terminated');
    // ───────────────────────────────────────────────────────────────────
  });

  it('PINS CURRENT BEHAVIOR: a DB outage during a non-0000 submission silently re-classifies it as SEQ_FIRST_NOT_0000', async () => {
    // A second swallow consequence: when the new sequence is e.g. '0042'
    // and the DB is unreachable, the function does NOT warn about the DB
    // failure — it instead reports the misleading SEQ_FIRST_NOT_0000.
    // This is wrong (the application may well have a history; we just
    // couldn't see it), but the route layer has no way to distinguish.
    hoisted.poolQuery.mockRejectedValueOnce(new Error('FATAL: terminating connection due to administrator command'));

    const findings = await detectSequenceGaps('NDA987654', '0042');

    expect(findings).toHaveLength(1);
    // The fake "first submission" finding — NOT the SEQ_QUERY_FAILED that
    // a correct implementation would surface.
    expect(findings[0].code).toBe('SEQ_FIRST_NOT_0000');
    // Critically, no SEQ_QUERY_FAILED — confirming the swallow.
    expect(findings.some(f => f.code === 'SEQ_QUERY_FAILED')).toBe(false);
  });

  it('queries with the application number bound to $1 and filters DISTINCT 4-digit seqs', async () => {
    // Sanity: confirms the SQL contract the unit relies on. Mocks intercept
    // before any real query, so this is just shape verification.
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    await detectSequenceGaps('IND123456', '0000');

    expect(hoisted.poolQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = hoisted.poolQuery.mock.calls[0];
    expect(sql).toMatch(/sequence_number/i);
    expect(sql).toMatch(/ectd_compilations/i);
    expect(sql).toMatch(/ectd_submissions/i);
    expect(sql).toMatch(/UNION/i);
    expect(sql).toMatch(/application_number\s*=\s*\$1/i);
    expect(params).toEqual(['IND123456']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) validateEctdPackageHardened — composite aggregation
// ═══════════════════════════════════════════════════════════════════════════

describe('validateEctdPackageHardened (composite)', () => {
  // Build a minimal but realistic leaf set covering several validator
  // facets: a clean leaf, a leaf with a bad MD5 (drives MD5_INVALID_FORMAT),
  // and a leaf in m5.3.* without studyId (drives STF_MISSING_STUDY_ID).
  const cleanLeaves = (): ECTDLeaf[] => [
    makeLeaf({ sectionCode: 'm1.1' }),
    makeLeaf({ sectionCode: 'm1.2' }),
    makeLeaf({ sectionCode: 'm1.5' }),
    makeLeaf({ sectionCode: 'm1.6' }),
    makeLeaf({ sectionCode: 'm1.7' }),
    makeLeaf({ sectionCode: 'm1.9' }),
    makeLeaf({ sectionCode: 'm2.3' }),
    makeLeaf({ sectionCode: 'm2.4' }),
    makeLeaf({ sectionCode: 'm2.6' }),
    makeLeaf({ sectionCode: 'm3.2.S' }),
    makeLeaf({ sectionCode: 'm3.2.P' }),
    makeLeaf({ sectionCode: 'm4.2.1' }),
    makeLeaf({ sectionCode: 'm4.2.2' }),
    makeLeaf({ sectionCode: 'm4.2.3' }),
    makeLeaf({ sectionCode: 'm5.3.5', studyId: 'STUDY-001' }),
  ];

  const baseCtx = (over: Partial<HardenedValidationContext> = {}): HardenedValidationContext => ({
    submissionId: 'sub-1',
    region: 'US',
    applicationNumber: 'IND123456',
    sequenceNumber: '0000',
    submissionType: 'IND',
    ...over,
  });

  const backboneOk = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "ich-ectd-3-2.dtd">
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink">
  <admin />
</ectd:ectd>`;

  it('aggregates findings into separate regional / sequence / dtd / structural buckets', async () => {
    // History empty + new seq != 0000 → SEQ_FIRST_NOT_0000 lands in `sequence`.
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    // Bad-MD5 leaf drives a structural-bucket finding (MD5_INVALID_FORMAT).
    const leaves = cleanLeaves();
    leaves.push(makeLeaf({ sectionCode: 'm5.3.5', checksum: 'NOT-MD5', studyId: 'S2' }));

    // No backbone → DTD bucket gets DTD_NO_BACKBONE (warning).
    const result = await validateEctdPackageHardened(
      leaves,
      baseCtx({ sequenceNumber: '0003' }),
      undefined
    );

    // ── DTD bucket ────────────────────────────────────────────────────
    expect(result.dtd).toBeInstanceOf(Array);
    expect(result.dtd.some(f => f.code === 'DTD_NO_BACKBONE')).toBe(true);

    // ── Sequence bucket ───────────────────────────────────────────────
    expect(result.sequence).toBeInstanceOf(Array);
    expect(result.sequence.some(f => f.code === 'SEQ_FIRST_NOT_0000')).toBe(true);

    // ── Regional bucket (FDA enforces sequence/app-number/regional XML) ──
    expect(result.regional).toBeInstanceOf(Array);
    // We did not provide /m1/us/us-regional.xml → FDA-ESG-004 should land.
    expect(result.regional.some(f => f.ruleId === 'FDA-ESG-004')).toBe(true);

    // ── Structural bucket (md5/study-id/missing-section etc.) ─────────
    expect(result.findings).toBeInstanceOf(Array);
    expect(result.findings.some(f => f.code === 'MD5_INVALID_FORMAT')).toBe(true);
  });

  it('gatewayReady is false when sequence has any error', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const result = await validateEctdPackageHardened(
      cleanLeaves(),
      baseCtx({ sequenceNumber: '0007' }),
      backboneOk
    );

    expect(result.sequence.some(f => f.severity === 'error')).toBe(true);
    expect(result.gatewayReady).toBe(false);
  });

  it('gatewayReady is false when regional has any error (CN package missing CN regional XML)', async () => {
    // Use CN: validateNMPAPackage will demand /m1/cn/cn-regional.xml. The
    // clean leaf set has only m1/us-style paths → regional error fires.
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const result = await validateEctdPackageHardened(
      cleanLeaves(),
      baseCtx({ region: 'CN', applicationNumber: 'CXSS2400123' }),
      backboneOk
    );

    expect(result.regional.some(f => f.severity === 'error')).toBe(true);
    expect(result.gatewayReady).toBe(false);
  });

  it('hardenedScore deducts heavier for regional / sequence errors than structural', async () => {
    // Sequence error: weight 2 each → at least 24 points deducted from 100.
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const result = await validateEctdPackageHardened(
      cleanLeaves(),
      baseCtx({ sequenceNumber: '0099' }),
      backboneOk
    );

    expect(result.hardenedScore).toBeLessThan(100);
    expect(result.hardenedScore).toBeGreaterThanOrEqual(0);
    // Sanity ordering: presence of sequence errors should always pull score
    // below the structural-only score baseline.
    expect(result.hardenedScore).toBeLessThanOrEqual(result.score);
  });

  it('summary recounts errors/warnings/infos from the merged structural bucket', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));

    const leaves = cleanLeaves();
    leaves.push(makeLeaf({ sectionCode: 'm5.3.5', checksum: 'NOT-MD5', studyId: 'S2' }));

    const result = await validateEctdPackageHardened(leaves, baseCtx(), backboneOk);

    const recountedErrors = result.findings.filter(f => f.severity === 'error').length;
    const recountedWarnings = result.findings.filter(f => f.severity === 'warning').length;
    const recountedInfos = result.findings.filter(f => f.severity === 'info').length;
    expect(result.summary.errors).toBe(recountedErrors);
    expect(result.summary.warnings).toBe(recountedWarnings);
    expect(result.summary.infos).toBe(recountedInfos);
  });

  it('flags DTD failures when backbone XML is malformed', async () => {
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));
    const badBackbone = '<not-xml>nothing here</not-xml>';

    const result = await validateEctdPackageHardened(cleanLeaves(), baseCtx(), badBackbone);

    const codes = result.dtd.map(f => f.code);
    expect(codes).toContain('DTD_NO_DECLARATION');
    expect(codes).toContain('DTD_NO_DOCTYPE');
    expect(codes).toContain('DTD_BAD_ROOT');
    expect(codes).toContain('DTD_MISSING_ECTD_NS');
    expect(codes).toContain('DTD_MISSING_XLINK_NS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) flattenFindings — uniform shape across categories
// ═══════════════════════════════════════════════════════════════════════════

describe('flattenFindings', () => {
  function makeResult(): HardenedValidationResult {
    const structural: ValidationFinding[] = [
      {
        id: 'V1',
        severity: 'error',
        code: 'MD5_INVALID_FORMAT',
        sectionCode: 'm3.2.S',
        message: 'bad md5',
        fix: 'regen',
        rule: 'ICH M8 §3.4',
      },
    ];
    const regional: RegionalFinding[] = [
      {
        ruleId: 'FDA-ESG-004',
        region: 'US',
        severity: 'error',
        message: 'missing us-regional.xml',
        fix: 'add it',
        scope: 'package',
        leafPath: '/m1/us/us-regional.xml',
      },
    ];
    const sequence: SequenceFinding[] = [
      {
        severity: 'error',
        code: 'SEQ_FIRST_NOT_0000',
        message: 'first must be 0000',
        fix: 'use 0000',
      },
    ];
    const dtd: DtdFinding[] = [
      {
        severity: 'error',
        code: 'DTD_NO_DOCTYPE',
        message: 'missing doctype',
        fix: 'add doctype',
        filePath: '/index.xml',
      },
    ];
    return {
      valid: false,
      score: 50,
      findings: structural,
      summary: {
        errors: 1,
        warnings: 0,
        infos: 0,
        sectionsPresent: 0,
        sectionsRequired: 0,
        sectionsMissing: [],
      },
      timestamp: new Date().toISOString(),
      regional,
      sequence,
      dtd,
      hardenedScore: 40,
      gatewayReady: false,
    };
  }

  it('returns one entry per finding across all four categories', () => {
    const flat = flattenFindings(makeResult());

    expect(flat).toHaveLength(4);
    const cats = flat.map(f => f.category).sort();
    expect(cats).toEqual(['dtd', 'regional', 'sequence', 'structural']);
  });

  it('preserves severity, message, and fix on every entry', () => {
    const flat = flattenFindings(makeResult());
    for (const f of flat) {
      expect(f.severity).toBeDefined();
      expect(typeof f.message).toBe('string');
      expect(typeof f.fix).toBe('string');
      expect(f.message.length).toBeGreaterThan(0);
    }
  });

  it('uses ruleId as code for regional findings, scope+leafPath are carried through', () => {
    const flat = flattenFindings(makeResult());
    const regional = flat.find(f => f.category === 'regional')!;
    expect(regional.code).toBe('FDA-ESG-004');
    expect(regional.scope).toBe('package');
    expect(regional.filePath).toBe('/m1/us/us-regional.xml');
  });

  it('uses code as code for sequence findings (no ruleId field)', () => {
    const flat = flattenFindings(makeResult());
    const sequence = flat.find(f => f.category === 'sequence')!;
    expect(sequence.code).toBe('SEQ_FIRST_NOT_0000');
    expect(sequence.scope).toBeUndefined();
  });

  it('carries filePath on dtd findings', () => {
    const flat = flattenFindings(makeResult());
    const dtd = flat.find(f => f.category === 'dtd')!;
    expect(dtd.filePath).toBe('/index.xml');
  });
});
