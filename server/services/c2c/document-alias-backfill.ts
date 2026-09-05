/**
 * Backfill of the document alias map for documents created before the
 * writers existed (ledger L10, the last step of Document Identity Contract
 * slice C2).
 *
 * One tenant per run, dry-run unless told to apply, and it never invents an
 * identity:
 *   - every authoring document is recorded as its own canonical alias (the
 *     authoring uuid IS the identity), plus its bound governed c2c document
 *     when the binding column carries one;
 *   - a coauthor row is aliased under an authoring document ONLY when its own
 *     metadata says it was taken from one (`source: 'authoring-document'`,
 *     `docId`) and that document exists in this organization. A row whose
 *     metadata names no source, or names a document this organization does
 *     not have, is left unaliased and reported — an alias is a claim about
 *     identity, and a guessed one is worse than a visible gap;
 *   - a row that cannot be recorded because it would fork an identity is
 *     reported, not forced.
 * Idempotent: a second run records nothing new and reports what it found.
 *
 * @module server/services/c2c/document-alias-backfill
 */

import {
  DocumentAliasConflictError,
  recordDocumentAlias,
  type AliasExecutor,
} from './document-alias-map.js';

export interface BackfillOptions {
  organizationId: number;
  /** Write rows. Without it the same analysis runs and nothing is written. */
  apply: boolean;
}

