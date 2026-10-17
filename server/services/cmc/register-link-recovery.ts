/** Durable register→Module 3 reconciliation. Reuses every existing mapper/writer;
 * a reload checks stored content, never a browser receipt. Retry changes no
 * register fields, approval state or electronic signature. */
import * as canonical from '../cmc-write-through';
import { createSourceHash } from '../cmc-module3-compiler';
import { sourceLabel } from './source-evidence';
import { EXCIPIENT_ROLES, normalizeMaterialRole } from '../../../shared/cmc/material-scope';
import { MODULE3_WRITE_FAILED_WARNING, observeWriteThroughFailure, type Module3Linkage } from './link-to-module3';
import type { RequestSqlClient } from '../../db/requestDb';

type Row = Record<string, any>;
type Definition = {
  table: string; type: string | ((row: Row) => string);
  map: (row: Row) => Row;
  write: (orgId: number, projectId: string, recordId: string, row: Row, createdBy?: string) => Promise<canonical.WriteThroughOutcome>;
  tenantColumn?: 'tenant_id';
};
/** Fixed identifiers only. SQL identifiers and source payloads never come from a request. */
export const REGISTER_LINK_DEFINITIONS: Readonly<Record<string, Readonly<Definition>>> = Object.freeze({
  'drug-substances': { table: 'drug_substances', type: 'drug_substance', map: canonical.mapDrugSubstancePayload, write: canonical.writeThroughDrugSubstance },
  'drug-products': { table: 'drug_products', type: 'drug_product', map: canonical.mapDrugProductPayload, write: canonical.writeThroughDrugProduct },
  'analytical-methods': { table: 'analytical_methods', type: 'method', map: canonical.mapAnalyticalMethodPayload, write: canonical.writeThroughAnalyticalMethod },
  'stability-studies': { table: 'stability_studies', type: 'stability', map: canonical.mapStabilityPayload, write: canonical.writeThroughStabilityStudy },
  'qc-testing': { table: 'qc_testing', type: 'qc_result', map: canonical.mapQcTestingPayload, write: canonical.writeThroughQcTesting },
  specifications: { table: 'quality_specifications', type: 'specification', map: canonical.mapSpecificationPayload, write: canonical.writeThroughSpecification, tenantColumn: 'tenant_id' },
  'batch-records': { table: 'cmc_batch_records', type: 'batch', map: canonical.mapBatchRecordPayload, write: canonical.writeThroughBatchRecord },
  'change-control': { table: 'cmc_change_control', type: 'change_control', map: canonical.mapChangeControlPayload, write: canonical.writeThroughChangeControl },
  'comparability-studies': { table: 'cmc_comparability_assessments', type: 'comparability', map: canonical.mapComparabilityPayload, write: canonical.writeThroughComparability },
  'process-validation': { table: 'process_validation', type: 'process_validation', map: canonical.mapProcessValidationPayload, write: canonical.writeThroughProcessValidation },
  'container-closures': { table: 'cmc_container_closures', type: 'container_closure', map: canonical.mapContainerClosurePayload, write: canonical.writeThroughContainerClosure },
  'reference-standards': { table: 'cmc_reference_standards', type: 'reference_standard', map: canonical.mapReferenceStandardPayload, write: canonical.writeThroughReferenceStandard },
  'impurity-profiles': { table: 'cmc_impurity_profiles', type: 'impurity_profile', map: canonical.mapImpurityProfilePayload, write: canonical.writeThroughImpurityProfile },
  'dissolution-profiles': { table: 'cmc_dissolution_profiles', type: 'dissolution_profile', map: canonical.mapDissolutionProfilePayload, write: canonical.writeThroughDissolutionProfile },
  'material-specs': { table: 'cmc_material_specs', type: (row) => EXCIPIENT_ROLES.includes(normalizeMaterialRole(row.materialRole)) ? 'excipient' : 'raw_material_spec', map: canonical.mapMaterialSpecPayload, write: canonical.writeThroughMaterialSpec },
  'formulation-records': { table: 'cmc_formulation_records', type: 'formulation_record', map: canonical.mapFormulationRecordPayload, write: canonical.writeThroughFormulationRecord },
  'manufacturing-processes': { table: 'manufacturing_processes', type: 'manufacturing_process', map: canonical.mapManufacturingProcessPayload, write: canonical.writeThroughManufacturingProcess },
  'characterization-studies': { table: 'cmc_characterization_studies', type: 'characterization', map: canonical.mapCharacterizationStudyPayload, write: canonical.writeThroughCharacterizationStudy },
});
// Runtime immutability protects the identifier allowlist as well as its type.
for (const entry of Object.values(REGISTER_LINK_DEFINITIONS)) Object.freeze(entry);

