/**
 * The device change determination, kept on the change record (P-122, 2026-11-12; reach-map row 37).
 *
 * A device change needs two regulatory answers before it is approved: in the United States, whether it needs a new
 * 510(k) or is documented in a letter to file; in the European Union, whether it is a significant change. Two
 * deterministic rule engines have answered that since 2026-07 (services/regulatory/change-assessment.ts, served at
 * POST /api/ivd-lifecycle/change/fda-510k and /change/eu-significant) and nothing called them. This runs them from a
 * Quality change record of a device project and keeps the outcome on that record.
 *
 * What is kept, in `qms_change_controls.metadata.regulatoryImpact.<market>`: the answers given, what the engine
 * returned as it returned it, the version of its rules, who ran it and when. The verdict is computed here from the
 * answers, never accepted from the caller. No column or table was added, and `change_assessments` is not used.
 *
 * The record's own rules hold:
 *   - it is part of the change's content, so it is recorded only while the change is proposed or under assessment
 *     (CHANGE_EDITABLE_STATES). The approval's content digest covers `metadata` (change-approval-signature.ts), so an
 *     approver signs the determination they read, and one recorded after they opened the change refuses their
 *     signature as any other edit does;
 *   - the audit row is written here, on the same transaction as the record: both commit, or neither does. It
 *     carries the answers, the engine's outcome and the rules' version;
 *   - replacing a recorded determination states why, and the audit row keeps the one it replaced;
 *   - the engine does not classify the change. `classification`, the impact assessment and the approval stay a
 *     person's, through the existing change-control actions.
 *
 * This file is the change-control service's (changeControl.service.ts), which is at the 500-line lint ceiling.
 *
 * @module server/services/qms/change-regulatory-impact
 */
import type { RequestSqlClient } from '../../db/requestDb';
import { queryRowsClient } from '../../db/queryRowsClient';
import { DEVICE_FAMILY_PRODUCT_TYPES, isDeviceFamily } from '../../../shared/constants/domain/product-types';
import { GOVERNED_REASON_MIN } from '../../../shared/constants/governed-reason';
import { DEVICE_CHANGE_MARKETS, DEVICE_CHANGE_QUESTIONS, type DeviceChangeMarket } from '../../../shared/regulatory/change-control-taxonomy';
import { ComputationRefusal } from '../ana-biostats/computation-engine';
import { writeChainedAuditRow } from '../auditService';
import {
  assessEuSignificantChange, assessFdaChange, EU_CHANGE_RULES, FDA_CHANGE_RULES,
  type EuSignificantChangeResult, type FdaChangeResult,
} from '../regulatory/change-assessment';
import { CHANGE_EDITABLE_STATES, type ChangeControlRow } from './changeControl.service';

/** Where the determinations are kept on the change's metadata. */
export const REGULATORY_IMPACT_KEY = 'regulatoryImpact';

/** Each market's engine: its name on the record, the version of its rules, and the engine itself. */
const ENGINES = {
  us: { engine: 'fda-510k-change', ruleVersion: FDA_CHANGE_RULES, assess: (answers: Record<string, boolean>) => assessFdaChange(answers as never) },
  eu: { engine: 'eu-significant-change', ruleVersion: EU_CHANGE_RULES, assess: (answers: Record<string, boolean>) => assessEuSignificantChange(answers as never) },
} as const;

const FDA_DECISIONS: readonly string[] = ['letter_to_file', 'new_510k', 'pma_supplement_or_de_novo'];

/** One market's determination as the record keeps it. */
export interface ChangeImpactDetermination {
  engine: string;
  ruleVersion: string;
  /** The answers the engine was given: each of its questions, yes or no. */
  inputs: Record<string, boolean>;
  /** What the engine returned, as it returned it. */
  result: FdaChangeResult | EuSignificantChangeResult;
  by: { id: number; name: string };
  at: string;
}

/** A stored determination this code cannot read is said to be unreadable, never shown as a verdict or as none. */
export type StoredDetermination = ChangeImpactDetermination | { unreadable: true } | null;

