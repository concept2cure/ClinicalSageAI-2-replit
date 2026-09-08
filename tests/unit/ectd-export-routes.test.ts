/**
 * eCTD Export API routes — unit tests
 *
 * Exercises the HTTP surface in server/routes/ectd-export.ts:
 *   POST /api/ectd/export/:submissionId/validate     — merged validator
 *     1. Legacy: no extended-validator keys → generate-then-validate path
 *        runs only the ZIP-level validator (backward-compat).
 *     2. Opt-in: options.region=FDA + leaves → FDA regional rule pack fires
 *        a MISSING_REGIONAL_FDA leaf-level finding when no m1/us leaf is
 *        present.
 *     3. Opt-in: options.priorSequenceNumbers + sequenceNumber → leaf
 *        validator emits SEQUENCE_GAP for the missing 4-digit sequence.
 *   POST /api/ectd/validate/preflight                 — leaf-only preflight
 *     4. Happy path: valid ECTDLeaf[] → returns a leaf-only ValidationResult
 *        (coverage.ranZipValidator === false, ranLeafValidator === true,
 *         leafValidation present, zipValidation absent).
 *     5. Auth gap: authenticated principal WITHOUT organizationId → 403
 *        (the route uses requireTenant, which emits 403 — not 400 — when an
 *         authenticated user lacks org context. The task brief asked for
 *         400; the route returns 403 by design, so we assert the live
 *         contract and call out the brief mismatch in the API-gaps notes).
 *     6. Invalid region string ("XX") → 400 from the zod enum guard.
 *
 * Strategy: mount the real routers (router + preflightRouter) behind a thin
 * supertest harness. Per-request auth injection lets us drive the tenant
 * paths without standing up the JWT middleware. The canonical assembler
 * (ectd/assemble-from-core.assembleSubmissionEctd), the ZIP structural
 * validator, auditService, exportGovernance and db are mocked so no service
 * body or Postgres connection is exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════════
// HOISTED MOCK STATE (shared by mocks + assertions)
// ═══════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => {
  return {
    assembleSubmissionEctd: vi.fn(),
    validateEctdPackage: vi.fn(),
    registerExportGovernanceQuick: vi.fn(),
    auditLogAction: vi.fn(),
    reset() {
      this.assembleSubmissionEctd.mockReset();
      this.validateEctdPackage.mockReset();
      this.registerExportGovernanceQuick.mockReset();
      this.auditLogAction.mockReset();
      // Sensible defaults — individual tests can override.
      this.assembleSubmissionEctd.mockResolvedValue({
        buffer: Buffer.from('FAKE-ZIP-BYTES'),
        filename: 'SEQ-1-0000-fda.zip',
        sequenceId: 1,
        sequenceNumber: '0000',
        region: 'fda',
        sha256: 'a'.repeat(64),
        materialized: 9,
        unresolvedLeaves: [],
        skipped: [],
        stats: {
          totalModules: 5,
          totalFiles: 12,
          totalGranules: 9,
          generatedAt: '2026-06-29T00:00:00.000Z',
          completeness: {
            totalLeaves: 9, completeLeaves: 9, placeholderLeaves: 0,
            unfinalizedLeaves: 0, completenessPct: 100, complete: true, incompleteSections: [],
          },
        },
      });
      this.validateEctdPackage.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      this.registerExportGovernanceQuick.mockResolvedValue({ ok: true });
      // logAction resolves an AuditWriteResult (server/services/auditService.ts)
      // and the route dereferences it (.persisted / .error), so the mock must
      // resolve the real success shape — resolving undefined makes the route
      // throw a TypeError and 500.
      this.auditLogAction.mockResolvedValue({
        persisted: true,
        chained: true,
        tamperProof: true,
      });
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK the canonical assembler + ZIP structural validator
//
// The route imports assembleSubmissionEctd from ectd/assemble-from-core and
// validateEctdPackage from submission-gateways/ectd-structural-validator.
// The assembler transitively imports server/db and shared schema; mocking the
// modules short-circuits all of that.
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/ectd/assemble-from-core', () => ({
  assembleSubmissionEctd: (...args: unknown[]) => hoisted.assembleSubmissionEctd(...args),
}));

vi.mock('../../server/services/submission-gateways/ectd-structural-validator', () => ({
  validateEctdPackage: (...args: unknown[]) => hoisted.validateEctdPackage(...args),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK exportGovernance — registerExportGovernanceQuick
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: (...args: unknown[]) =>
    hoisted.registerExportGovernanceQuick(...args),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK auditService — default export with logAction
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/auditService', () => ({
  default: {
    logAction: (...args: unknown[]) => hoisted.auditLogAction(...args),
  },
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK db — the route does not touch db directly, but the
// ectd4-validator and regional-rules modules may pull it through transitives.
// Provide a no-op facade so any incidental import resolves.
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/db', () => {
  const db = { execute: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn() };
  return { db, pool: null, getPool: () => null, getDb: () => db };
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT THE ROUTERS (after mocks)
// ═══════════════════════════════════════════════════════════════════════════════

import ectdExportRouter, { preflightRouter } from '../../server/routes/ectd-export';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST APP — supertest harness with per-request auth injection
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthCtx {
  organizationId?: number | null;
  userId?: number | null;
  // When true, set req.user WITHOUT an organizationId field — drives the
  // 403 "Organization context required" branch of requireTenant.
  userWithoutOrg?: boolean;
}

/**
 * Build a fresh Express app whose middleware stamps req.user /
 * req.tenantContext from the provided ctx. Both /api/ectd/export and
 * /api/ectd are mounted so the same harness can hit either route family.
 */
