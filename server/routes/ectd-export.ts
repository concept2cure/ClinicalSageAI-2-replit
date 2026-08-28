/**
 * eCTD Export API Route
 *
 * Provides endpoints for generating and downloading eCTD submission packages
 * as ZIP archives. Package generation runs on the CANONICAL generator —
 * `ectd/assemble-from-core` over the submission spine (submissions →
 * ectd_sequences → submission_leaves), driving the real regional packager
 * (ICH backbone, MD5 manifest, rendered PDF leaves). `:submissionId` is the
 * canonical submissions.id; a submission with no sequence or no placed leaves
 * is an honest refusal, never a placeholder package.
 *
 * Endpoints:
 *   POST /api/ectd/export/:submissionId        — Generate & download eCTD package
 *   POST /api/ectd/export/:submissionId/validate — Validate an existing package
 *                                                  (ZIP-level + leaf-level merged)
 *   POST /api/ectd/export/validate/preflight   — Leaf-level-only preflight on an
 *                                                  in-memory ECTDLeaf[] (no ZIP).
 *                                                  Mounted at /api/ectd/validate/preflight
 *                                                  via preflightRouter (see exports).
 *
 * @module server/routes/ectd-export
 * @compliance ICH eCTD v3.2.2
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { assembleSubmissionEctd } from '../services/ectd/assemble-from-core';
import { validateEctdPackage } from '../services/submission-gateways/ectd-structural-validator';
import { EctdCompletenessError } from '../services/ectd/completeness';
import {
  validatePackage as validateEctdLeafPackage,
  type ECTDLeaf,
  type ValidationFinding,
  type ValidationResult as LeafValidationResult,
} from '../services/ectd/ectd4-validator';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import {
  applyExportGovernanceHeaders,
  evaluateExportGovernance,
} from '../services/export/exportReviewGate';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('ectd-export');

/**
 * Cap on the decoded ZIP buffer accepted by /validate. 200 MB decoded is a
 * generous-but-bounded ceiling for an eCTD package; base64-encoded that is
 * ~280 MB on the wire, which the schema enforces via .max() before the
 * Buffer.from() decode. The cap protects against caller-driven memory
 * pressure / DoS when an authenticated user submits an arbitrarily large
 * body. Keep this in sync with any global express.json limit.
 */
const MAX_ZIP_DECODED_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_BASE64_LENGTH = Math.ceil((MAX_ZIP_DECODED_BYTES * 4) / 3);

/**
 * Resolve the tenant org id from the JWT-bound request. Returns null if no
 * organization context is present; callers must fail-closed (403) before
 * touching regulated content.
 */
function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).user?.organizationId ?? (req as any).tenantContext?.organizationId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Distinguish unauthenticated (no JWT principal at all) from
 * authenticated-but-missing-org. 401 for the former, 403 for the latter — per
 * HTTP semantics.
 */
function requireTenant(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

/**
 * Map a thrown service-layer error to the appropriate HTTP status and a
 * generic, leak-free client message. The detailed error is returned via a
 * correlation id that is also written to the structured log, so support can
 * pivot from a client report to the log row without exposing implementation
 * details (DB exceptions, file paths, validator stacks) to the caller.
 */
function classifyError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  // Region-unsupported is thrown by the canonical region mapper with a stable
  // prefix (core-to-packager toPackagerRegion).
  if (/does not support region|Unsupported region/i.test(raw)) {
    return {
      status: 400,
      code: 'REGION_UNSUPPORTED',
      message: 'Requested eCTD region is not supported',
    };
  }
  // A caller-requested region contradicting the sequence's recorded region is
  // refused by assembleSubmissionEctd — an actionable conflict, not a 500.
  if (/does not match the sequence's recorded region/i.test(raw)) {
    return {
      status: 409,
      code: 'REGION_MISMATCH',
      message: raw,
    };
  }
  if (/not found|no such|does not exist/i.test(raw)) {
    return {
      status: 404,
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Submission (or its eCTD sequence) not found for the current organization',
    };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'eCTD operation failed',
  };
}

/**
 * The acting user's numeric id from the JWT principal — required for the
 * canonical assembler's audit attribution. Callers run after requireTenant, so
 * a principal exists; a principal without a usable id falls back to 0 (the
 * audit row still carries the org).
 */
