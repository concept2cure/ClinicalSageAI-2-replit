/**
 * A GOVERNED CHANGE, IN WORDS.
 *
 * Split out of signedAuditExport.ts (2026-11-12, lane G-audit-readback, verifier
 * V-1) when the block took that file past its size and complexity limits; it is
 * read by the signed export (signedAuditExport.ts) and by the audit trail screen
 * (routes/audit-trail-ledger.routes.ts), so the two never say different things.
 *
 * AUD-01 and W1-18 (client administration walk, 2026-11-10). A governed change
 * read back from the audit trail as "Tenant Settings Changed", target
 * "organization_settings:7", and the signed export did not carry the values at
 * all, although the row held the field, the value before and after and the
 * reason. This reads what a row HOLDS and says it in words. It never writes, and
 * it never invents: a value the row does not hold is reported as not recorded,
 * and a value the row holds is never reported as missing (V-2).
 *
 * The shapes are the ones the writers store, read from the database on the walk:
 *   tenant_settings_changed  services/tenant/tenant-settings-writer.ts
 *                            { changedFields: { section: [field] }, values: { section: { before, after } } }
 *   member_role_changed / member_removed / organization_invitation_*
 *                            services/tenant/membership-change.ts, invitation-consent.ts
 *                            { targetUserId, previousRole, newRole, previousStatus, newStatus }
 *   compliance.seats_purchased.update   { previousValue: {...}, newValue: {...}, reason }
 *   billing.budget.update, data_modify on organization / module_access_request
 *                            { before: {...}, after: {...}, reason }
 *   update on organization_industry_profile   { primaryIndustry, reason } (new value only)
 */