export interface BackfillReport {
  organizationId: number;
  apply: boolean;
  /** The alias migration has not been applied; nothing else was examined. */
  relationAbsent: boolean;
  authoring: {
    examined: number;
    /** Self aliases that would be (dry run) or were (apply) recorded. */
    toRecord: number;
    alreadyRecorded: number;
    /** Bound c2c documents recorded under the authoring uuid. */
    boundToRecord: number;
    boundAlreadyRecorded: number;
  };
  coauthor: {
    examined: number;
    toRecord: number;
    alreadyRecorded: number;
    /** metadata names no authoring source — left unaliased. */
    sourceless: number;
    /** metadata names an authoring document this organization does not have. */
    sourceMissing: Array<{ coauthorId: number; namedSource: string }>;
  };
  /** Rows that would fork an identity; reported and left alone. */
  forks: Array<{ store: string; nativeId: string; canonicalId: string; message: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tablePresent(exec: AliasExecutor, name: string): Promise<boolean> {
  const r = await exec.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${name}`]);
  return r.rows.length > 0 && Boolean(r.rows[0].present);
}

async function columnPresent(exec: AliasExecutor, table: string, column: string): Promise<boolean> {
  const r = await exec.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rows.length > 0;
}

async function existingAliases(exec: AliasExecutor, organizationId: number, store: string): Promise<Map<string, string>> {
  const r = await exec.query(
    `SELECT native_id, canonical_id FROM c2c_document_aliases WHERE organization_id = $1 AND store = $2`,
    [organizationId, store],
  );
  return new Map(r.rows.map((row) => [String(row.native_id), String(row.canonical_id).toLowerCase()]));
}

type Ref = { store: 'authoring_documents' | 'coauthor_documents' | 'c2c_documents'; nativeId: string; canonicalId: string };

export async function backfillDocumentAliases(exec: AliasExecutor, opts: BackfillOptions): Promise<BackfillReport> {
  if (!Number.isInteger(opts.organizationId) || opts.organizationId <= 0) {
    throw new Error('backfillDocumentAliases requires a positive organizationId (one tenant per run)');
  }
  const org = opts.organizationId;
  const report: BackfillReport = {
    organizationId: org,
    apply: opts.apply,
    relationAbsent: false,
    authoring: { examined: 0, toRecord: 0, alreadyRecorded: 0, boundToRecord: 0, boundAlreadyRecorded: 0 },
    coauthor: { examined: 0, toRecord: 0, alreadyRecorded: 0, sourceless: 0, sourceMissing: [] },
    forks: [],
  };
  if (!(await tablePresent(exec, 'c2c_document_aliases'))) {
    report.relationAbsent = true;
    return report;
  }

  const record: Record_ = async (ref, bucket) => {
    if (!opts.apply) {
      bucket.toRecord += 1;
      return;
    }
    try {
      const r = await recordDocumentAlias(exec, { organizationId: org, ...ref });
      if (r.recorded) bucket.toRecord += 1;
      else if (r.reason === 'already_recorded') bucket.alreadyRecorded += 1;
    } catch (error) {
      if (error instanceof DocumentAliasConflictError) {
        report.forks.push({ store: ref.store, nativeId: ref.nativeId, canonicalId: ref.canonicalId, message: error.message });
        return;
      }
      throw error;
    }
  };

  const authoringIds = await backfillAuthoring(exec, org, report, record);
  await backfillCoauthor(exec, org, report, record, authoringIds);
  return report;
}

type Bucket = { toRecord: number; alreadyRecorded: number };
type Record_ = (ref: Ref, bucket: Bucket) => Promise<void>;

/** authoring_documents: the uuid is the identity; a bound c2c document is the same document there. */
async function backfillAuthoring(exec: AliasExecutor, org: number, report: BackfillReport, record: Record_): Promise<Set<string>> {
  const authoringIds = new Set<string>();
  if (!(await tablePresent(exec, 'authoring_documents'))) return authoringIds;
  const hasBinding = await columnPresent(exec, 'authoring_documents', 'c2c_document_id');
  const rows = await exec.query(
    `SELECT id::text AS id${hasBinding ? ', c2c_document_id::text AS c2c_document_id' : ''}
       FROM authoring_documents WHERE tenant_id = $1 ORDER BY id`,
    [org],
  );
  const selfKnown = await existingAliases(exec, org, 'authoring_documents');
  const boundKnown = await existingAliases(exec, org, 'c2c_documents');
  for (const row of rows.rows) {
    const id = String(row.id).toLowerCase();
    if (!UUID_RE.test(id)) continue;
    authoringIds.add(id);
    report.authoring.examined += 1;
    const self: Ref = { store: 'authoring_documents', nativeId: id, canonicalId: id };
    if (selfKnown.get(id) === id) report.authoring.alreadyRecorded += 1;
    else if (selfKnown.has(id)) report.forks.push({ ...self, message: 'authoring document already recorded under another canonical id' });
    else await record(self, report.authoring);
    const bound = row.c2c_document_id == null ? '' : String(row.c2c_document_id);
    if (!bound) continue;
    const b: Ref = { store: 'c2c_documents', nativeId: bound, canonicalId: id };
    if (boundKnown.get(bound) === id) report.authoring.boundAlreadyRecorded += 1;
    else if (boundKnown.has(bound)) report.forks.push({ ...b, message: 'bound c2c document already recorded under another canonical id' });
    else {
      const bucket: Bucket = { toRecord: 0, alreadyRecorded: 0 };
      await record(b, bucket);
      report.authoring.boundToRecord += bucket.toRecord;
      report.authoring.boundAlreadyRecorded += bucket.alreadyRecorded;
    }
  }
  return authoringIds;
}

/** The authoring document a coauthor row's OWN metadata names, or '' when it names none. */
function namedAuthoringSource(metadata: unknown): string {
  if (metadata == null) return '';
  let meta: Record<string, unknown> | null;
  try {
    meta = JSON.parse(String(metadata)) as Record<string, unknown>;
  } catch {
    return '';
  }
  return meta && meta.source === 'authoring-document' && typeof meta.docId === 'string' ? meta.docId.toLowerCase() : '';
}

/** coauthor_documents: only what the row itself says it came from. */
async function backfillCoauthor(exec: AliasExecutor, org: number, report: BackfillReport, record: Record_, authoringIds: Set<string>): Promise<void> {
  if (!(await tablePresent(exec, 'coauthor_documents'))) return;
  const rows = await exec.query(
    `SELECT id::text AS id, metadata::text AS metadata FROM coauthor_documents WHERE organization_id = $1 ORDER BY id`,
    [org],
  );
  const known = await existingAliases(exec, org, 'coauthor_documents');
  for (const row of rows.rows) {
    report.coauthor.examined += 1;
    const nativeId = String(row.id);
    const named = namedAuthoringSource(row.metadata);
    if (!named) {
      report.coauthor.sourceless += 1;
      continue;
    }
    if (!authoringIds.has(named)) {
      report.coauthor.sourceMissing.push({ coauthorId: Number(nativeId), namedSource: named });
      continue;
    }
    const ref: Ref = { store: 'coauthor_documents', nativeId, canonicalId: named };
    if (known.get(nativeId) === named) report.coauthor.alreadyRecorded += 1;
    else if (known.has(nativeId)) report.forks.push({ ...ref, message: 'coauthor document already recorded under another canonical id' });
    else await record(ref, report.coauthor);
  }
}
