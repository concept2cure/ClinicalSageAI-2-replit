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

// ── Mock-interception safety check ──────────────────────────────────────────
// If a future refactor moves ectd-validator-hardening.ts or changes the import
// to a different specifier shape, the vi.mock entries above could silently
// miss and the suite would hit real Postgres (or fail to construct a pool).
// This test asserts the mock IS the thing being called, so a broken mock
// surfaces immediately rather than as an opaque connection error deep in
// another test.
describe('mock interception sanity', () => {
  it('detectSequenceGaps routes pool.query through the hoisted mock (not real Postgres)', async () => {
    expect(hoisted.poolQuery).not.toHaveBeenCalled();
    hoisted.poolQuery.mockResolvedValueOnce(seqRows([]));
    await detectSequenceGaps('IND000000', '0000');
    expect(hoisted.poolQuery).toHaveBeenCalledTimes(1);
  });
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

  it('SEQ_DUPLICATE takes precedence when the candidate sequence is both in-history and below high-water mark', async () => {
    // Documents the precedence: the duplicate check fires before the
    // regression check, so a candidate that would otherwise be a
    // regression surfaces as SEQ_DUPLICATE when it is also in history.
    // The genuine SEQ_REGRESSION branch is exercised by the next test
    // (uses a non-duplicate value below the high-water mark).
    hoisted.poolQuery.mockResolvedValueOnce(seqRows(['0000', '0001', '0002', '0003']));

    const findings = await detectSequenceGaps('BLA125742', '0002');

    expect(findings[0].code).toBe('SEQ_DUPLICATE');
    // No regression finding should land — duplicate short-circuits.
    expect(findings.some(f => f.code === 'SEQ_REGRESSION')).toBe(false);
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

  it('emits SEQ_QUERY_FAILED as a gateway-blocking error when the DB query rejects', async () => {
    // ─────────────────────────────────────────────────────────────────────
    // P0 AUDIT FINDING (RESOLVED) — RECONCILIATION_AUDIT_2026-06-29 §A.3 / §D.1
    //
    // Previously: pool.query had an inner `.catch(() => ({ rows: [] }))`
    // that silently swallowed DB outages. A 0000 initial submission would
    // come back with zero findings and gatewayReady=true even though no
    // history could actually be confirmed.
    //
    // Fix: the inner catch was removed; rejections now bubble into an
    // explicit try/catch that constructs a SEQ_QUERY_FAILED finding at
    // severity 'error', which the call site (validateEctdPackageHardened)
    // treats as gateway-blocking.
    // ─────────────────────────────────────────────────────────────────────
    hoisted.poolQuery.mockRejectedValueOnce(new Error('connection terminated'));

    const findings = await detectSequenceGaps('IND111222', '0000');

    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.code).toBe('SEQ_QUERY_FAILED');
    expect(f.severity).toBe('error');
    expect(f.message).toContain('IND111222');
    // The attempted sequence must be surfaced for operator triage…
    expect(f.message).toContain('0000');
    expect(f.attemptedSequence).toBe('0000');
    // …and a structured error discriminator must be present so SRE can
    // distinguish a transient connection drop from a schema/permission
    // misconfiguration without consulting raw logs.
    expect(typeof f.errorClass).toBe('string');
    expect(f.errorClass!.length).toBeGreaterThan(0);
    // We must NOT leak the raw err.message into the public finding —
    // common Postgres failure strings disclose table/role/host details.
    expect(f.message).not.toContain('connection terminated');
    // Operator-actionable remediation must reference the tracking tables.
    expect(f.fix).toMatch(/ectd_compilations|ectd_submissions|tracking/i);
  });

  it('does NOT misclassify a non-0000 submission as SEQ_FIRST_NOT_0000 when the DB is unreachable', async () => {
    // Before the fix, a swallowed DB outage left existing=[] which made the
    // empty-history branch emit SEQ_FIRST_NOT_0000 — wrong, because the
    // application may well have a history; we just couldn't see it. After
    // the fix, the function returns SEQ_QUERY_FAILED instead and short-
    // circuits before the empty-history branch runs.
    hoisted.poolQuery.mockRejectedValueOnce(new Error('FATAL: terminating connection due to administrator command'));

    const findings = await detectSequenceGaps('NDA987654', '0042');

    // Only SEQ_QUERY_FAILED, never the misleading first-submission code.
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('SEQ_QUERY_FAILED');
    expect(findings[0].severity).toBe('error');
    expect(findings.some(f => f.code === 'SEQ_FIRST_NOT_0000')).toBe(false);
    // The new seq is referenced in the message for operator triage context.
    expect(findings[0].message).toContain('NDA987654');
  });

  it('SEQ_QUERY_FAILED flips gatewayReady to false in the composite validator', async () => {
    // End-to-end guard: confirm the call site (validateEctdPackageHardened)
    // honors the new error-severity SEQ_QUERY_FAILED finding by setting
    // gatewayReady=false. This is the assertion the audit demanded.
    hoisted.poolQuery.mockRejectedValueOnce(new Error('connection refused'));

    const cleanLeaves: ECTDLeaf[] = [
      makeLeaf({ sectionCode: 'm1.1' }),
      makeLeaf({ sectionCode: 'm5.3.5', studyId: 'STUDY-001' }),
    ];

    const result = await validateEctdPackageHardened(
      cleanLeaves,
      {
        submissionId: 'sub-1',
        region: 'US',
        applicationNumber: 'IND111222',
        sequenceNumber: '0000',
        submissionType: 'IND',
      },
      undefined,
    );

    expect(result.sequence.some(f => f.code === 'SEQ_QUERY_FAILED' && f.severity === 'error')).toBe(true);
    expect(result.gatewayReady).toBe(false);
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
