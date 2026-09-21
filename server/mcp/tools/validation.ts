/**
 * Validation tools — deterministic structure checks.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage, callAnaHandler } from './runtime';
import { MCP_SCOPES } from '../config';

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const REGIONS = ['US', 'EU', 'JP', 'CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG', 'FDA', 'EMA', 'PMDA'] as const;

const leafInput = z.object({
  section_code: z.string().min(1).describe('CTD section code, e.g. m1.1, 2.5, 3.2.S.4.2'),
  title: z.string().min(1),
  file_path: z.string().min(1).describe('Package-relative path, e.g. m2/25-clin-over/clinical-overview.pdf'),
  checksum: z.string().default('').describe('MD5 of the leaf bytes when known'),
  operation: z.enum(['new', 'append', 'replace', 'delete']).default('new'),
  mime_type: z.string().default('application/pdf'),
  file_size: z.number().int().min(0).default(0),
});

export const validateEctdStructure = defineTool({
  name: 'c2c_validate_ectd_structure',
  title: 'Validate eCTD structure',
  description:
    'Deterministic eCTD structure validation (required sections, section codes, lifecycle operators, ' +
    'naming, checksums) by the platform’s eCTD validator. Pass sequence_id to validate a stored sequence’s ' +
    'real leaves, or leaves[] to validate a proposed structure. Also reports which external agency-grade ' +
    'validator this deployment has configured (Lorenz eValidator, the FDA-criteria fallback subset, or none): ' +
    'passing the built-in check is NOT equivalent to passing the agency validator.',
  inputSchema: {
    sequence_id: z.number().int().positive().optional(),
    leaves: z.array(leafInput).max(500).optional(),
    submission_type: z.string().max(10).default('IND').describe('IND, NDA, BLA, ANDA, MAA …'),
    region: z.enum(REGIONS).optional(),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'server/services/ectd/ectd4-validator.ts validatePackage + external-validator resolveExternalValidator',
  async run(input, ctx) {
    if (!input.sequence_id && !input.leaves) return refused('Provide sequence_id or leaves[].');
    const { validatePackage } = await import('../../services/ectd/ectd4-validator');
    type Leaf = Parameters<typeof validatePackage>[0][number];
    let leaves: Leaf[];
    let source: string;
    if (input.sequence_id) {
      const svc = await import('../../services/submission-service/submission-service');
      try {
        const rows = await svc.listLeaves(input.sequence_id, { organizationId: ctx.principal.organizationId });
        leaves = rows.map((l) => ({
          sectionCode: l.sectionCode,
          title: l.title,
          checksum: (l as { checksum?: string | null }).checksum ?? '',
          checksumType: 'md5' as const,
          operation: (['new', 'append', 'replace', 'delete'].includes(l.lifecycleOp) ? l.lifecycleOp : 'new') as Leaf['operation'],
          filePath: `${l.sectionCode.replace(/\./g, '/')}/${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 0,
        }));
        source = `sequence ${input.sequence_id} (${rows.length} stored leaves)`;
      } catch (err) {
        return refused(errorMessage(err));
      }
    } else {
      leaves = (input.leaves ?? []).map((l) => ({
        sectionCode: l.section_code,
        title: l.title,
        checksum: l.checksum,
        checksumType: 'md5' as const,
        operation: l.operation,
        filePath: l.file_path,
        mimeType: l.mime_type,
        fileSize: l.file_size,
      }));
      source = `${leaves.length} supplied leaves`;
    }
    const result = validatePackage(leaves, input.submission_type, input.region ? { region: input.region } : undefined);
    const { resolveExternalValidator } = await import('../../services/ectd/external-validator');
    let external: { name: string; configured: boolean };
    try {
      const v = await resolveExternalValidator();
      external = { name: v.name, configured: await v.isConfigured() };
    } catch (err) {
      external = { name: `unresolved (${errorMessage(err)})`, configured: false };
    }
    return ok(
      `${source}: ${result.valid ? 'VALID' : 'INVALID'} (score ${result.score}); ${result.summary.errors} error(s), ` +
        `${result.summary.warnings} warning(s); ${result.summary.sectionsPresent}/${result.summary.sectionsRequired} required sections present. ` +
        `External validator: ${external.name}${external.configured ? ' (configured)' : ' (NOT configured — agency-grade validation has not run)'}.`,
      { source, submissionType: input.submission_type, region: input.region ?? null, result, externalValidator: external },
    );
  },
});

const claimInput = z.object({
  id: z.string().min(1),
  metric: z.string().min(1).describe('What the claim measures, e.g. "primary endpoint responder rate"'),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  source: z.string().min(1).describe('Where the claim was made, e.g. "CSR §11.4.1", "Module 2.7.3 p.14"'),
  context: z.string().optional(),
});

export const sweepContradictions = defineTool({
  name: 'c2c_sweep_contradictions',
  title: 'Sweep claims for contradictions',
  description:
    'Deterministic contradiction/inconsistency sweep over a set of quantitative or categorical claims ' +
    'drawn from submission documents (same metric, conflicting values across sources). Runs the platform’s ' +
    'evidence-contradiction detector; no model is involved. Supply the claims you extracted with their ' +
    'source locations; the result lists conflicting pairs with severity.',
  inputSchema: {
    claims: z.array(claimInput).min(2).max(500),
    relative_tolerance: z.number().min(0).max(1).optional().describe('Numeric tolerance treated as agreement (e.g. 0.01 = 1%).'),
  },
  annotations: READ,
  scope: MCP_SCOPES.read,
  governed: false,
  implementation: 'AnA detect_evidence_contradictions → server/services/ana/evidence-contradiction-detector.ts',
  async run(input, ctx) {
    const outcome = await callAnaHandler(
      'detect_evidence_contradictions',
      { claims: input.claims, relativeTolerance: input.relative_tolerance },
      ctx,
    );
    if (outcome.kind === 'refused') return outcome;
    const d = outcome.data;
    const contradictions = Array.isArray(d.contradictions) ? (d.contradictions as unknown[]) : [];
    return ok(
      `${input.claims.length} claims swept; ${contradictions.length} contradiction(s) found.`,
      d,
    );
  },
});
