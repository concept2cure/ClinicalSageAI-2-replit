/** Actor-only V2 admission metadata history. Source removal does not rewrite
 * history; current canonical project access controls which history is visible. */
import { withAnaSourceReadScope } from '../vault/document-catalog-actor-access.js';
import { assertAnaSourceProgramAllowed, type AnaSourceReadScopeInput, type AdmittedAnaSourceReadScope } from './source-read-scope.js';
import { AnaProjectScopeError } from './project-scope-admission.js';
import { readSourceAdmissionReceiptRow, type SourceAdmissionReceiptQueryable } from './source-admission-receipt-store.js';
import type { SourceAdmissionReceiptV2 } from '../../../shared/ana/source-admission-receipts.js';

export interface SourceAdmissionReceiptHistoryOptions { documentId?: string; receiptId?: string; limit?: number }
export interface SourceAdmissionReceiptHistoryEntry {
  readonly descriptor: SourceAdmissionReceiptV2;
  readonly receiptSha256: string;
  readonly acceptedAt: string;
}
export interface SourceAdmissionReceiptHistoryPage {
  readonly receipts: readonly SourceAdmissionReceiptHistoryEntry[];
  readonly total: number;
  readonly withheld: number;
  readonly actorFiltered: true;
  readonly checkpoint: 'host_budget_admitted';
  readonly sourceUse: 'historical_admission_only';
  readonly providerDelivery: 'unestablished';
  readonly notice: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICE = 'This is the current actor’s historical host-budget admission metadata in currently accessible projects. It survives source removal and does not establish a new source read, current source-use permission, whole-text coverage, provider delivery, model comprehension, scientific review or regulatory acceptance.';
function invalid(): never {
  throw new AnaProjectScopeError(400, 'ANA_ADMISSION_RECEIPT_HISTORY_FILTER_INVALID', 'Choose valid exact receipt history filters. An invalid selection cannot broaden the history scope.');
}
function unavailable(): never {
  throw new AnaProjectScopeError(503, 'ANA_ADMISSION_RECEIPT_HISTORY_UNAVAILABLE', 'Source admission history could not be verified. No complete authorized history page was produced.');
}
function optionalId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !UUID.test(value)) return invalid();
  return value.toLowerCase();
}
function filters(input: SourceAdmissionReceiptHistoryOptions): Readonly<Required<Pick<SourceAdmissionReceiptHistoryOptions, 'limit'>> & Omit<SourceAdmissionReceiptHistoryOptions, 'limit'>> {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['documentId', 'receiptId', 'limit'].includes(key))) return invalid();
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return invalid();
  return Object.freeze({ documentId: optionalId(input.documentId), receiptId: optionalId(input.receiptId), limit });
}
function acceptanceTime(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== 'string') return unavailable();
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return unavailable();
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) return unavailable();
  const acceptedAt = new Date(time).toISOString();
  if (typeof value === 'string') {
    const normalized = value.includes('.') ? value.replace(/\.(\d{1,3})Z$/, (_whole, fraction: string) => '.' + fraction.padEnd(3, '0') + 'Z') : value.replace('Z', '.000Z');
    if (normalized !== acceptedAt) return unavailable();
  }
  return acceptedAt;
}
function historyTotal(found: { rows: Array<Record<string, unknown>>; rowCount?: number | null }, limit: number): number {
  const total = found.rows.length ? Number(found.rows[0].scope_total) : 0;
  if (found.rowCount != null && found.rowCount !== found.rows.length) return unavailable();
  if (!Number.isSafeInteger(total) || total < found.rows.length || found.rows.length > limit) return unavailable();
  return total;
}
function assertHistoryEntry(d: SourceAdmissionReceiptV2, scope: AdmittedAnaSourceReadScope,
  selection: SourceAdmissionReceiptHistoryOptions, total: number, rowTotal: number): void {
  if (d.organizationId !== scope.organizationId || d.actorId !== scope.userId || rowTotal !== total ||
      !scope.accessibleProgramIds.includes(d.programId)) return unavailable();
  if ((selection.documentId !== undefined && d.documentId !== selection.documentId) ||
      (selection.receiptId !== undefined && d.receiptId !== selection.receiptId)) return unavailable();
  assertAnaSourceProgramAllowed(scope, d.programId);
}
/** Internal same-q primitive. The scope must come from canonical admission,
 * never a request-body actor/program allow-list. */
export async function listSourceAdmissionReceiptsInReadScope(q: SourceAdmissionReceiptQueryable,
  scope: AdmittedAnaSourceReadScope, opts: SourceAdmissionReceiptHistoryOptions = {}): Promise<SourceAdmissionReceiptHistoryPage> {
  const pinnedScope = Object.freeze({ ...scope, accessibleProgramIds: Object.freeze([...scope.accessibleProgramIds]) });
  const selection = filters(opts);
  const params: unknown[] = [pinnedScope.organizationId, pinnedScope.userId, [...pinnedScope.accessibleProgramIds], selection.limit];
  let exact = '';
  if (selection.documentId) { params.push(selection.documentId); exact += ` AND r.document_id=$${params.length}::uuid`; }
  if (selection.receiptId) { params.push(selection.receiptId); exact += ` AND r.id=$${params.length}::uuid`; }
  try {
    const found = await q.query(`SELECT r.*, COUNT(*) OVER () AS scope_total
      FROM public.ana_source_read_receipts r
      WHERE r.organization_id=$1 AND r.actor_user_id=$2 AND r.program_id=ANY($3::uuid[])${exact}
      ORDER BY r.accepted_at DESC, r.id DESC LIMIT $4`, params);
    const entries: SourceAdmissionReceiptHistoryEntry[] = [];
    const total = historyTotal(found, selection.limit);
    for (const row of found.rows) {
      const acceptedAt = acceptanceTime(row.accepted_at);
      const rowTotal = Number(row.scope_total);
      const projected = await readSourceAdmissionReceiptRow(row);
      assertHistoryEntry(projected.descriptor, pinnedScope, selection, total, rowTotal);
      entries.push(Object.freeze({ ...projected, acceptedAt }));
    }
    return Object.freeze({ receipts: Object.freeze(entries), total, withheld: total - entries.length,
      actorFiltered: true as const, checkpoint: 'host_budget_admitted' as const,
      sourceUse: 'historical_admission_only' as const, providerDelivery: 'unestablished' as const, notice: NOTICE });
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    return unavailable();
  }
}
export async function listSourceAdmissionReceiptsForActor(input: AnaSourceReadScopeInput,
  opts: SourceAdmissionReceiptHistoryOptions = {}): Promise<SourceAdmissionReceiptHistoryPage> {
  const selection = filters(opts);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const pinned = { organizationId: input.organizationId, userId: input.userId, projectId: input.projectId,
    projectRef: input.projectRef, requestedProgramId: input.requestedProgramId };
  return withAnaSourceReadScope(pinned, (q, scope) => listSourceAdmissionReceiptsInReadScope(q, scope, selection));
}