function actingUserId(req: Request): number {
  const user = (req as any).user;
  const n = Number(user?.id ?? user?.userId);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Wrap a raw ZIP-validator error/warning string into the leaf validator's
 * ValidationFinding shape so the merged `findings` array has a single schema.
 * The synthetic `code` (ZIP_ERROR / ZIP_WARNING) and stable id-per-index let
 * the UI render zip-side findings in the same table as leaf-side findings.
 */
function zipStringToFinding(
  raw: string,
  severity: 'error' | 'warning',
  index: number,
): ValidationFinding & { source: 'zip' } {
  return {
    id: `zip-${severity}-${index}`,
    severity,
    code: severity === 'error' ? 'ZIP_ERROR' : 'ZIP_WARNING',
    sectionCode: '',
    message: raw,
    fix: '',
    rule: 'ectd-zip-structural',
    source: 'zip',
  };
}

/**
 * Fire-and-forget audit for eCTD content access. 21 CFR Part 11
 * §11.10(e) requires every view / generation of regulated submission
 * content to be logged with attribution. Non-fatal on failure — the
 * response stream is the user value, the audit row is the regulator
 * value.
 */
async function auditEctdAccess(
  req: Request,
  organizationId: number,
  // resourceId is string | number so preflight (which is not bound to a
  // numeric submission id) can pass a distinct sentinel like 'preflight'
  // instead of polluting submissionId=0 across all tenants.
  submissionId: number | string,
  action:
    | 'ectd_export_generated'
    | 'ectd_export_previewed'
    | 'ectd_export_validated'
    | 'ectd_export_preflight_validated',
  details: Record<string, unknown> = {},
  // Allow preflight to use a distinct resourceType so dashboards can group
  // by resourceType without colliding with real submissions.
  resourceType: 'ectd_submission' | 'ectd_preflight' = 'ectd_submission',
): Promise<void> {
  const user = (req as any).user;

  const ectdAudit = await auditService.logAction({
    tenantId: organizationId,
    userId: user?.id ?? user?.userId,
    action,
    resourceType,
    resourceId: String(submissionId),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
    details,
  });
  if (!ectdAudit.persisted) {
    log.warn('eCTD audit write failed (non-fatal)', {
      err: ectdAudit.error ?? 'no durable store accepted the row',
      action,
      submissionId,
    });
  }
}

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Leaf-level validator request schemas (Phase 1 ectd4-validator surface)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirror of the runtime ECTDLeaf shape from ectd4-validator. Optional fields
 * are kept optional so callers can post the minimum a leaf-only preflight
 * needs (sectionCode + filePath + checksum). Buffer is intentionally NOT
 * accepted over the wire — leaf-level MD5 verification needs a Buffer, which
 * we don't carry through JSON; the validator falls back to declared-checksum
 * structural checks when no buffer is attached.
 */
const ectdLeafSchema = z.object({
  sectionCode: z.string().min(1),
  title: z.string(),
  checksum: z.string(),
  checksumType: z.literal('md5').default('md5'),
  operation: z.enum(['new', 'append', 'replace', 'delete']),
  lifecycleOperator: z.string().optional(),
  filePath: z.string().min(1),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  studyId: z.string().optional(),
  lifecycleTarget: z.string().optional(),
});

const leafValidatorOptionsSchema = z.object({
  region: z.enum(['FDA', 'EMA', 'PMDA']).optional(),
  priorSequenceNumbers: z.array(z.string()).optional(),
  sequenceNumber: z.string().optional(),
  priorLeafIds: z.array(z.string()).optional(),
  submissionType: z.string().optional(),
});

const preflightBodySchema = z.object({
  leaves: z.array(ectdLeafSchema),
  region: z.enum(['FDA', 'EMA', 'PMDA']).optional(),
  priorSequenceNumbers: z.array(z.string()).optional(),
  sequenceNumber: z.string().optional(),
  priorLeafIds: z.array(z.string()).optional(),
  submissionType: z.string().optional(),
});

/**
 * Map a parsed body into the options object validatePackage expects, including
 * the priorLeafIds Set<string> conversion.
 */
function buildLeafValidatorOptions(parsed: z.infer<typeof leafValidatorOptionsSchema>): {
  region?: 'FDA' | 'EMA' | 'PMDA';
  priorSequenceNumbers?: string[];
  sequenceNumber?: string;
  priorLeafIds?: Set<string>;
} {
  const out: {
    region?: 'FDA' | 'EMA' | 'PMDA';
    priorSequenceNumbers?: string[];
    sequenceNumber?: string;
    priorLeafIds?: Set<string>;
  } = {};
  if (parsed.region) out.region = parsed.region;
  if (parsed.priorSequenceNumbers) out.priorSequenceNumbers = parsed.priorSequenceNumbers;
  if (parsed.sequenceNumber !== undefined) out.sequenceNumber = parsed.sequenceNumber;
  // Set conversion is dedup-by-design — duplicates in the input array are
  // collapsed and array order is NOT preserved. The validator only uses the
  // `.has(target)` membership semantics for lifecycle-target reference
  // checks (ectd4-validator.ts:421-428), so dedup + unordered is the
  // intended contract.
  if (parsed.priorLeafIds) out.priorLeafIds = new Set(parsed.priorLeafIds);
  return out;
}

/**
 * Thin adapter over the canonical export review gate
 * (server/services/export/exportReviewGate.ts). All decision logic — schema,
 * reviewer-attribution rule (INCOMPLETE_HUMAN_REVIEW), and the strict
 * environment gate (HUMAN_REVIEW_REQUIRED) — lives there; this only renders a
 * rejection into this router's flat `{ error, message?, details? }` bodies.
 */
function validateExportGovernance(req: Request, res: Response) {
  const evaluation = evaluateExportGovernance(req.body?.governance);
  if (!evaluation.ok) {
    if (evaluation.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: 'Invalid governance payload', details: evaluation.details });
    } else {
      res.status(evaluation.status).json({
        error: evaluation.code,
        message: evaluation.message,
        details: evaluation.details,
      });
    }
    return null;
  }

  applyExportGovernanceHeaders(res, evaluation.governance);
  return evaluation.governance;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ectd/export/:submissionId — Generate & download eCTD package
