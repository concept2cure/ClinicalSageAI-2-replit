/**
 * What a departing tenant's full export carries so the customer can show an
 * inspector that the copy is whole: the integrity verdict of each hash chain
 * its records sit on, and the manifest of each signature (P-58, D6,
 * 2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * The export returns every row as stored. That is the data, not the proof: a
 * signature row whose §11.200 hash no longer matches its manifest, or a ledger
 * with a gap, reads the same in a JSON dump as a whole one. So the export also
 * states, computed at the moment it is taken and inside its digest:
 *
 *   - the tenant's audit ledger (audit_logs), which every governed signature's
 *     manifest cites by its chain hash: the platform's one verifier,
 *     verifyTenantChainOnAdminScope (services/audit/tenant-chain-verdict.ts),
 *     on the platform scope, so a legacy row linked to the global head is not
 *     read as a break;
 *   - each immutable report's seal-event chain (report_seal_events): the link
 *     check the report engine's own verifier runs, called here, not copied
 *     (sealChainBreaks, intelligent-report-engine.ts, verifyReportIntegrity
 *     step 3), stored-link continuity only;
 *   - each electronic signature: its manifest as stored and whether the
 *     manifest's hash is its signature_hash, by manifestSignatureHash, the
 *     writer's own recipe (services/part11/signature-persistence.ts);
 *   - each stage-gate approval's signature hash, stated UNVERIFIABLE: no writer
 *     in this codebase records how it was computed.
 *
 * Nothing here is a figure a model produced: every verdict is computed by the
 * code above from the rows. A chain whose verdict cannot be computed is
 * UNAVAILABLE, and the export then names it in coverage.tablesFailed, so its
 * receipt is not recorded and it cannot authorize a purge
 * (recordExportReceipt): an export without its verdicts is not a whole copy.
 *
 * @module server/services/tenant-export/held-record-integrity
 */
import type { Pool, PoolClient } from 'pg';
import { manifestSignatureHash } from '../part11/signature-persistence';
import type { TenantFullExport } from './tenant-full-export.service';

/** What each verdict checks, and what it does not. Travels inside the export, so the scope cannot be detached from the verdict. */
export const INTEGRITY_METHOD = Object.freeze({
  audit_logs: 'Every chained audit_logs row of the tenant, re-derived and linked by the platform verifier (verifyAuditChain), and the anchored head (verifyChainHead). NOT_VERIFIED means the walk held but the anchor could not be read.',
  report_seal_events: "Per immutable report, each seal event's stored previous_event_hash equals the prior event's stored chain_hash. No hash is re-derived from an event's fields.",
  electronic_signatures: "Each signature's manifest as stored, and whether sha256 over its JSON (manifestSignatureHash, the writer's recipe) equals signature_hash (§11.200). The content binding is the manifest's bound digest, as recorded; the signed content is not re-read here.",
  gate_approvals: 'The signature hash of each stage-gate approval, as stored. No writer records its recipe, so it cannot be re-derived: UNVERIFIABLE, never VERIFIED.',
});

export type ChainVerdictName = 'INTACT' | 'BROKEN' | 'EMPTY' | 'NOT_VERIFIED' | 'UNAVAILABLE';

export interface ChainVerdict {
  /** The chain, or (UNAVAILABLE only) the signature store whose verdicts could not be read. */
  chain: 'audit_logs' | 'report_seal_events' | 'electronic_signatures' | 'gate_approvals';
  verdict: ChainVerdictName;
  /** Entries walked. */
  entries: number;
  /** Where the first break is, when there is one. */
  brokenAt?: unknown;
  /** Per report, for the seal-event chains. */
  reports?: Array<{ reportId: number; events: number; verdict: ChainVerdictName; brokenAtEventId?: number }>;
  /** Why a verdict is NOT_VERIFIED or UNAVAILABLE, in words. */
  detail?: string;
}

export interface SignatureManifestVerdict {
  id: number;
  signedTarget: string | null;
  signatureType: string | null;
  meaning: string | null;
  signerId: number;
  signedAt: string | null;
  bindingBasis: string | null;
  boundPayloadDigest: string | null;
  signatureHash: string;
  /** manifestSignatureHash over the stored manifest. */
  manifestSha256: string;
  hashIntegrity: 'VERIFIED' | 'COMPROMISED';
  status: 'valid' | 'superseded' | 'revoked' | 'voided' | 'invalid';
  manifest: unknown;
}