/** PG rows get the same top-level camel-case aliases Drizzle supplies on save.
 * Keep Date values: JSONB-roundtripping timestamps would change their hash. */
export function registerRowAliases(row: Row): Row {
  const out = { ...row };
  for (const [key, value] of Object.entries(row)) out[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  return out;
}
function definition(key: string): Definition | null {
  return Object.prototype.hasOwnProperty.call(REGISTER_LINK_DEFINITIONS, key) ? REGISTER_LINK_DEFINITIONS[key] : null;
}
function sourceType(def: Definition, row: Row): string { return typeof def.type === 'string' ? def.type : def.type(row); }
function tenantValue(def: Definition, orgId: number): number | string { return def.tenantColumn ? String(orgId) : orgId; }

export interface RegisterLinkStatus {
  register: string; recordId: string; label: string;
  state: 'linked' | 'missing' | 'outdated' | 'unfiled'; retryable: boolean;
}

export async function listRegisterLinks(client: RequestSqlClient, organizationId: number, projectId: string): Promise<RegisterLinkStatus[]> {
  const sources = await client.query(
    `SELECT source_key, source_hash FROM cmc_source_objects WHERE organization_id = $1 AND project_id = $2 AND version = 1`,
    [organizationId, projectId],
  );
  const hashes = new Map(sources.rows.map((r) => [String(r.source_key), String(r.source_hash)]));
  const results: RegisterLinkStatus[] = [];
  for (const [register, def] of Object.entries(REGISTER_LINK_DEFINITIONS)) {
    const records = await client.query(
      `SELECT * FROM ${def.table} WHERE ${def.tenantColumn ?? 'organization_id'} = $1 AND (project_id::text = $2 OR project_id IS NULL) ORDER BY id`,
      [tenantValue(def, organizationId), projectId],
    );
    for (const raw of records.rows) {
      const row = registerRowAliases(raw);
      const type = sourceType(def, row);
      const key = `${type}:${row.id}`;
      const payload = def.map(row);
      const hash = hashes.get(key);
      const state = !row.projectId ? 'unfiled' : !hash ? 'missing' : hash === createSourceHash(payload) ? 'linked' : 'outdated';
      results.push({ register, recordId: String(row.id), label: sourceLabel(type, key, payload), state, retryable: state === 'missing' || state === 'outdated' });
    }
  }
  return results;
}

export class RegisterLinkRefusal extends Error {
  readonly status = 404;
  constructor() { super('The saved record is not filed under this program, so its Module 3 link was not retried.'); }
}

export async function retryRegisterLink(client: RequestSqlClient, args: { organizationId: number; projectId: string; register: string; recordId: string; userId: number }): Promise<Module3Linkage> {
  const def = definition(args.register);
  if (!def) throw new RegisterLinkRefusal();
  // Hold the stored row through canonical projection: a concurrent register
  // edit cannot replace its content while the retry publishes the old version.
  await client.query('BEGIN');
  try {
    const found = await client.query(
      `SELECT * FROM ${def.table} WHERE id::text = $1 AND ${def.tenantColumn ?? 'organization_id'} = $2 AND project_id::text = $3 FOR SHARE`,
      [args.recordId, tenantValue(def, args.organizationId), args.projectId],
    );
    if (!found.rows.length) throw new RegisterLinkRefusal();
    const row = registerRowAliases(found.rows[0]);
    const outcome = await def.write(args.organizationId, args.projectId, String(row.id), row, String(args.userId));
    await client.query('COMMIT');
    if (outcome.ok) return { module3Linked: true };
    observeWriteThroughFailure('retry_register_link', args.recordId, outcome.reason);
    return { module3Linked: false, module3Warning: MODULE3_WRITE_FAILED_WARNING };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