// ─────────────────────────────────────────────────────────────────────────────

// Body schema for the export route. The canonical core records the sequence's
// region and the submission's application type, so both are OPTIONAL here:
// `region` is a cross-check (a value contradicting the sequence's recorded
// region is refused with 409, never silently honored or ignored), and
// `submissionType` is accepted for wire-compat but the recorded application
// type is what the packager emits. `sequenceNumber` selects a specific
// sequence; omitted, the submission's latest sequence is exported.
const exportBodySchema = z
  .object({
    region: z.enum(['FDA', 'EMA', 'PMDA']).optional(),
    submissionType: z.string().optional(),
    sequenceNumber: z.string().optional(),
    applicationNumber: z.string().optional(),
    validateAfter: z.boolean().default(true),
    // Submission-grade gate: when true, the build is rejected (422) instead of
    // assembling a package with unmaterialized leaves or no content — so a
    // substantively-empty dossier can never be filed.
    requireComplete: z.boolean().default(false),
  })
  .passthrough(); // governance + future fields ride through untouched

router.post('/:submissionId', async (req: Request, res: Response) => {
  const submissionId = parseInt(String(req.params.submissionId), 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  // SECURITY: org id from JWT only — the legacy `|| 1` fallback at the
  // end of the chain would have generated and emitted another tenant's
  // eCTD package when JWT context was missing. requireTenant returns 401
  // when no JWT principal is present (unauthenticated) and 403 when the
  // principal lacks an organizationId (authenticated-but-forbidden).
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  // Validate region up-front so an unsupported region returns 400 with a
  // helpful list instead of 500 from resolveEctdRegion().
  const parsedBody = exportBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      error: 'Invalid export body',
      details: parsedBody.error.flatten(),
    });
  }
  const { region, sequenceNumber, applicationNumber, validateAfter, requireComplete } =
    parsedBody.data;

  if (!validateExportGovernance(req, res)) return;

  try {
    console.log(
      `[eCTD Export] Generating package for submission ${submissionId}, ` +
        `org ${organizationId}${region ? `, requested region ${region}` : ''}`
    );

    const result = await assembleSubmissionEctd({
      submissionId,
      organizationId,
      userId: actingUserId(req),
      region,
      sequenceNumber,
      applicationNumber,
      requireComplete,
    });

    // Optionally validate the generated package
    let validation = null;
    if (validateAfter) {
      validation = await validateEctdPackage(result.buffer);
    }

    // Fail closed: a package that FAILED structural validation must not be
    // returned as a downloadable attachment. Previously the only signal was the
    // X-ECTD-Valid response header — invisible to a script or human that simply
    // saves the 200 + zip and forwards it to a gateway. A caller that
    // deliberately wants the bytes despite errors can opt out with
    // validateAfter:false; the default (validateAfter:true) now blocks an
    // invalid package instead of shipping it.
    if (validation && !validation.valid) {
      return res.status(422).json({
        error: 'eCTD package failed structural validation and was not returned',
        code: 'ECTD_PACKAGE_INVALID',
        valid: false,
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 50),
        sequenceNumber: result.sequenceNumber,
        region: result.region,
      });
    }

    console.log(
      `[eCTD Export] Package generated: ${result.filename} ` +
        `(${result.stats.totalFiles} files, ${result.stats.totalGranules} rendered leaves)` +
        (validation ? ` — valid: ${validation.valid}` : '')
    );

    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-ECTD-Total-Modules', String(result.stats.totalModules));
    res.setHeader('X-ECTD-Total-Files', String(result.stats.totalFiles));
    res.setHeader('X-ECTD-Generated-At', result.stats.generatedAt);
    // Recorded identity of what was actually packaged (the core is authoritative).
    res.setHeader('X-ECTD-Sequence', result.sequenceNumber);
    res.setHeader('X-ECTD-Region', result.region);
    // Surface submission-completeness on every export (draft builds included) so
    // callers can see how much of the dossier is still placeholder content.
    const comp = result.stats.completeness;
    if (comp) {
      res.setHeader('X-ECTD-Completeness-Pct', String(comp.completenessPct));
      res.setHeader('X-ECTD-Incomplete-Leaves', String(comp.placeholderLeaves));
      res.setHeader('X-ECTD-Submission-Complete', String(comp.complete));
    }
    if (validation) {
      res.setHeader('X-ECTD-Valid', String(validation.valid));
      if (validation.errors.length > 0) {
        res.setHeader('X-ECTD-Validation-Errors', String(validation.errors.length));
      }
    }

    // Register governed export (fail-closed for regulated export path).
    // SECURITY: the org/user attribution on the export audit record
    // must be the JWT principal. requireTenant() already guaranteed an
    // organizationId at the top; we re-fetch the user object here for
    // the user.id required by the governance service.
    const user = (req as any).user;
    if (user?.id == null) {
      return res.status(403).json({ error: 'Tenant context required for governed export' });
    }
    /* The integrity hash must cover the PACKAGE, not the words describing it.
       Without `exportHash`, registerExportGovernanceQuick falls back to
       sha256(`${title}:${filename}:${size}`) — a digest over metadata, which
       cannot answer the only question a governed export record exists to
       answer: is this file the file that was exported. Two different packages
       of the same byte-length under the same name hash identically, and the
       delivered bytes are never covered at all.
       `result.buffer` is exactly what `res.send` returns below, so hashing it
       here binds the record to the artifact the agency receives. The same
       defect was fixed on the DOCX route (20dc3980b); this is the eCTD package,
       where it matters most. */
    const packageSha256 = createHash('sha256').update(result.buffer).digest('hex');
    const governanceResult = await registerExportGovernanceQuick({
      organizationId,
      projectId: submissionId,
      userId: Number(user.id),
      userName: user?.name || user?.email || 'unknown',
      title: `eCTD Package: ${result.filename}`,
      exportFormat: 'zip',
      exportFilename: result.filename,
      exportFileSize: result.buffer.length,
      exportHash: packageSha256,
      docType: 'ectd_package',
      backendRoute: `/api/ectd/export/${submissionId}`,
      ipAddress: req.ip,
    });
    if (!governanceResult) {
      return res.status(500).json({
        error: 'Governed export registration failed',
        code: 'EXPORT_GOVERNANCE_REQUIRED',
      });
    }

    // Audit the export BEFORE returning the buffer. Even if the
    // response stream fails downstream, the user-requested
    // generation is the §11.10(e) event we need to record.
    await auditEctdAccess(req, organizationId, submissionId, 'ectd_export_generated', {
      packageSizeBytes: result.buffer?.length,
      // Same digest as the governance record above, so the §11.10(e) event and
      // the export record identify one artifact rather than two descriptions.
      packageSha256,
      region: result.region,
      sequenceNumber: result.sequenceNumber,
    });

    return res.send(result.buffer);
  } catch (error: any) {
    // Submission-grade gate tripped: the dossier still has placeholder leaves or
    // no content. This is an expected, actionable rejection — not a server
    // failure — so return 422 with the exact unfinished sections.
    if (error instanceof EctdCompletenessError) {
      return res.status(422).json({
        error: 'eCTD package is not submission-complete',
        code: error.code,
        message: error.message,
        completeness: error.completeness,
      });
    }
    const correlationId = randomUUID();
    log.error('eCTD Export failed', {
      err: error instanceof Error ? error.message : String(error),
      correlationId,
      submissionId,
    });
    const classified = classifyError(error);
    return res.status(classified.status).json({
      error: 'eCTD package generation failed',
      code: classified.code,
      message: classified.message,
      correlationId,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ectd/export/:submissionId/validate — Validate an uploaded package
//
// Phase 1 surface extension: now runs BOTH the ZIP-level structural validator
// (ectd-structural-validator.validateEctdPackage) and the leaf-level validator
// (ectd4-validator.validatePackage) and merges their findings into a single
// response.
//
// Body content-type drives parsing:
//   • application/json → parsed by express.json. Body may contain:
//       { leaves?: ECTDLeaf[], region?, priorSequenceNumbers?, sequenceNumber?,
//         priorLeafIds?, submissionType?, zipBufferBase64? }
//     When `leaves` is present, leaf-level validation runs. When
//     `zipBufferBase64` is present, ZIP-level validation runs against the
//     decoded buffer. When neither is present, the route generates a fresh
//     package via the canonical assembler (assembleSubmissionEctd) and
//     validates it (legacy behavior).
//   • anything else → raw bytes streamed and treated as a ZIP buffer (legacy
//     behavior). Leaf-level validator is skipped in this mode because the
//     leaves payload is not available.
//
// Response shape:
//   { submissionId, valid, zipValidation?, leafValidation?, packageSize?, stats? }
//   where `valid` is the AND of both validators' valid flags.
// ─────────────────────────────────────────────────────────────────────────────

// JSON body schema for /validate. Extracted to a const so the same shape can
// be reused for "did the caller opt into the new validator surface" detection
// (presence of leaves / zipBufferBase64 / validator-options keys) — when none
// of those are present we treat the body as a legacy no-op envelope and
// preserve the original generate-then-validate behavior WITHOUT enforcing the
// strict schema. zipBufferBase64 is capped at MAX_ZIP_BASE64_LENGTH so an
// authenticated caller cannot OOM the process with an arbitrarily large body.
const validateJsonBodySchema = preflightBodySchema
  .partial({ leaves: true })
  .extend({
    zipBufferBase64: z.string().max(MAX_ZIP_BASE64_LENGTH).optional(),
  });

// Keys whose presence indicates the caller is intentionally driving the
// extended validator surface. If the body has none of these, legacy callers
// who posted incidental JSON (e.g. `{ region: 'foo' }`) get the legacy
// generate-then-validate behavior preserved.
const VALIDATOR_OPT_IN_KEYS = [
  'leaves',
  'zipBufferBase64',
  'priorSequenceNumbers',
  'sequenceNumber',
  'priorLeafIds',
  'submissionType',
];

router.post('/:submissionId/validate', async (req: Request, res: Response) => {
  const submissionId = parseInt(String(req.params.submissionId), 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  // SECURITY (defense-in-depth): tenant gate at the TOP so every downstream
  // branch — leaves-only, user-supplied buffer, generate-then-validate, raw
  // ZIP bytes — is gated identically. The previous layout only checked org
  // context inside specific sub-branches, leaving the leaves-only and
  // raw-non-empty-buffer paths reachable without an org claim. Failing
  // closed here also ensures the §11.10(e) audit row at the end is never
  // silently dropped for lack of attribution.
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  // Detect JSON mode. express.json (mounted globally on /api in startup
  // middleware) populates req.body for application/json requests; for any
  // other content-type req.body is the express default empty object.
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const isJson = ct.includes('application/json');

  // Holders for the two validators' outputs.
  let zipValidation: { valid: boolean; errors: string[]; warnings: string[] } | null = null;
  let leafValidation: LeafValidationResult | null = null;
  let zipBufferLength = 0;
  let generatedStats: unknown = undefined;
  let mode = 'unspecified';

  try {
    // ─── JSON mode: leaf-validator options + optional ZIP base64 ────────────
    if (isJson) {
      const rawBody = (req.body ?? {}) as Record<string, unknown>;
      const optedIn = VALIDATOR_OPT_IN_KEYS.some(
        k => Object.prototype.hasOwnProperty.call(rawBody, k),
      );

      if (!optedIn) {
        // Legacy contract: JSON body present but no extended-validator keys.
        // Preserve the old generate-then-validate behavior WITHOUT running
        // the strict zod parse, so callers who post incidental metadata
        // (e.g. `{ region: 'foo' }` or `{}`) do not regress to a 400.
        const result = await assembleSubmissionEctd({
          submissionId,
          organizationId,
          userId: actingUserId(req),
        });
        zipValidation = await validateEctdPackage(result.buffer);
        generatedStats = result.stats;
        mode = 'json-generated-then-validated-legacy';
      } else {
        const parsed = validateJsonBodySchema.safeParse(rawBody);
        if (!parsed.success) {
          return res.status(400).json({
            error: 'Invalid validate request body',
            details: parsed.error.flatten(),
          });
        }
        const body = parsed.data;
        const leafOpts = buildLeafValidatorOptions(body);

        // 1. Leaf-level validation. `leaves` being PRESENT (even empty) is
        //    an explicit request to run leaf validation; previously
        //    `leaves: []` silently escalated to a full package assembly
        //    which was both expensive and surprising. An empty array now
        //    runs the validator on [] and returns its (likely "missing
        //    required sections") findings.
        if (body.leaves !== undefined) {
          leafValidation = validateEctdLeafPackage(
            body.leaves as ECTDLeaf[],
            body.submissionType ?? 'IND',
            leafOpts,
          );
        }

        // 2. ZIP-level validation. Either decode the supplied base64 buffer
        //    or fall back to generate-then-validate when no buffer was
        //    supplied AND no leaves were supplied either.
        if (body.zipBufferBase64) {
          const zipBuffer = Buffer.from(body.zipBufferBase64, 'base64');
          // Defense-in-depth: the schema already caps the base64 length,
          // but the decoded buffer cap is the regulator-meaningful bound.
          if (zipBuffer.length > MAX_ZIP_DECODED_BYTES) {
            return res.status(413).json({
              error: 'eCTD ZIP exceeds maximum allowed size',
              code: 'PAYLOAD_TOO_LARGE',
              maxBytes: MAX_ZIP_DECODED_BYTES,
            });
          }
          zipBufferLength = zipBuffer.length;
          zipValidation = await validateEctdPackage(zipBuffer);
          mode = leafValidation
            ? 'json-user-supplied-buffer-and-leaves'
            : 'json-user-supplied-buffer';
        } else if (!leafValidation) {
          // No leaves AND no buffer → preserve legacy generate-then-validate.
          const result = await assembleSubmissionEctd({
            submissionId,
            organizationId,
            userId: actingUserId(req),
          });
          zipValidation = await validateEctdPackage(result.buffer);
          generatedStats = result.stats;
          mode = 'json-generated-then-validated';
        } else {
          mode = 'json-leaves-only';
        }
      }
    }

    // ─── Raw-bytes mode: legacy ZIP-buffer path ─────────────────────────────
    if (!isJson) {
      // Detect a stream that some upstream middleware has already drained.
      // If we attach `req.on('data')` on a body that has already ended, we
      // would silently collect zero bytes and fall through to the
      // generate-then-validate branch — meaning a caller who posted THEIR
      // ZIP for validation would get a freshly-generated package validated
      // and a misleading `valid: true`. Fail loudly instead.
      if (req.complete || req.readableEnded) {
        return res.status(400).json({
          error:
            'Request body was already consumed before /validate could read it. ' +
            'Ensure no upstream body-parser middleware is mounted for non-JSON ' +
            'content-types on this route.',
          code: 'RAW_BODY_DRAINED',
        });
      }

      const chunks: Buffer[] = [];
      let totalLength = 0;
      let overflow = false;
      req.on('data', (chunk: Buffer) => {
        totalLength += chunk.length;
        if (totalLength > MAX_ZIP_DECODED_BYTES) {
          overflow = true;
          return;
        }
        chunks.push(chunk);
      });
      await new Promise<void>((resolve, reject) => {
        req.on('end', resolve);
        req.on('error', reject);
      });

      if (overflow) {
        return res.status(413).json({
          error: 'eCTD ZIP exceeds maximum allowed size',
          code: 'PAYLOAD_TOO_LARGE',
          maxBytes: MAX_ZIP_DECODED_BYTES,
        });
      }

      const zipBuffer = Buffer.concat(chunks);
      zipBufferLength = zipBuffer.length;

      if (zipBuffer.length === 0) {
        // Top-level requireTenant() already enforced the org context for
        // this branch; we can safely assemble with the resolved organizationId.
        const result = await assembleSubmissionEctd({
          submissionId,
          organizationId,
          userId: actingUserId(req),
        });
        zipValidation = await validateEctdPackage(result.buffer);
        generatedStats = result.stats;
        mode = 'generated-then-validated';
      } else {
        zipValidation = await validateEctdPackage(zipBuffer);
        mode = 'user-supplied-buffer';
      }
    }

    // ─── Merge + audit + respond ────────────────────────────────────────────
    const ranZipValidator = zipValidation !== null;
    const ranLeafValidator = leafValidation !== null;

    // Defensive guard: if neither validator ran, refuse to return a
    // misleading `valid: true`. The flow above guarantees at least one runs
    // today, but a future refactor that accidentally skipped both would
    // otherwise silently report success.
    if (!ranZipValidator && !ranLeafValidator) {
      const correlationId = randomUUID();
      log.error('Validate produced no validator output', { correlationId, submissionId, mode });
      return res.status(500).json({
        error: 'eCTD validation failed',
        code: 'VALIDATOR_NOT_RUN',
        message: 'Neither the ZIP nor the leaf validator was invoked',
        correlationId,
      });
    }

    const zipValid = zipValidation ? zipValidation.valid : true;
    const leafValid = leafValidation ? leafValidation.valid : true;
    const valid = zipValid && leafValid;

    // Build a unified `findings` array with a `source` discriminator so
    // the UI can render zip-side and leaf-side findings in one table
    // without inspecting nested keys. Per-validator envelopes are still
    // attached for back-compat consumers that already parse them.
    const unifiedFindings: Array<ValidationFinding & { source: 'zip' | 'leaf' }> = [];
    if (zipValidation) {
      zipValidation.errors.forEach((e, i) =>
        unifiedFindings.push(zipStringToFinding(e, 'error', i)),
      );
      zipValidation.warnings.forEach((w, i) =>
        unifiedFindings.push(zipStringToFinding(w, 'warning', i)),
      );
    }
    if (leafValidation) {
      for (const f of leafValidation.findings) {
        unifiedFindings.push({ ...f, source: 'leaf' });
      }
    }

    // Aggregate summary computed server-side so UI doesn't have to sum
    // two different shapes.
    const summary = {
      errors: unifiedFindings.filter(f => f.severity === 'error').length,
      warnings: unifiedFindings.filter(f => f.severity === 'warning').length,
      infos: unifiedFindings.filter(f => f.severity === 'info').length,
      fromZip: unifiedFindings.filter(f => f.source === 'zip').length,
      fromLeaf: unifiedFindings.filter(f => f.source === 'leaf').length,
    };

    // Tenant org is guaranteed non-null by requireTenant() at top, so the
    // audit row is always written (no silent §11.10(e) drop).
    await auditEctdAccess(req, organizationId, submissionId, 'ectd_export_validated', {
      mode,
      valid,
      ranZipValidator,
      ranLeafValidator,
      findingsCount: unifiedFindings.length,
    });

    const response: Record<string, unknown> = {
      submissionId,
      valid,
      mode,
      coverage: { ranZipValidator, ranLeafValidator },
      findings: unifiedFindings,
      summary,
    };
    if (zipValidation) response.zipValidation = zipValidation;
    if (leafValidation) response.leafValidation = leafValidation;
    if (zipBufferLength > 0) response.packageSize = zipBufferLength;
    if (generatedStats !== undefined) response.stats = generatedStats;
    return res.json(response);
  } catch (error: any) {
    const correlationId = randomUUID();
    log.error('Validate failed', {
      err: error instanceof Error ? error.message : String(error),
      correlationId,
      submissionId,
    });
    const classified = classifyError(error);
    return res.status(classified.status).json({
      error: 'eCTD validation failed',
      code: classified.code,
      message: classified.message,
      correlationId,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ectd/validate/preflight — Leaf-level-only preflight
//
// Runs ONLY the leaf-level validator (ectd4-validator.validatePackage) against
// an in-memory ECTDLeaf[] supplied by the caller. No ZIP build, no DB read —
// intended as a UI gate that can flag missing required sections, bad
// filenames, lifecycle-target mismatches, and regional rule violations
// BEFORE the package is actually compiled.
//
// Mount: this handler lives on `preflightRouter`, which the bootstrap mounts
// at `/api/ectd`, giving the literal URL `/api/ectd/validate/preflight`.
// ─────────────────────────────────────────────────────────────────────────────

const preflightRouter = Router();

preflightRouter.post('/validate/preflight', async (req: Request, res: Response) => {
  // Tenant isolation: preserve the same JWT-bound pattern used by the ZIP
  // validate route. The preflight validator does not touch persisted data,
  // but accepting unauthenticated traffic on a regulated-flow endpoint
  // would be a §11.10(e) attribution gap. requireTenant returns 401 when
  // unauthenticated, 403 when authenticated-but-missing-org.
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  // Input validation. leaves MUST be an array per the schema; region MUST
  // be one of FDA/EMA/PMDA (z.enum enforces this); priorSequenceNumbers
  // and priorLeafIds MUST be arrays of strings.
  const parsed = preflightBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid preflight body',
      details: parsed.error.flatten(),
    });
  }

  const body = parsed.data;
  const leafOpts = buildLeafValidatorOptions(body);

  try {
    const result = validateEctdLeafPackage(
      body.leaves as ECTDLeaf[],
      body.submissionType ?? 'IND',
      leafOpts,
    );

    // Preflight is a regulated-flow view too — audit it under the JWT tenant.
    // Use a distinct action (`ectd_export_preflight_validated`) AND a distinct
    // resourceType (`ectd_preflight`) AND a non-numeric resourceId sentinel,
    // so dashboards that filter on (action, resourceType, resourceId) never
    // collide preflight rows with a real submissionId=0 or with rows from
    // the ZIP /validate path.
    await auditEctdAccess(
      req,
      organizationId,
      'preflight',
      'ectd_export_preflight_validated',
      {
        mode: 'leaf-preflight',
        leafCount: body.leaves.length,
        region: body.region,
        valid: result.valid,
      },
      'ectd_preflight',
    );

    // Build a unified findings array matching the /validate response shape so
    // a single UI parser can render both surfaces. Preflight runs ONLY the
    // leaf validator, so all findings carry `source: 'leaf'`.
    const unifiedFindings: Array<ValidationFinding & { source: 'leaf' }> =
      result.findings.map(f => ({ ...f, source: 'leaf' as const }));
    const summary = {
      errors: unifiedFindings.filter(f => f.severity === 'error').length,
      warnings: unifiedFindings.filter(f => f.severity === 'warning').length,
      infos: unifiedFindings.filter(f => f.severity === 'info').length,
      fromZip: 0,
      fromLeaf: unifiedFindings.length,
    };

    return res.json({
      // submissionId is null because preflight is not bound to a numeric
      // submission. Kept in the envelope for shape parity with /validate.
      submissionId: null,
      valid: result.valid,
      mode: 'leaf-preflight',
      coverage: { ranZipValidator: false, ranLeafValidator: true },
      findings: unifiedFindings,
      summary,
      leafValidation: result,
    });
  } catch (error: any) {
    const correlationId = randomUUID();
    log.error('Preflight failed', {
      err: error instanceof Error ? error.message : String(error),
      correlationId,
    });
    const classified = classifyError(error);
    return res.status(classified.status).json({
      error: 'eCTD preflight validation failed',
      code: classified.code,
      message: classified.message,
      correlationId,
    });
  }
});

export { preflightRouter };

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ectd/export/:submissionId/preview — Preview package structure
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:submissionId/preview', async (req: Request, res: Response) => {
  const submissionId = parseInt(String(req.params.submissionId), 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  // SECURITY: JWT-bound. The legacy chain that fell back to
  // `?organizationId=` and then to `|| 1` was a double IDOR: pre-auth
  // requests would generate an eCTD package for org 1, and post-auth
  // requests could target any org via the query string. requireTenant
  // emits 401 for unauthenticated / 403 for authenticated-but-no-org.
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  // Validate the optional ?region= query against the supported enum so an
  // unsupported region returns 400 from this route. The sequence's recorded
  // region is authoritative — a provided value is a cross-check (409 on
  // mismatch via classifyError), never a selector.
  const regionQuery = req.query.region as string | undefined;
  const regionParsed = z.enum(['FDA', 'EMA', 'PMDA']).optional().safeParse(regionQuery);
  if (!regionParsed.success) {
    return res.status(400).json({
      error: 'Unsupported region',
      code: 'REGION_UNSUPPORTED',
      supported: ['FDA', 'EMA', 'PMDA'],
    });
  }

  try {
    const result = await assembleSubmissionEctd({
      submissionId,
      organizationId,
      userId: actingUserId(req),
      region: regionParsed.data,
    });

    // Load the ZIP to list contents
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(result.buffer);
    const files = Object.keys(zip.files)
      .filter(f => !zip.files[f].dir)
      .sort();

    const folders = Object.keys(zip.files)
      .filter(f => zip.files[f].dir)
      .sort();

    await auditEctdAccess(req, organizationId, submissionId, 'ectd_export_previewed', {
      region: result.region,
      sequenceNumber: result.sequenceNumber,
      fileCount: files.length,
    });

    return res.json({
      submissionId,
      filename: result.filename,
      stats: result.stats,
      structure: {
        folders,
        files,
        totalFolders: folders.length,
        totalFiles: files.length,
      },
    });
  } catch (error: any) {
    const correlationId = randomUUID();
    log.error('Preview failed', {
      err: error instanceof Error ? error.message : String(error),
      correlationId,
      submissionId,
    });
    const classified = classifyError(error);
    return res.status(classified.status).json({
      error: 'eCTD preview failed',
      code: classified.code,
      message: classified.message,
      correlationId,
    });
  }
});

export default router;