export interface ExportIntegrity {
  schemaVersion: '1.0';
  method: typeof INTEGRITY_METHOD;
  chains: ChainVerdict[];
  signatures: SignatureManifestVerdict[];
  gateApprovals: Array<{ id: number; approvalId: string; meaning: string | null; signatureHash: string; hashIntegrity: 'UNVERIFIABLE' }>;
}

/** The one verifier's result, as verifyTenantChainOnAdminScope returns it. */
export type LedgerVerifier = (organizationId: number) => Promise<{
  ok: boolean | null;
  rowsChecked: number;
  /** Why `ok` is null when the walk could not read every chained row (P-72 slice 1b). */
  reason?: string;
  brokenAt?: unknown;
  head?: { status: string; reason?: string | null };
}>;

type Db = Pool | PoolClient;
/** Rows read per store, as the export caps a table; more and the verdict is UNAVAILABLE rather than partial. */
const MAX_ROWS = 50_000;

async function defaultLedgerVerifier(organizationId: number) {
  const { verifyTenantChainOnAdminScope } = await import('../audit/tenant-chain-verdict');
  return verifyTenantChainOnAdminScope(organizationId);
}

/** A table this deployment lacks is not a failure: it holds nothing to verify. */
const absent = (error: unknown) => ['42P01', '42703'].includes(String((error as { code?: unknown })?.code ?? ''));
const failure = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

async function ledgerVerdict(organizationId: number, verify: LedgerVerifier): Promise<ChainVerdict> {
  try {
    const walk = await verify(organizationId);
    if (walk.ok === false) return { chain: 'audit_logs', verdict: 'BROKEN', entries: walk.rowsChecked, brokenAt: walk.brokenAt ?? walk.head ?? null };
    if (walk.ok === null) {
      return { chain: 'audit_logs', verdict: 'NOT_VERIFIED', entries: walk.rowsChecked, detail: walk.reason ?? walk.head?.reason ?? 'The anchored head could not be read.' };
    }
    return { chain: 'audit_logs', verdict: walk.rowsChecked === 0 ? 'EMPTY' : 'INTACT', entries: walk.rowsChecked };
  } catch (error) {
    return { chain: 'audit_logs', verdict: 'UNAVAILABLE', entries: 0, detail: failure(error) };
  }
}

/** verifyReportIntegrity step 3's link check (sealChainBreaks), for every report of the tenant. */
async function sealChains(db: Db, organizationId: number): Promise<ChainVerdict | null> {
  let rows: Array<{ report_id: number; id: number; chain_hash: string | null; previous_event_hash: string | null }>;
  try {
    ({ rows } = await db.query(
      `SELECT report_id, id, chain_hash, previous_event_hash FROM report_seal_events
        WHERE organization_id = $1 ORDER BY report_id, created_at, id LIMIT $2`,
      [organizationId, MAX_ROWS + 1],
    ));
  } catch (error) {
    if (absent(error)) return null;
    return { chain: 'report_seal_events', verdict: 'UNAVAILABLE', entries: 0, detail: failure(error) };
  }
  if (rows.length > MAX_ROWS) return { chain: 'report_seal_events', verdict: 'UNAVAILABLE', entries: rows.length, detail: `More than ${MAX_ROWS} seal events.` };
  const { sealChainBreaks } = await import('../intelligent-report-engine');
  const reports = new Map<number, Array<{ id: number; previousEventHash: string | null; chainHash: string | null }>>();
  for (const e of rows) {
    const events = reports.get(e.report_id) ?? [];
    events.push({ id: e.id, previousEventHash: e.previous_event_hash, chainHash: e.chain_hash });
    reports.set(e.report_id, events);
  }
  const each = [...reports].map(([reportId, events]) => {
    const [brokenAtEventId] = sealChainBreaks(events);
    return {
      reportId, events: events.length, verdict: (brokenAtEventId === undefined ? 'INTACT' : 'BROKEN') as ChainVerdictName,
      ...(brokenAtEventId === undefined ? {} : { brokenAtEventId }),
    };
  });
  const verdict: ChainVerdictName = each.length === 0 ? 'EMPTY' : each.some((r) => r.verdict === 'BROKEN') ? 'BROKEN' : 'INTACT';
  return { chain: 'report_seal_events', verdict, entries: rows.length, reports: each };
}

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

function signatureStatus(r: Record<string, unknown>): SignatureManifestVerdict['status'] {
  if (r.superseded_by != null) return 'superseded';
  if (r.verification_status === 'revoked' || r.verification_status === 'voided') return r.verification_status;
  return r.is_valid === false ? 'invalid' : 'valid';
}