function makeApp(ctx: AuthCtx = { organizationId: 100, userId: 7 }) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    if (ctx.userWithoutOrg) {
      // Authenticated but no org → 403 path.
      r.user = { id: ctx.userId ?? 7 };
    } else {
      if (ctx.organizationId != null) {
        r.tenantContext = { organizationId: ctx.organizationId };
      }
      if (ctx.userId != null) {
        r.user = {
          id: ctx.userId,
          organizationId: ctx.organizationId ?? undefined,
        };
      }
    }
    next();
  });
  app.use('/api/ectd/export', ectdExportRouter);
  app.use('/api/ectd', preflightRouter);
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE: a minimal valid ECTDLeaf for preflight happy-path
// ═══════════════════════════════════════════════════════════════════════════════

function fdaLeaf(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sectionCode: 'm1.1',
    title: 'FDA Form 1571',
    checksum: 'd41d8cd98f00b204e9800998ecf8427e',
    checksumType: 'md5',
    operation: 'new',
    filePath: 'm1/us/us-regional.xml',
    mimeType: 'application/xml',
    fileSize: 1024,
    ...overrides,
  };
}

function nonRegionalLeaf(overrides: Partial<Record<string, unknown>> = {}) {
  // A Module-3 quality leaf with NO m1/us path → triggers MISSING_REGIONAL_FDA
  // when region=FDA is supplied to the validator.
  return {
    sectionCode: 'm3.2.S.1',
    title: 'Drug Substance General Information',
    checksum: 'd41d8cd98f00b204e9800998ecf8427e',
    checksumType: 'md5',
    operation: 'new',
    filePath: 'm3/32-body-data/32s-drug-sub/sub-general.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  hoisted.reset();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/ectd/export/:submissionId/validate', () => {
  it('case 1: no options → ZIP-level validation only (backward compat)', async () => {
    // Empty JSON body has no extended-validator opt-in keys, so the route
    // falls back to legacy generate-then-validate. Only the ZIP validator
    // runs; the leaf validator is NOT invoked.
    const res = await request(makeApp())
      .post('/api/ectd/export/42/validate')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.submissionId).toBe(42);
    expect(res.body.valid).toBe(true);
    expect(res.body.coverage).toEqual({
      ranZipValidator: true,
      ranLeafValidator: false,
    });
    // mode tag confirms we entered the legacy path.
    expect(res.body.mode).toMatch(/json-generated-then-validated-legacy|generated-then-validated/);
    // leafValidation absent; zipValidation present.
    expect(res.body.leafValidation).toBeUndefined();
    expect(res.body.zipValidation).toEqual({ valid: true, errors: [], warnings: [] });

    // Service contract: the legacy path MUST have generated then validated —
    // through the CANONICAL assembler, keyed by the submission spine.
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalledTimes(1);
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalledWith(
      expect.objectContaining({ submissionId: 42, organizationId: 100 }),
    );
    expect(hoisted.validateEctdPackage).toHaveBeenCalledTimes(1);
  });

  it('case 2: options.region=FDA + non-regional leaves → MISSING_REGIONAL_FDA finding', async () => {
    // Region opt-in WITH a leaves array that has no m1/us content. The
    // regional rule pack should emit a MISSING_REGIONAL_FDA leaf-level
    // finding. Because leaves are supplied and no zipBufferBase64, the
    // route runs leaf-only (no generate-then-validate).
    const res = await request(makeApp())
      .post('/api/ectd/export/42/validate')
      .send({
        region: 'FDA',
        leaves: [nonRegionalLeaf()],
        submissionType: 'IND',
      });

    expect(res.status).toBe(200);
    expect(res.body.coverage).toEqual({
      ranZipValidator: false,
      ranLeafValidator: true,
    });
    expect(res.body.mode).toBe('json-leaves-only');

    // The unified findings array MUST include the regional gap.
    const codes = (res.body.findings as Array<{ code: string; source: string }>).map(
      f => f.code,
    );
    expect(codes).toContain('MISSING_REGIONAL_FDA');
    const regional = (res.body.findings as Array<{ code: string; source: string; severity: string }>).find(
      f => f.code === 'MISSING_REGIONAL_FDA',
    );
    expect(regional).toBeDefined();
    expect(regional!.source).toBe('leaf');
    expect(regional!.severity).toBe('error');

    // Leaf-only path: the ZIP path must NOT have been invoked.
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
    expect(hoisted.validateEctdPackage).not.toHaveBeenCalled();
  });

  it('case 3: priorSequenceNumbers=["0000","0002"] + sequenceNumber="0003" → SEQUENCE_GAP for 0001', async () => {
    // detectSequenceGapsFromArray normalizes to 4-digit ints and reports missing
    // sequences between the lowest supplied (0000) and the maximum (0003).
    // Supplied: 0000, 0002, 0003 → gap is 0001.
    const res = await request(makeApp())
      .post('/api/ectd/export/42/validate')
      .send({
        leaves: [fdaLeaf()],
        priorSequenceNumbers: ['0000', '0002'],
        sequenceNumber: '0003',
        submissionType: 'IND',
      });

    expect(res.status).toBe(200);
    expect(res.body.coverage).toEqual({
      ranZipValidator: false,
      ranLeafValidator: true,
    });

    const gapFindings = (res.body.findings as Array<{ code: string; message: string }>).filter(
      f => f.code === 'SEQUENCE_GAP',
    );
    expect(gapFindings.length).toBeGreaterThanOrEqual(1);
    // Message must reference the missing 0001 sequence specifically.
    expect(gapFindings.some(f => /0001/.test(f.message))).toBe(true);
  });
});

