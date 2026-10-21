/**
 * @fileoverview Who recorded the records a Module 3 section is composed from.
 * @module server/services/cmc/register-operators
 *
 * ## Why this exists
 *
 * A Module 3 section's approval is a signature over content the platform
 * composed from register records. The question a quality unit asks of such a
 * signature is **"is the approver one of the people who entered the data?"**,
 * and until 2026-10-18 it could not be asked at all: no register table carried
 * an attribution column and the audit chain held no row for a register create
 * (`register-audit.ts`). It now does, so the question has an answer, and this
 * module is where it is read.
 *
 * The path is the section's own lineage, the same one the drift check walks:
 *
 *     cmc_module3_sections → cmc_section_lineage.source_object_id
 *                          → cmc_source_objects (source_type, source_key)
 *                          → audit_logs (action 'cmc.register.create')
 *
 * `cmc_source_objects.source_key` is always `'<source_type>:<record id>'`
 * (every `writeThroughX` in `services/cmc-write-through.ts` builds it that
 * way), and a `cmc.register.create` row carries the register and the record id
 * it wrote. So the join is the source type's register plus the record id.
 *
 * ## Fail closed, and say which record
 *
 * A cited record with **no** recorded operator is not "no conflict". It is a
 * record whose writer is unknown, and independence from an unknown writer
 * cannot be shown — the rule `services/governance/separation-of-duties.ts`
 * already applies to every other governed record type. So `unattributed`
 * names those records rather than letting them pass silently, and the caller
 * refuses with them in the message.
 *
 * In practice an unattributed record is one recorded **before** 2026-10-18.
 * CMC/Module 3 was refused to every organisation until the catalog flip of
 * 2026-10-12 (P-28), so that window is six days wide and contains no
 * production data; a development or demo database carrying older rows will see
 * the refusal, and the way out is to re-record those entries.
 */
import { CMC_REGISTER_CREATE, type CmcRegister } from './register-audit';
/* Type-only: the source-type vocabulary is the composer's, and importing it as
   a type keeps that module out of this one's runtime graph (this file is read
   by the governance service, which must stay cheap to load). */
import type { CmcSourceType } from '../module3Composer';

