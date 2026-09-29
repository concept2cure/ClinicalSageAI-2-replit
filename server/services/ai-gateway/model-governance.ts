/**
 * Which registry rows may serve a request: the one predicate behind every
 * gateway selection point — the explicit path, strategy selection (`eligible`
 * and `relaxed`) and the fallback ladder (ADR-0014 §3 and §4).
 *
 * A row may serve only when:
 *   1. it IS an approved-models entry — its id, provider and wire model are the
 *      entry's id, provider and pinned version (`governingEntry`) — at every
 *      risk level. Until ADR-0014 the gateway checked approval on high-risk
 *      work only, and by registry id alone; on every other request any enabled
 *      row served, and only a CI drift test kept today's registry aligned;
 *   2. in production, its entry pins a concrete artifact (`isNominalPin`), so
 *      `local-default`, which pins a placeholder, is not selected there;
 *   3. on high-risk work, its entry is `approvedForHighRisk`;
 *   4. in production, on high-risk DRAFTING, its entry records `pq.status:
 *      'passed'` (CLAUDE.md RULE 2; approved-models.ts
 *      isQualifiedForHighRiskDrafting). Outside production a PQ-pending
 *      approved model serves as before, and the ledger records its PQ status.
 *
 * Production is `isProductionEnv` (NODE_ENV), the gateway's existing test. No
 * other input reaches this predicate: no environment variable, configuration
 * field or request field turns 2 or 4 off in production (CLAUDE.md Rule 0's
 * lesson about bypass switches). Deterministic mode does not skip it in
 * production either: route() runs selection before it returns fixture text.
 *
 * What it does not cover, stated so nobody reads more into it:
 *   - Rule 4 keys on the caller's task label (`document_drafting`). AnA's
 *     governed drafting is labelled `regulatory_review` or `chat`; the same
 *     rule is applied to it where the text becomes a record, by the
 *     governed-write gate (approved-models.ts isServedModelApprovedForHighRisk).
 *     Other callers that draft under another label are listed in the track GW
 *     evidence as known gaps.
 *   - `AIGateway.evaluateModel` is exempt from all four, by design: it is the
 *     PQ runner's door, and must send to exactly the model under
 *     qualification, which is PQ-pending by definition. `ci:pq-evaluation-callers`
 *     keeps every reference to it inside server/eval/pq/.
 *   - The baselined LiteLLM bypass (LITELLM_ENABLED with its production
 *     acknowledgement) routes around the gateway, and so around this.
 *
 * @module server/services/ai-gateway/model-governance
 */

import {
  APPROVED_MODELS,
  governingEntry,
  isHighRiskDraftingRequest,
  isHighRiskRequest,
  isNominalPin,
  isQualifiedForHighRiskDrafting,
  type ApprovedModel,
} from '../ai-governance/approved-models.js';
import { isProductionEnv } from './pii-screen.js';
import type { GatewayRequest, ModelConfig } from './types';

/** What a production refusal of high-risk drafting says, in these words (ADR-0014 §3). */
export const NO_PQ_QUALIFIED_MODEL =
  'No performance-qualified model is available for high-risk regulatory drafting in this environment.';

export type SelectionRefusal = 'no-entry' | 'nominal-pin' | 'not-approved-for-high-risk' | 'pq-not-passed';

export interface SelectionGovernance {
  production: boolean;
  entries: readonly ApprovedModel[];
}

type RiskFields = Pick<GatewayRequest, 'taskType' | 'riskTier'>;
type RowIdentity = Pick<ModelConfig, 'id' | 'provider' | 'model'>;

/** The rules as they stand for one selection: the environment, and the governed list. */
export function selectionGovernance(
  entries: readonly ApprovedModel[] = APPROVED_MODELS,
  env: NodeJS.ProcessEnv = process.env,
): SelectionGovernance {
  return { production: isProductionEnv(env), entries };
}

/** Why this row may not serve this request, or null when it may. */
export function selectionRefusal(model: RowIdentity, request: RiskFields, gov: SelectionGovernance): SelectionRefusal | null {
  const entry = governingEntry(model, gov.entries);
  if (!entry) return 'no-entry';
  if (gov.production && isNominalPin(entry)) return 'nominal-pin';
  if (!isHighRiskRequest(request.taskType, request.riskTier)) return null;
  if (!entry.approvedForHighRisk) return 'not-approved-for-high-risk';
  const drafting = isHighRiskDraftingRequest(request.taskType, request.riskTier);
  return drafting && !isQualifiedForHighRiskDrafting(entry, gov.production) ? 'pq-not-passed' : null;
}