/** One field a governed change changed. `before`/`after` are words; null when the row does not hold it. */
export interface AuditChangeField {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** What a stored audit row says about the change it records. */
export interface AuditChangeWords {
  /** The act in words, for acts whose writers store no description. */
  act: string | null;
  /** The person the act is about, when the row names one by account id. */
  subjectUserId: number | null;
  /** The thing the act is about, in words, when it is not a person. */
  subjectLabel: string | null;
  /** A fallback for the person when their name cannot be read: the address the row stored. */
  subjectFallback: string | null;
  changes: AuditChangeField[];
  /** What the row does not hold that a reader would expect: values, or a reason. */
  note: string | null;
  /** The stored reason: the reason column, or the reason stored with the values. */
  reason: string | null;
  /** The changes in one line, without the act: "idle sign-out (minutes) from 15 to 1". */
  summary: string | null;
}

/** The stored row, as both readers pass it. */
export interface AuditChangeRow {
  action: unknown; table?: unknown; recordId?: unknown; reason?: unknown; oldValues?: unknown; newValues?: unknown;
}

type Obj = Record<string, unknown>;
/** Any pg pool, client or test double that answers a query. */
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

const FIELD_LABEL: Record<string, string> = {
  sessionTimeoutMinutes: 'Idle sign-out (minutes)',
  maxConcurrentSessions: 'Concurrent sessions',
  mfaRequired: 'Second factor required',
  passwordPolicy: 'Password policy',
  ipRestrictions: 'IP restrictions',
  independentReviewersRequired: 'Independent reviewers required',
  soleMemberSelfApproval: 'Sole member may approve own work',
  auditTrailRetentionDays: 'Audit trail kept for (days)',
  requirePdfA: 'PDF/A required',
  seatsPurchased: 'Purchased seats',
  monthlyBudget: 'Monthly budget',
  hardLimitEnabled: 'Hard spending limit',
  alertThresholds: 'Budget alerts (%)',
  primaryIndustry: 'Client type',
  mdxSpecialization: 'Device specialisation',
  clientType: 'Client type',
  industryMode: 'Industry',
  name: 'Name',
  role: 'Role',
  status: 'Status',
  requestStatus: 'Request',
  grant: 'Access',
  enabled: 'Turned on',
  scopes: 'Scopes',
};

const ROLE_WORDS: Record<string, string> = {
  owner: 'Owner', admin: 'Administrator', manager: 'Manager', member: 'Member', viewer: 'Viewer',
  approver: 'Approver', reviewer: 'Reviewer', author: 'Author',
};
const INDUSTRY_WORDS: Record<string, string> = {
  biotech_pharma: 'Biotech or pharma', biotech: 'Biotech', pharma: 'Pharma', cro: 'Contract research organisation',
  medical_device: 'Medical device', medtech: 'Medical device', diagnostics: 'Diagnostics', ivd: 'Diagnostics',
};
const ROLE_FIELDS = new Set(['role', 'previousRole', 'newRole', 'invitationRole']);
const INDUSTRY_FIELDS = new Set(['primaryIndustry', 'clientType', 'industryMode']);

/** The act, for acts whose writers store no description. */
const ADMIN_ACT: Record<string, string> = {
  tenant_settings_changed: 'Organisation settings changed',
  tenant_settings_reset: 'Organisation settings reset',
  member_role_changed: 'Member role changed',
  member_removed: 'Member removed',
  api_key_created: 'API key created',
  api_key_revoked: 'API key revoked',
  api_key_expired: 'API key expired',
  user_invited: 'Person invited',
  organization_invitation_accepted: 'Invitation accepted',
  organization_invitation_declined: 'Invitation declined',
  organization_invitation_withdrawn: 'Invitation withdrawn',
  'compliance.seats_purchased.update': 'Purchased seats changed',
  'billing.budget.update': 'Monthly budget changed',
  'c2c.work.qms-approver.designate': 'Designated to approve controlled documents',
  'c2c.work.qms-approver.remove': 'No longer designated to approve controlled documents',
};
/** Acts named by the record they change (their action is generic: `update`, `data_modify`). */
const TABLE_ACT: Record<string, string> = {
  organization_industry_profile: 'Client type changed',
  organization: 'Organisation profile changed',
  organization_settings: 'Organisation settings changed',
  module_subscription: 'Feature turned on or off',
  module_access_request: 'Module access request decided',
};
/** The thing a row is about, in words, by the record kind it names. */
const SUBJECT_WORDS: Record<string, string> = {
  organization_settings: 'Organisation settings',
  organization: 'Organisation profile',
  organization_industry_profile: 'Client type',
  organization_seats: 'Purchased seats',
  billing_budgets: 'Monthly budget',
  api_key: 'API key',
  module_subscription: 'Feature',
  module_access_request: 'Module access request',
  organization_invitations: 'Invitation',
};
/** Record kinds whose id is a person's account id. */
const PERSON_TABLES = new Set(['organization_users', 'user', 'users', 'organization-member']);
/** Governed changes: a reader expects the values and a reason. */
const VALUE_ACTS = new Set([
  'tenant_settings_changed', 'tenant_settings_reset', 'member_role_changed', 'member_removed',
  'compliance.seats_purchased.update', 'billing.budget.update',
]);
const VALUE_TABLES = new Set(['organization_industry_profile', 'organization', 'organization_settings', 'module_subscription', 'module_access_request']);
/** Governed acts that take a reason (the admin console asks for one on each). */
const REASON_ACTS = new Set([...VALUE_ACTS, 'api_key_created', 'api_key_revoked', 'c2c.work.qms-approver.designate', 'c2c.work.qms-approver.remove']);
/** Keys stored beside the values that are not themselves changed values. */
const NOT_A_CHANGE = new Set(['reason', 'outcome', 'orgAdminAction', 'description', 'summary', 'category', 'severity', 'success',
  'organizationId', 'targetUserId', 'requestedBy', 'decidedByMasterAdmin', 'accessRequestAction', 'moduleId', 'revokedApiKeyIds',
  'membershipCreated', 'seatsConsumed', 'updatedAt', 'revision']);
/** The longest a value is said in words (V-6): the stored value itself is carried whole beside it. */
const WORDS_MAX = 120;
const NO_VALUES_NOTE = 'This entry does not record the values before and after.';
const GENERIC_ACTS = new Set(['update', 'data_modify']);

const asObject = (v: unknown): Obj | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

const bounded = (s: string): string => (s.length > WORDS_MAX ? `${s.slice(0, WORDS_MAX - 3)}...` : s);

function labelOf(field: string): string {
  if (FIELD_LABEL[field]) return FIELD_LABEL[field];
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Value';
}

/** A scalar stored value in words; undefined for an array or an object. */
function scalarWords(field: string, v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return 'not set';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  if (ROLE_FIELDS.has(field)) return ROLE_WORDS[v] ?? labelOf(v);
  if (INDUSTRY_FIELDS.has(field)) return INDUSTRY_WORDS[v] ?? labelOf(v);
  return bounded(v);
}

/** An array or object stored value in words, bounded (V-6). */
function compoundWords(field: string, v: unknown): string {
  if (Array.isArray(v)) return v.length === 0 ? 'none' : bounded(v.map((x) => valueWords(field, x)).join(', '));
  const o = asObject(v);
  if (!o) return bounded(String(v));
  const parts = Object.entries(o).map(([k, x]) => `${labelOf(k).toLowerCase()} ${valueWords(k, x)}`);
  return parts.length === 0 ? 'not set' : bounded(parts.join(', '));
}

/** A stored value in words. */
function valueWords(field: string, v: unknown): string {
  return scalarWords(field, v) ?? compoundWords(field, v);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fieldOf = (k: string, before: unknown, after: unknown, prefix = ''): AuditChangeField =>
  ({ field: `${prefix}${k}`, label: labelOf(k), before: valueWords(k, before), after: valueWords(k, after) });
const changedKeys = (before: Obj, after: Obj) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !NOT_A_CHANGE.has(k));

/** Each key of before/after whose value differs. */
function diff(before: Obj, after: Obj): AuditChangeField[] {
  return changedKeys(before, after).filter((k) => !same(before[k], after[k])).map((k) => fieldOf(k, before[k], after[k]));
}

/** Each key held on both sides with the same value: a change that changed nothing still records what it held (V-2). */
function unchanged(before: Obj, after: Obj): AuditChangeField[] {
  return changedKeys(before, after).filter((k) => k in before && k in after && same(before[k], after[k]))
    .map((k) => fieldOf(k, before[k], after[k]));
}

function changeLine(c: AuditChangeField): string {
  const label = c.label.charAt(0).toLowerCase() + c.label.slice(1);
  // "PDF/A required" keeps its capitals.
  const name = /^[A-Z]{2,}/.test(c.label) ? c.label : label;
  if (c.before === null) return `${name} set to ${c.after ?? 'not set'}`;
  if (c.before === c.after) return `${name} stayed at ${c.after}`;
  return `${name} from ${c.before} to ${c.after ?? 'not set'}`;
}

interface Found { changes: AuditChangeField[]; notes: string[] }

/** Settings: changedFields names each field; values holds before/after per section. */
function settingsChanges(nv: Obj): Found {
  const changedFields = asObject(nv.changedFields);
  if (!changedFields) return { changes: [], notes: [] };
  const values = asObject(nv.values) ?? {};
  const changes: AuditChangeField[] = [];
  const missing: string[] = [];
  for (const [section, fields] of Object.entries(changedFields)) {
    const held = asObject(values[section]);
    const before = asObject(held?.before);
    const after = asObject(held?.after);
    for (const f of (Array.isArray(fields) ? fields.map(String) : []).filter((x) => !NOT_A_CHANGE.has(x))) {
      if (before && after && (f in before || f in after)) changes.push(fieldOf(f, before[f], after[f], `${section}.`));
      else missing.push(labelOf(f));
    }
  }
  const notes = missing.length > 0 ? [`The values before and after were not recorded for: ${missing.join(', ')}.`] : [];
  return { changes, notes };
}

/** A role or a status (membership, invitation): before and after are stored side by side. */
function roleStatusChanges(action: string, nv: Obj): AuditChangeField[] {
  const out: AuditChangeField[] = [];
  if ('previousRole' in nv || 'newRole' in nv) {
    const before = nv.previousRole == null ? null : valueWords('role', nv.previousRole);
    const removed = action === 'member_removed';
    const after = nv.newRole == null ? (removed ? 'none (removed)' : 'none') : valueWords('role', nv.newRole);
    if (before !== null || nv.newRole != null || removed) out.push({ field: 'role', label: 'Role', before, after });
  }
  if ('previousStatus' in nv || 'newStatus' in nv) {
    const before = nv.previousStatus == null ? null : valueWords('status', nv.previousStatus);
    out.push({ field: 'status', label: 'Status', before, after: valueWords('status', nv.newStatus) });
  }
  return out;
}

/** The before/after objects a row holds: previousValue/newValue, before/after, or old_values beside new_values. */
function heldPairs(nv: Obj, ov: Obj | null): Array<[Obj, Obj]> {
  const pv = asObject(nv.previousValue), nwv = asObject(nv.newValue);
  const b = asObject(nv.before), a = asObject(nv.after);
  const pairs: Array<[Obj, Obj]> = [];
  if (pv || nwv) pairs.push([pv ?? {}, nwv ?? {}]);
  if ((b || a) && !asObject(nv.changedFields)) pairs.push([b ?? {}, a ?? {}]);
  if (ov && !b && !a && !pv && !nwv) pairs.push([ov, nv]);
  return pairs;
}

/** A feature switch, or the client type, stored as its new value only. */
function singleValueChanges(table: string, nv: Obj, soFar: number): Found {
  if (table === 'module_subscription' && typeof nv.enabled === 'boolean') {
    return { changes: [{ field: 'enabled', label: 'Turned on', before: null, after: valueWords('enabled', nv.enabled) }], notes: [] };
  }
  if (table !== 'organization_industry_profile' || soFar > 0) return { changes: [], notes: [] };
  const changes = ['primaryIndustry', 'mdxSpecialization'].filter((f) => f in nv && nv[f] != null)
    .map((f) => ({ field: f, label: labelOf(f), before: null, after: valueWords(f, nv[f]) }));
  return { changes, notes: changes.length > 0 ? ['The value before was not recorded.'] : [] };
}

const isValueAct = (action: string, table: string) =>
  VALUE_ACTS.has(action) || (GENERIC_ACTS.has(action) && VALUE_TABLES.has(table));

const trimmed = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The stored reason: the reason column, or the reason stored with the values. */
function storedReason(row: AuditChangeRow, nv: Obj): string | null {
  return trimmed(row.reason) ?? trimmed(nv.reason);
}

/** Who or what the row is about. */
function subjectOf(table: string, row: AuditChangeRow, nv: Obj) {
  const targetUser = Number(nv.targetUserId ?? (PERSON_TABLES.has(table) ? row.recordId : NaN));
  const subjectUserId = Number.isInteger(targetUser) && targetUser > 0 ? targetUser : null;
  return {
    subjectUserId,
    subjectLabel: subjectUserId != null ? null : SUBJECT_WORDS[table] ?? null,
    subjectFallback: trimmed(nv.email),
  };
}

/** What a governed row does not hold that a reader would expect. */
function missingNotes(action: string, valueAct: boolean, found: Found, reason: string | null): string[] {
  const notes = [...found.notes];
  if (valueAct && found.changes.length === 0 && notes.length === 0) notes.push(NO_VALUES_NOTE);
  if (!reason && (REASON_ACTS.has(action) || valueAct)) notes.push('No reason was recorded.');
  return notes;
}

function summaryOf(changes: AuditChangeField[]): string | null {
  const shown = changes.slice(0, 4).map(changeLine);
  const more = changes.length > 4 ? [`and ${changes.length - 4} more`] : [];
  return shown.length > 0 ? [...shown, ...more].join('; ') : null;
}

/** Every change the row holds, and what it says is missing among them. */
function changesOf(action: string, table: string, nv: Obj, ov: Obj | null): Found {
  const settings = settingsChanges(nv);
  const pairs = heldPairs(nv, ov);
  const changes = [...settings.changes, ...roleStatusChanges(action, nv), ...pairs.flatMap(([b, a]) => diff(b, a))];
  const single = singleValueChanges(table, nv, changes.length);
  changes.push(...single.changes);
  // V-2: a governed change whose before and after are equal still holds its value; say it stayed.
  if (changes.length === 0 && isValueAct(action, table)) changes.push(...pairs.flatMap(([b, a]) => unchanged(b, a)));
  return { changes, notes: [...settings.notes, ...single.notes] };
}

/**
 * What a stored audit row says about the governed change it records. Pure: the
 * row's own columns in, words out. `action` is audit_logs.action or
 * audit_events.event_type; `table` and `recordId` name the record.
 */
export function describeAuditChange(row: AuditChangeRow): AuditChangeWords {
  const action = String(row.action ?? '');
  const table = String(row.table ?? '');
  const nv = asObject(row.newValues) ?? {};
  const found = changesOf(action, table, nv, asObject(row.oldValues));
  const reason = storedReason(row, nv);
  const notes = missingNotes(action, isValueAct(action, table), found, reason);
  return {
    act: ADMIN_ACT[action] ?? (GENERIC_ACTS.has(action) ? TABLE_ACT[table] ?? null : null),
    ...subjectOf(table, row, nv),
    changes: found.changes,
    note: notes.length > 0 ? notes.join(' ') : null,
    reason,
    summary: summaryOf(found.changes),
  };
}

/** The act and its change as one line: "Member role changed: role from Approver to Administrator". */
export function changeEventLine(act: string, words: Pick<AuditChangeWords, 'summary' | 'note'>): string {
  if (words.summary) return `${act}: ${words.summary}${words.note ? `. ${words.note}` : ''}`;
  if (!words.note) return act;
  // "the values ... were not recorded" reads on after a colon; "No reason was recorded." stands alone.
  return words.note.startsWith('The values')
    ? `${act}: ${words.note.charAt(0).toLowerCase()}${words.note.slice(1)}`
    : `${act}. ${words.note}`;
}

/** Said of a person the row names whose name this organisation can no longer read. */
export const PERSON_NOT_NAMED = 'A person who is no longer a member';

export type PeopleNames = Map<number, { name: string | null; email: string | null }>;

/**
 * The names of the people rows are about, read through public.actor_name (the
 * reader the ledger already uses for actors; migrations/20260929_actor_names.sql),
 * which answers only for members of this organisation and actors in its own
 * trail. A database without it names nobody, and the caller says so.
 */
export async function readPeopleNames(client: Queryable, ids: number[]): Promise<PeopleNames> {
  const out: PeopleNames = new Map();
  const wanted = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (wanted.length === 0) return out;
  const has = await client.query(`SELECT to_regprocedure('public.actor_name(integer)') IS NOT NULL AS ok`);
  if ((has.rows[0] as { ok?: boolean } | undefined)?.ok !== true) return out;
  const r = await client.query(
    `SELECT k.id, n.name, n.email FROM unnest($1::int[]) AS k(id) LEFT JOIN LATERAL public.actor_name(k.id) n ON TRUE`,
    [wanted],
  );
  for (const row of r.rows as Array<{ id: number; name: string | null; email: string | null }>) {
    if (row.name || row.email) out.set(Number(row.id), { name: row.name ?? null, email: row.email ?? null });
  }
  return out;
}

/** The person a row is about, in words. */
export function personWords(words: Pick<AuditChangeWords, 'subjectUserId' | 'subjectFallback'>, names: PeopleNames): string | null {
  if (words.subjectUserId == null) return null;
  const n = names.get(words.subjectUserId);
  return n?.name?.trim() || n?.email?.trim() || words.subjectFallback || PERSON_NOT_NAMED;
}

// ─── The audit trail screen's reading (routes/audit-trail-ledger.routes.ts) ──

/** audit_events acts whose writers store no description, named for a reader (the walk, 2026-11-10, read
 *  "Audit Export", target "audit_export"). The stored type and reason stay on the row. */
export const EVENT_TYPE_WORDS: Record<string, { event: string; target: string }> = {
  'audit.export': { event: 'Signed audit trail exported', target: 'Audit trail' },
};

/** An audit_logs row's change, in words. */
export function auditLogChangeWords(row: Obj): AuditChangeWords {
  return describeAuditChange({
    action: row.action, table: row.table_name, recordId: row.record_id,
    reason: row.reason, oldValues: row.old_values, newValues: row.new_values,
  });
}

/** The person each audit_logs row is about, named in one query for the page. */
export function namesForRows(client: Queryable, rows: Obj[]): Promise<PeopleNames> {
  const ids = rows.map((r) => auditLogChangeWords(r).subjectUserId).filter((n): n is number => n != null);
  return readPeopleNames(client, ids);
}

/** The ledger entry's fields this reading sets. */
export interface LedgerChange {
  event: string; target: string; targetRef: string | null; reason: string | null;
  /** What a governed change changed, field by field, from the row's stored values: empty when it records no change of values. */
  changes: AuditChangeField[];
  /** What the row does not hold that a reader would expect (the values, a reason), in words; null when nothing is missing. */
  changeNote: string | null;
}

/** The fields a ledger entry gains from this reading (AuditLedgerEntry extends it). */
export type LedgerChangeFields = Partial<Pick<LedgerChange, 'changes' | 'changeNote'>>;

/** True when the row stored its own description (ledger metaString(new_values, ['description', 'summary'])). */
const ownDescription = (nv: Obj | null) => trimmed(nv?.description) != null || trimmed(nv?.summary) != null;

/**
 * An audit_logs ledger entry with its governed change said in words: the person
 * or the thing it is about, what changed from what to what, the reason stored
 * with the values when the column holds none, and what the row does not record.
 * The stored reference stays beside the name (`targetRef`), so an inspector
 * still traces by it. A signed entry keeps the subject its signature names, and
 * a row that stored its own description keeps it. `actNames` is the ledger's own
 * table of names for actions (ACTION_EVENT), which comes before this reading's.
 */
export function ledgerChange(
  entry: { event: string; target: string; targetRef?: string | null; reason: string | null; sig: boolean },
  row: Obj, names: PeopleNames, actNames: Record<string, string>,
): LedgerChange {
  const words = auditLogChangeWords(row);
  const keep = entry.sig || ownDescription(asObject(row.new_values));
  const act = keep ? entry.event : (actNames[String(row.action ?? '')] ?? words.act ?? entry.event);
  const subject = entry.sig ? null : personWords(words, names) ?? words.subjectLabel;
  return {
    event: changeEventLine(act, words),
    target: subject ?? entry.target,
    targetRef: subject ? entry.targetRef ?? entry.target : entry.targetRef ?? null,
    reason: entry.reason ?? words.reason,
    changes: words.changes,
    changeNote: words.note,
  };
}

// ─── The signed export's reading (signedAuditExport.ts) ─────────────────────

/**
 * Each exported row with its governed change in words (AUD-01): the act, the
 * person or thing it is about, what changed from what to what, and what the row
 * does not record, as the audit trail screen shows it. The stored columns are
 * carried exactly as they are; the words add to the record, they never replace
 * it. So `reason` stays the stored column (on audit_events it is part of the
 * record hash an inspector recomputes), and a reason the writer kept only with
 * the values is carried beside it as `reason_from_values` (V-3).
 */
export async function exportChangeWords(pool: Queryable, rows: Obj[]): Promise<Obj[]> {
  const words = rows.map((r) => describeAuditChange({
    action: r.event_type, table: r.entity_type, recordId: r.entity_id,
    reason: r.reason, oldValues: r.old_values, newValues: r.new_values,
  }));
  const isLog = (r: Obj) => r.source === 'audit_logs';
  const people = await readPeopleNames(pool, [
    ...words.map((w) => w.subjectUserId).filter((n): n is number => n != null),
    ...rows.filter(isLog).map((r) => Number(r.user_id)),
  ]);
  return rows.map((r, i) => {
    const w = words[i];
    const actor = isLog(r) ? people.get(Number(r.user_id)) : undefined;
    return {
      ...r,
      ...(isLog(r) ? { user_name: actor?.name ?? actor?.email ?? null } : {}),
      reason_from_values: trimmed(r.reason) ? null : w.reason,
      event_name: w.act,
      target_name: personWords(w, people) ?? w.subjectLabel,
      change_summary: w.summary,
      changes: w.changes,
      change_note: w.note,
    };
  });
}