/** Where the lineage and the chain are read. The caller's transaction, normally. */
export interface OperatorReader {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Which register each canonical source type's records live in.
 *
 * `satisfies Record<CmcSourceType, CmcRegister>` is the point: a new canonical
 * source type does not compile until it names its register, so a section can
 * never cite records this module silently cannot attribute. The two material
 * source types (an excipient is §3.2.P.4 content, a raw or starting material is
 * §3.2.S.2.3) are one register, which is why the map is 19 → 18.
 */
export const REGISTER_BY_SOURCE_TYPE = {
  drug_substance: 'drug_substance',
  drug_product: 'drug_product',
  specification: 'specification',
  method: 'analytical_method',
  stability: 'stability_study',
  batch: 'batch_record',
  change_control: 'change_control',
  comparability: 'comparability_study',
  manufacturing_process: 'manufacturing_process',
  characterization: 'characterization_study',
  reference_standard: 'reference_standard',
  container_closure: 'container_closure',
  excipient: 'material_spec',
  process_validation: 'process_validation',
  raw_material_spec: 'material_spec',
  impurity_profile: 'impurity_profile',
  dissolution_profile: 'dissolution_profile',
  formulation_record: 'formulation_record',
  qc_result: 'qc_test',
} as const satisfies Record<CmcSourceType, CmcRegister>;

/** One record a section cites, and who is recorded as having entered it. */
export interface CitedRecord {
  sourceType: string;
  sourceKey: string;
  /** The register the record lives in, or null for a source type with none. */
  register: CmcRegister | null;
  recordId: string;
  /** Every operator the chain records for this record (normally one). */
  operatorIds: number[];
}

export interface SectionRecordOperators {
  /** The records the section's lineage cites, by source key. */
  cited: CitedRecord[];
  /** Distinct operators across every cited record, ascending. */
  operators: number[];
  /** Cited records with no recorded operator, named for the refusal. */
  unattributed: string[];
  /** Where the operators were read, for the refusal message and the audit. */
  sources: string[];
}

/** A uuid record id, which is how the change-proposal register is told apart. */
const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The change PROPOSAL register's operator, which lives in a column.
 *
 * `cmc_change_controls` (uuid ids, `services/cmc/cmc-change-control-service.ts`)
 * is a second change-control table beside `cmc_change_control` (serial ids, the
 * `/api/cmc/change-control` register). Both feed the one `change_control`
 * canonical source type, so a section can cite either. The proposal table has
 * carried `created_by` since it was written and its route sets it from the
 * session, so its operator IS recorded — just not where the chain keeps
 * everyone else's. A reader that ignored it would refuse an approval for want
 * of a fact the database holds. Found by the staff simulation on 2026-10-18:
 * §3.2.P.3 cited `change_control:9335db89-…` and nothing could name its writer.
 *
 * The query is written out rather than built from a table/column map, so no SQL
 * here is assembled from a value.
 */
async function changeProposalOperator(q: OperatorReader, orgId: number, recordId: string): Promise<number | null> {
  if (!UUID_ID.test(recordId)) return null;
  const r = await q.query(
    `SELECT created_by FROM cmc_change_controls WHERE id = $1::uuid AND organization_id = $2 LIMIT 1`,
    [recordId, orgId],
  );
  const id = Number(r.rows[0]?.created_by);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recordIdOf(sourceKey: string): string {
  const colon = sourceKey.indexOf(':');
  return colon === -1 ? sourceKey : sourceKey.slice(colon + 1);
}

function registerOf(sourceType: string): CmcRegister | null {
  return (REGISTER_BY_SOURCE_TYPE as Record<string, CmcRegister | undefined>)[sourceType] ?? null;
}

/**
 * The operators of the records a section cites, read on the caller's
 * connection so the answer is consistent with the section row it has locked.
 *
 * Throws on a read failure. A failed lookup is not an answer about who entered
 * the data and must never be read as one — the governance service turns it
 * into "could not verify" (503) rather than into "no conflict".
 */
export async function readSectionRecordOperators(
  q: OperatorReader,
  orgId: number,
  projectId: string,
  sectionKey: string,
): Promise<SectionRecordOperators> {
  const lineage = await q.query(
    `SELECT DISTINCT o.source_type AS "sourceType", o.source_key AS "sourceKey"
       FROM cmc_module3_sections s
       JOIN cmc_section_lineage l
         ON l.section_id = s.id AND l.organization_id = s.organization_id
       JOIN cmc_source_objects o
         ON o.id = l.source_object_id AND o.organization_id = s.organization_id
      WHERE s.organization_id = $1 AND s.project_id = $2 AND s.section_key = $3
      ORDER BY o.source_type, o.source_key`,
    [orgId, projectId, sectionKey],
  );

  const cited: CitedRecord[] = lineage.rows.map((row) => ({
    sourceType: String(row.sourceType),
    sourceKey: String(row.sourceKey),
    register: registerOf(String(row.sourceType)),
    recordId: recordIdOf(String(row.sourceKey)),
    operatorIds: [],
  }));
  if (cited.length === 0) return { cited, operators: [], unattributed: [], sources: [] };

  const attributable = cited.filter((c) => c.register !== null);
  if (attributable.length > 0) {
    const rows = await q.query(
      `SELECT a.record_id AS "recordId", a.new_values->>'register' AS register, a.actor_id AS "actorId"
         FROM audit_logs a
         JOIN unnest($2::text[], $3::text[]) AS p(register, record_id)
           ON p.register = a.new_values->>'register' AND p.record_id = a.record_id
        WHERE a.action = $1 AND a.tenant_id = $4 AND a.actor_id IS NOT NULL`,
      [
        CMC_REGISTER_CREATE,
        attributable.map((c) => c.register as string),
        attributable.map((c) => c.recordId),
        orgId,
      ],
    );
    for (const row of rows.rows) {
      const id = Number(row.actorId);
      if (!Number.isInteger(id) || id <= 0) continue;
      for (const c of cited) {
        if (c.register === row.register && c.recordId === String(row.recordId) && !c.operatorIds.includes(id)) {
          c.operatorIds.push(id);
        }
      }
    }
  }

  const sources = new Set<string>();
  if (cited.some((c) => c.operatorIds.length > 0)) sources.add('register entries (audit chain)');

  /* A record the chain does not name may still have a recorded operator in a
     column; the change-proposal register is the one that does. */
  for (const c of cited) {
    if (c.operatorIds.length > 0 || c.register !== 'change_control') continue;
    const fromColumn = await changeProposalOperator(q, orgId, c.recordId);
    if (fromColumn !== null) {
      c.operatorIds.push(fromColumn);
      sources.add('change proposals (created_by)');
    }
  }

  const operators = [...new Set(cited.flatMap((c) => c.operatorIds))].sort((a, b) => a - b);
  const unattributed = cited.filter((c) => c.operatorIds.length === 0).map((c) => c.sourceKey);
  return { cited, operators, unattributed, sources: [...sources].sort() };
}

/** Why independence cannot be shown, naming the records whose writer is unknown. */
export function unattributedRecordsRefusal(sectionKey: string, unattributed: readonly string[]): string {
  const NAMED = 5;
  const named = unattributed.slice(0, NAMED).join(', ');
  const more = unattributed.length - Math.min(NAMED, unattributed.length);
  return (
    `§${sectionKey} cites ${unattributed.length} record(s) with no recorded operator ` +
    `(${named}${more > 0 ? `, and ${more} more` : ''}), so this approval cannot be shown to be independent of ` +
    'whoever entered them. Nothing was signed. Those records were entered before the platform recorded who ' +
    'entered a register row (2026-10-18); re-record them, then approve.'
  );
}