/**
 * Whether an explicit request names a registry row: its model is some row's
 * registry id or wire model, of the provider it names when it names one; and a
 * provider named alone is the provider of some row. A request that names
 * neither names no row to miss.
 *
 * The registry here is every row, enabled or not. A row that exists but is
 * not configured in this deployment is a known name, and the explicit path
 * still falls through to strategy for it (track GW review [8], recorded as a
 * known gap: 50 literal pins name `gpt-4o`-family rows, and a deployment
 * without OpenAI would refuse every one of them).
 */
export function namesRegistryRow(
  models: readonly RowIdentity[],
  request: Pick<GatewayRequest, 'provider' | 'model'>,
): boolean {
  const ofProvider = (m: RowIdentity) => !request.provider || m.provider === request.provider;
  if (!request.model) return models.some(ofProvider);
  return models.some((m) => ofProvider(m) && (m.model === request.model || m.id === request.model));
}

/** One withheld row as the ledger records it: enough to reconstruct the decision after the lockfile changes. */
export interface WithheldRow {
  id: string;
  /** The entry's pinned version, or null when the row is no entry. */
  pinnedVersion: string | null;
  /** The entry's PQ status at the time, or null when the row is no entry. */
  pqStatus: ApprovedModel['pq']['status'] | null;
  /** Why this row was withheld: {@link selectionRefusal}. */
  reason: SelectionRefusal;
}

/**
 * - `no-pq-qualified-model`: production high-risk drafting, and every capable
 *   row was withheld (each with its own reason in `withheld`).
 * - `no-capable-model`: production high-risk drafting, and no capable row is
 *   configured at all. The person reads the same sentence; the ledger does not.
 */
export type PqRefusalReason = 'no-pq-qualified-model' | 'no-capable-model';

interface RefusalDetail {
  withheld: WithheldRow[];
  /** Enabled rows capable of the task, placement aside. */
  capableConfigured: number;
}

export type GovernanceRefusal =
  | ({ kind: 'pq-not-qualified'; reason: PqRefusalReason } & RefusalDetail)
  | ({ kind: 'not-approved-for-high-risk' } & RefusalDetail)
  | ({ kind: 'not-governed'; reason: 'no-entry' | 'nominal-pin' } & RefusalDetail);

function withheldRow(m: RowIdentity, request: RiskFields, gov: SelectionGovernance): WithheldRow {
  const entry = governingEntry(m, gov.entries);
  return {
    id: m.id,
    pinnedVersion: entry?.pinnedVersion ?? null,
    pqStatus: entry?.pq.status ?? null,
    reason: selectionRefusal(m, request, gov) ?? 'no-entry',
  };
}

/**
 * The refusal to raise when selection found no row that may serve, given the
 * rows it withheld: enabled, placement-permitted, and named (explicit) or
 * capable (strategy). Null when it withheld none — nothing was refused on
 * governance grounds, and the caller's existing outcome (a placement refusal,
 * or no provider) stands.
 *
 * Production high-risk drafting is the PQ refusal whichever rule withheld the
 * rows: its plain statement — no performance-qualified model is available —
 * is true of every one of them, and it is what the person is told (ADR-0014
 * §3). The ledger keeps each row's own reason. {@link pqRefusalWhenNothingCapable}
 * covers the case where no row was capable at all.
 */
export function governanceRefusal(
  request: RiskFields,
  withheldRows: readonly RowIdentity[],
  gov: SelectionGovernance,
  capableConfigured: number,
): GovernanceRefusal | null {
  if (withheldRows.length === 0) return null;
  const withheld = withheldRows.map((m) => withheldRow(m, request, gov));
  const detail = { withheld, capableConfigured };
  if (gov.production && isHighRiskDraftingRequest(request.taskType, request.riskTier)) {
    return { kind: 'pq-not-qualified', reason: 'no-pq-qualified-model', ...detail };
  }
  if (isHighRiskRequest(request.taskType, request.riskTier)) return { kind: 'not-approved-for-high-risk', ...detail };
  const reason = withheld.some((w) => w.reason === 'no-entry') ? 'no-entry' : 'nominal-pin';
  return { kind: 'not-governed', reason, ...detail };
}

/**
 * In production, high-risk drafting with no capable row configured at all is
 * the same plain PQ refusal, not "no AI provider is configured": in that
 * environment no configuration short of a passed PQ could serve it. Its ledger
 * reason says that nothing capable was configured.
 */
export function pqRefusalWhenNothingCapable(request: RiskFields, gov: SelectionGovernance): GovernanceRefusal | null {
  return gov.production && isHighRiskDraftingRequest(request.taskType, request.riskTier)
    ? { kind: 'pq-not-qualified', reason: 'no-capable-model', withheld: [], capableConfigured: 0 }
    : null;
}