/** What a change's register row says about the determination: whether it applies, and what is recorded. */
export interface ChangeImpactView {
  /** `device`: the change is filed under a device project. Otherwise why the determination does not apply. */
  applies: 'device' | 'not_device' | 'no_project';
  /** The project's product type (regulatory_programs.product_type), or null with no project. */
  productType: string | null;
  /** True when the organisation has a device project: only then would a person look for the determination on a
   *  change that is not a device's, and the record says why it is not offered. */
  organisationHasDevices: boolean;
  /** A determination may be recorded now: a device project's change, still proposed or under assessment. */
  assessable: boolean;
  us: StoredDetermination;
  eu: StoredDetermination;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every((t) => typeof t === 'string');

/** The engine's result in the shape its market returns, or null when it is anything else. */
function readableResult(market: DeviceChangeMarket, result: unknown): FdaChangeResult | EuSignificantChangeResult | null {
  if (!isRecord(result) || !isText(result.rationale) || !isTextList(result.triggers)) return null;
  const { rationale, triggers } = result;
  if (market === 'us') {
    return FDA_DECISIONS.includes(String(result.decision))
      ? { decision: result.decision as FdaChangeResult['decision'], rationale, triggers } : null;
  }
  return typeof result.significant === 'boolean' ? { significant: result.significant, rationale, triggers } : null;
}

/** A market's answers when every question of its engine has a yes or a no, else null. */
function readableAnswers(market: DeviceChangeMarket, answers: unknown): Record<string, boolean> | null {
  if (!isRecord(answers)) return null;
  const out: Record<string, boolean> = {};
  for (const { key } of DEVICE_CHANGE_QUESTIONS[market]) {
    const answer = answers[key];
    if (typeof answer !== 'boolean') return null;
    out[key] = answer;
  }
  return out;
}

const readableBy = (v: unknown) => (isRecord(v) && Number.isSafeInteger(v.id) && isText(v.name) ? { id: Number(v.id), name: v.name } : null);
const readableInstant = (v: unknown) => (isText(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/** A kept determination with every part readable, else null. */
function readDetermination(market: DeviceChangeMarket, raw: Record<string, unknown>): ChangeImpactDetermination | null {
  const inputs = readableAnswers(market, raw.inputs);
  const result = readableResult(market, raw.result);
  const by = readableBy(raw.by);
  const at = readableInstant(raw.at);
  const { engine, ruleVersion } = raw;
  if (!inputs || !result || !by || !at || !isText(engine) || !isText(ruleVersion)) return null;
  return { engine, ruleVersion, inputs, result, by, at };
}

/** The determination kept for a market: null when none is, `unreadable` when what is kept is not one. */
export function storedDetermination(metadata: unknown, market: DeviceChangeMarket): StoredDetermination {
  const kept = isRecord(metadata) ? metadata[REGULATORY_IMPACT_KEY] : undefined;
  if (kept === undefined || kept === null) return null;
  if (!isRecord(kept)) return { unreadable: true };
  const raw = kept[market];
  if (raw === undefined || raw === null) return null;
  return (isRecord(raw) ? readDetermination(market, raw) : null) ?? { unreadable: true };
}

type ChangeForImpact = Pick<ChangeControlRow, 'program_id' | 'status' | 'metadata'>;

function viewOf(change: ChangeForImpact, productType: string | null, organisationHasDevices: boolean): ChangeImpactView {
  const applies = !change.program_id ? 'no_project' : isDeviceFamily(productType) ? 'device' : 'not_device';
  return {
    applies, productType, organisationHasDevices,
    assessable: applies === 'device' && (CHANGE_EDITABLE_STATES as readonly string[]).includes(change.status),
    us: storedDetermination(change.metadata, 'us'),
    eu: storedDetermination(change.metadata, 'eu'),
  };
}

/**
 * What the register's rows need to say whether the determination applies: each listed change's project type, and
 * whether the organisation has a device project at all. One organisation-scoped read for the whole register.
 */
export async function regulatoryImpactViews(orgId: number, changes: readonly ChangeControlRow[], client: RequestSqlClient): Promise<(change: ChangeForImpact) => ChangeImpactView> {
  const programIds = [...new Set(changes.map((c) => c.program_id).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const { rows } = await queryRowsClient(client).query<{ id: string; product_type: string | null; live: boolean }>(
    `SELECT p.id::text AS id, p.product_type, (p.deleted_at IS NULL) AS live
       FROM regulatory_programs p
      WHERE p.organization_id = $1
        AND (p.id = ANY($2::uuid[]) OR (p.deleted_at IS NULL AND LOWER(p.product_type) = ANY($3::text[])))`,
    [orgId, programIds, [...DEVICE_FAMILY_PRODUCT_TYPES]],
  );
  const productTypes = new Map(rows.map((r) => [r.id.toLowerCase(), r.product_type]));
  const organisationHasDevices = rows.some((r) => r.live && isDeviceFamily(r.product_type));
  return (change) => viewOf(change, change.program_id ? productTypes.get(change.program_id.toLowerCase()) ?? null : null, organisationHasDevices);
}

/** Why a determination was not recorded. Nothing was written. */
export class ChangeImpactRefused extends Error {
  constructor(readonly status: 404 | 409 | 422, readonly code: string, message: string) {
    super(message);
    this.name = 'ChangeImpactRefused';
  }
}

export interface RecordImpactInput {
  market: DeviceChangeMarket;
  /** The person's answers, under the engine's own input names. */
  answers: unknown;
  actorId: number;
  /** Why a recorded determination is replaced. Required then. */
  reason?: string | null;
}

export interface RecordedImpact {
  change: ChangeControlRow;
  determination: ChangeImpactDetermination;
  /** The determination this one replaced, for the audit row; null for a first one. */
  previous: StoredDetermination;
  view: ChangeImpactView;
}

const FOR_DEVICES = 'The 510(k) and EU significant-change determination is for a device change.';

/** The questions of a market with no yes-or-no answer, by key. */
function unanswered(market: DeviceChangeMarket, answers: unknown): string[] {
  const given = isRecord(answers) ? answers : {};
  return DEVICE_CHANGE_QUESTIONS[market].filter((q) => typeof given[q.key] !== 'boolean').map((q) => q.key);
}

/** Run the market's engine. Its refusal is said as its own; anything it returns that is not a verdict is an error. */
function determine(market: DeviceChangeMarket, answers: Record<string, boolean>): FdaChangeResult | EuSignificantChangeResult {
  let returned: unknown;
  try {
    returned = ENGINES[market].assess(answers);
  } catch (err) {
    if (err instanceof ComputationRefusal) {
      throw new ChangeImpactRefused(422, 'QMS_CHANGE_ENGINE_REFUSED', `The rules engine refused these answers. ${err.message} Nothing was recorded.`);
    }
    throw err;
  }
  const result = readableResult(market, returned);
  if (!result) throw new Error(`The ${ENGINES[market].engine} engine returned no determination`);
  return result;
}

/** The audit action of a recorded determination (audit_logs.action, on resource qms_change_control). */
export const REGULATORY_IMPACT_AUDIT_ACTION = 'mdx.qms.change.regulatory_impact';

/**
 * Run a market's engine on the person's answers and keep the outcome on the change, with its audit row. On the
 * caller's transaction: the row is locked, `admitProject` decides whether this person may change the change's
 * project (it throws its own refusal), and a failed audit write fails the whole act.
 */
export async function recordRegulatoryImpact(q: RequestSqlClient, orgId: number, changeId: number, input: RecordImpactInput,
  admitProject: (programId: string) => Promise<void>): Promise<RecordedImpact> {
  const { market } = input;
  if (!DEVICE_CHANGE_MARKETS.includes(market)) throw new ChangeImpactRefused(422, 'QMS_CHANGE_MARKET_INVALID', 'Choose the market to assess for: us or eu. Nothing was recorded.');
  const sql = queryRowsClient(q);
  const { rows } = await sql.query<ChangeControlRow & { program_product_type: string | null }>(
    `SELECT c.*, (SELECT p.product_type FROM regulatory_programs p
                   WHERE p.id = c.program_id AND p.organization_id = c.organization_id) AS program_product_type
       FROM qms_change_controls c
      WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL
        FOR UPDATE OF c`,
    [changeId, orgId],
  );
  const change = rows[0];
  if (!change) throw new ChangeImpactRefused(404, 'QMS_CHANGE_NOT_FOUND', 'Change not found in this organization.');
  if (!change.program_id) {
    throw new ChangeImpactRefused(409, 'QMS_CHANGE_NOT_A_DEVICE', `${FOR_DEVICES} This change is not filed under a project. Nothing was recorded.`);
  }
  await admitProject(change.program_id);
  if (!isDeviceFamily(change.program_product_type)) {
    throw new ChangeImpactRefused(409, 'QMS_CHANGE_NOT_A_DEVICE', `${FOR_DEVICES} This change is filed under a project that is not a device. Nothing was recorded.`);
  }
  if (!(CHANGE_EDITABLE_STATES as readonly string[]).includes(change.status)) {
    throw new ChangeImpactRefused(409, 'QMS_CHANGE_CONTENT_FIXED',
      `This change is ${String(change.status).replace(/_/g, ' ')}, so its content is fixed. Nothing was recorded. To assess it, raise a new change request.`);
  }
  const open = unanswered(market, input.answers);
  if (open.length > 0) {
    throw new ChangeImpactRefused(422, 'QMS_CHANGE_QUESTIONS_UNANSWERED',
      `Answer every question with yes or no. Not answered: ${open.join(', ')}. Nothing was recorded.`);
  }
  const previous = storedDetermination(change.metadata, market);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (previous && reason.length < GOVERNED_REASON_MIN) {
    throw new ChangeImpactRefused(422, 'QMS_CHANGE_REASSESSMENT_REASON',
      `A determination is already recorded for this market. State why it is assessed again (a reason of at least ${GOVERNED_REASON_MIN} characters). Nothing was recorded.`);
  }
  const answers = readableAnswers(market, input.answers) as Record<string, boolean>;
  const result = determine(market, answers);
  const actor = (await sql.query<{ name: string | null }>(
    `SELECT COALESCE(NULLIF(BTRIM(u.name), ''), u.email) AS name FROM users u WHERE u.id = $1`, [input.actorId])).rows[0];
  if (!actor || !isText(actor.name)) throw new Error('The person recording the determination could not be read');
  const determination: ChangeImpactDetermination = {
    engine: ENGINES[market].engine, ruleVersion: ENGINES[market].ruleVersion, inputs: answers, result,
    by: { id: input.actorId, name: actor.name }, at: new Date().toISOString(),
  };
  const updated = await sql.query<ChangeControlRow>(
    `UPDATE qms_change_controls
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY[$3::text],
              (CASE WHEN jsonb_typeof(metadata -> $3::text) = 'object' THEN metadata -> $3::text ELSE '{}'::jsonb END)
                || jsonb_build_object($4::text, $5::jsonb)),
            updated_at = clock_timestamp()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status = ANY($6::text[])
      RETURNING *`,
    [changeId, orgId, REGULATORY_IMPACT_KEY, market, JSON.stringify(determination), [...CHANGE_EDITABLE_STATES]],
  );
  const saved = updated.rows[0];
  if (!saved) throw new ChangeImpactRefused(409, 'QMS_CHANGE_CONTENT_FIXED', 'The change moved while the determination was being recorded. Nothing was recorded. Reload it.');
  await writeChainedAuditRow(q, {
    tenantId: orgId, userId: input.actorId, action: REGULATORY_IMPACT_AUDIT_ACTION,
    resourceType: 'qms_change_control', resourceId: changeId, reason: reason || undefined,
    details: { changeNumber: saved.change_number, market, ...determination, previous },
  });
  return { change: saved, determination, previous, view: viewOf(saved, change.program_product_type, true) };
}