/** Each signature of the tenant with its manifest and the §11.200 hash verdict. Null when the table is absent. */
async function signatureManifests(db: Db, organizationId: number): Promise<SignatureManifestVerdict[] | null> {
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await db.query(
      `SELECT id, signed_target, signature_type, signature_meaning, signer_id, signed_at, binding_basis, bound_payload_digest,
              signature_hash, signature_manifest, is_valid, verification_status, superseded_by
         FROM electronic_signatures WHERE organization_id = $1 ORDER BY id LIMIT $2`,
      [organizationId, MAX_ROWS + 1],
    ));
  } catch (error) {
    if (absent(error)) return null;
    throw error;
  }
  if (rows.length > MAX_ROWS) throw new Error(`More than ${MAX_ROWS} signatures.`);
  return rows.map((r) => {
    const manifestSha256 = manifestSignatureHash(r.signature_manifest);
    return {
      id: Number(r.id),
      signedTarget: (r.signed_target as string | null) ?? null,
      signatureType: (r.signature_type as string | null) ?? null,
      meaning: (r.signature_meaning as string | null) ?? null,
      signerId: Number(r.signer_id),
      signedAt: iso(r.signed_at),
      bindingBasis: (r.binding_basis as string | null) ?? null,
      boundPayloadDigest: (r.bound_payload_digest as string | null) ?? null,
      signatureHash: String(r.signature_hash),
      manifestSha256,
      hashIntegrity: manifestSha256 === r.signature_hash ? 'VERIFIED' : 'COMPROMISED',
      status: signatureStatus(r),
      manifest: r.signature_manifest ?? null,
    };
  });
}

async function gateApprovals(db: Db, organizationId: number): Promise<ExportIntegrity['gateApprovals'] | null> {
  try {
    const { rows } = await db.query(
      `SELECT id, approval_id, signature_meaning, signature_hash FROM gate_approvals WHERE organization_id = $1 ORDER BY id`,
      [organizationId],
    );
    return rows.map((r) => ({
      id: Number(r.id), approvalId: String(r.approval_id), meaning: r.signature_meaning ?? null,
      signatureHash: String(r.signature_hash), hashIntegrity: 'UNVERIFIABLE' as const,
    }));
  } catch (error) {
    if (absent(error)) return null;
    throw error;
  }
}

/** A store's entries, or an UNAVAILABLE verdict naming it when they cannot be read. */
async function readOrRefuse<T>(chains: ChainVerdict[], chain: ChainVerdict['chain'], read: () => Promise<T[] | null>): Promise<T[]> {
  try {
    return (await read()) ?? [];
  } catch (error) {
    chains.push({ chain, verdict: 'UNAVAILABLE', entries: 0, detail: failure(error) });
    return [];
  }
}

/** The integrity section for one tenant, read on the export's own client (the ledger on the platform scope). */
export async function exportIntegrity(db: Db, organizationId: number, verifyLedger: LedgerVerifier = defaultLedgerVerifier): Promise<ExportIntegrity> {
  const chains: ChainVerdict[] = [await ledgerVerdict(organizationId, verifyLedger)];
  const seals = await sealChains(db, organizationId);
  if (seals) chains.push(seals);
  const signatures = await readOrRefuse(chains, 'electronic_signatures', () => signatureManifests(db, organizationId));
  const approvals = await readOrRefuse(chains, 'gate_approvals', () => gateApprovals(db, organizationId));
  return { schemaVersion: '1.0', method: INTEGRITY_METHOD, chains, signatures, gateApprovals: approvals };
}

/**
 * The export with its integrity section, as the full-export route hands it to
 * the customer (before the digest). An UNAVAILABLE verdict is named in
 * coverage.tablesFailed, so no receipt is recorded for it.
 */
export async function withIntegrity(
  db: Db,
  organizationId: number,
  payload: TenantFullExport,
  verifyLedger?: LedgerVerifier,
): Promise<TenantFullExport & { integrity: ExportIntegrity }> {
  const integrity = await exportIntegrity(db, organizationId, verifyLedger);
  const unavailable = integrity.chains.filter((c) => c.verdict === 'UNAVAILABLE');
  const tablesFailed = [
    ...(payload.coverage.tablesFailed ?? []),
    ...unavailable.map((c) => ({ table: `integrity:${c.chain}`, error: c.detail ?? 'The verdict could not be computed.' })),
  ];
  return { ...payload, coverage: { ...payload.coverage, tablesFailed }, integrity };
}