describe('POST /api/ectd/validate/preflight', () => {
  it('case 4: valid leaf array → leaf-only ValidationResult', async () => {
    // Happy path. A single FDA-regional leaf with region=FDA should pass
    // the regional-rule check; we still expect a well-formed envelope
    // with coverage flags signaling leaf-only.
    const res = await request(makeApp())
      .post('/api/ectd/validate/preflight')
      .send({
        leaves: [fdaLeaf()],
        region: 'FDA',
        submissionType: 'IND',
      });

    expect(res.status).toBe(200);
    expect(res.body.submissionId).toBeNull(); // preflight is not bound to a numeric id
    expect(res.body.mode).toBe('leaf-preflight');
    expect(res.body.coverage).toEqual({
      ranZipValidator: false,
      ranLeafValidator: true,
    });
    // leafValidation present; the response envelope omits zipValidation.
    expect(res.body.leafValidation).toBeDefined();
    expect(res.body.leafValidation).toHaveProperty('valid');
    expect(res.body.leafValidation).toHaveProperty('findings');
    expect(res.body.leafValidation).toHaveProperty('summary');
    expect(res.body.zipValidation).toBeUndefined();

    // All findings (if any) must carry the leaf source tag.
    for (const f of res.body.findings as Array<{ source: string }>) {
      expect(f.source).toBe('leaf');
    }

    // No ZIP work is done in preflight.
    expect(hoisted.assembleSubmissionEctd).not.toHaveBeenCalled();
    expect(hoisted.validateEctdPackage).not.toHaveBeenCalled();
  });

  it('case 5: authenticated principal WITHOUT organizationId → 403 (route uses requireTenant)', async () => {
    // The brief asked for "without organizationId returns 400" but the
    // route's requireTenant() emits 403 for authenticated-but-no-org by
    // design (and 401 for unauthenticated). Asserting the LIVE contract
    // here; documented in the API-gaps notes returned by this test file.
    const res = await request(makeApp({ userWithoutOrg: true }))
      .post('/api/ectd/validate/preflight')
      .send({
        leaves: [fdaLeaf()],
        region: 'FDA',
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Organization context required' });
  });

  it('case 6: invalid region string ("XX") → 400 from zod enum guard', async () => {
    const res = await request(makeApp())
      .post('/api/ectd/validate/preflight')
      .send({
        leaves: [fdaLeaf()],
        region: 'XX',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid preflight body/i);
    // zod's flattened error should mention the offending key.
    expect(JSON.stringify(res.body.details ?? {})).toMatch(/region/);
  });
});
