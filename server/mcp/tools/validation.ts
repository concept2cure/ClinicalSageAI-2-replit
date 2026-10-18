/**
 * Validation tools — deterministic structure checks.
 */

import { z } from 'zod';
import { defineTool, ok, refused, errorMessage, callAnaHandler } from './runtime';
import { MCP_SCOPES } from '../config';
import type { ExternalValidatorKind } from '../../services/ectd/external-validator/types';

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

/** Adapter discovery metadata only; never executes the selected validator. */
async function validationAdapterDiscovery() {
  const { resolveExternalValidator } = await import('../../services/ectd/external-validator');
  let selection: { name: string; kind: ExternalValidatorKind; adapterAvailable: boolean | null };
  try {
    const v = await resolveExternalValidator();
    const kind = ['external_engine', 'internal_subset', 'unavailable', 'unknown'].includes(v.kind) ? v.kind : 'unknown';
    const available = await v.isConfigured();
    selection = {
      name: v.name,
      kind: typeof available === 'boolean' ? kind : 'unknown',
      adapterAvailable: typeof available === 'boolean' ? available : null,
    };
  } catch (err) {
    selection = { name: `unresolved (${errorMessage(err)})`, kind: 'unknown', adapterAvailable: null };
  }
  // Keep `configured` for existing consumers, with external-only semantics.
  const configuredExternal = selection.kind === 'external_engine' && selection.adapterAvailable === true;
  const external = {
    ...selection,
    configuredExternal,
    configured: configuredExternal,
    execution: 'not_run' as const,
    ran: false,
    qualification: 'not_assessed' as const,
  };
  const adapterState = selection.kind === 'internal_subset'
    ? `internal subset; not an external validator; subset ${selection.adapterAvailable ? 'available' : 'not available'}`
    : selection.kind === 'external_engine'
      ? `external adapter path/endpoint ${configuredExternal ? 'configured' : 'not configured'}; licence and qualification not verified`
      : selection.kind === 'unavailable'
        ? 'no validation adapter available'
        : 'adapter discovery unresolved';
  return {
    external,
    summary: `Validation adapter: ${external.name} (${adapterState}; validation has not run for this package).`,
  };
}

export const validateEctdStructure = defineTool({
  name: 'c2c_validate_ectd_structure',
  title: 'Validate eCTD structure',
  description:
    'Deterministic eCTD structure validation (required sections, section codes, lifecycle operators, ' +
    'naming, checksums) by the platform’s eCTD validator. Pass sequence_id to validate a stored sequence’s ' +
    'real leaves, or leaves[] to validate a proposed structure. Also reports the selected validation adapter ' +
    'and its availability, without executing it. The FDA-criteria fallback is an internal subset, not an ' +
    'external validator. An external adapter’s configured path/endpoint does not establish its licence, ' +
    'qualified coverage, a completed validation run or agency acceptance.',
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
    const { external, summary: adapterSummary } = await validationAdapterDiscovery();
    return ok(
      `${source}: ${result.valid ? 'VALID' : 'INVALID'} (score ${result.score}); ${result.summary.errors} error(s), ` +
        `${result.summary.warnings} warning(s); ${result.summary.sectionsPresent}/${result.summary.sectionsRequired} required sections present. ` +
        adapterSummary,
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
