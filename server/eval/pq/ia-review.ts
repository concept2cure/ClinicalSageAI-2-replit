/** Supplemental IA policy-response capture. Human review is deliberately unscored.
 * This lives in the existing PQ lane and uses its sole evaluation gateway. It
 * cannot approve a model, change PQ criteria, or stand in for a production-route
 * evaluation. Expected behaviors stay outside the messages sent to the model.
 */
import { createHash } from 'node:crypto';
import type { getGateway } from '../../services/ai-gateway/gateway.js';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import { ANA_INTELLIGENT_AWARENESS } from '../../services/ana-ri/personality-core.js';
import { servedModelMatches } from './pq-verdict.js';
import { isCompletedProviderText, providerResponseMetadata } from './output-integrity.js';

export interface IaReviewSource {
  id: string;
  market: string;
  issuer: string;
  authorityType: string;
  url: string;
  revision: string;
  checkedOn: string;
  verification: 'official-page-read';
  scopeNote: string;
  reviewStatus: 'reviewer-draft';
  fullTextCorpusVerified: false;
}

export interface IaReviewCase {
  id: string;
  domain: string;
  market: string;
  sourceIds: string[];
  reviewStatus: 'reviewer-draft';
  initialUserMessage: string;
  followUpUserMessages?: string[];
  expectedBehavior: {
    responseMode: string;
    materialQuestions: string[];
    knownFactsDoNotReask: string[];
    mustAvoid: string[];
    scientificReview: string;
  };
}

export interface IaReviewBank {
  kind: 'ia-review-case-bank';
  version: string;
  status: 'reviewer-draft';
  approvedBy: null;
  approvedOn: null;
  purpose: string;
  sourceUse: string;
  sources: IaReviewSource[];
  cases: IaReviewCase[];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const strings = (value: unknown) => Array.isArray(value) && value.every(nonempty);

function validateBankHeader(value: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (![value.kind === 'ia-review-case-bank', value.status === 'reviewer-draft',
    value.approvedBy === null, value.approvedOn === null].every(Boolean)) {
    issues.push('supplemental case bank must remain an unapproved reviewer draft');
  }
  if (['version', 'purpose', 'sourceUse'].some(k => !nonempty(value[k]))) {
    issues.push('bank provenance is incomplete');
  }
  return issues;
}

function validateSource(source: unknown, sourceIds: Set<string>): string[] {
  if (!object(source) || !nonempty(source.id)) return ['malformed source'];
  const issues: string[] = [];
  if (sourceIds.has(source.id)) issues.push(`duplicate source ${source.id}`);
  sourceIds.add(source.id);
  if (['market', 'issuer', 'authorityType', 'url', 'revision', 'checkedOn', 'scopeNote'].some(k => !nonempty(source[k])) ||
      source.reviewStatus !== 'reviewer-draft' || source.verification !== 'official-page-read' ||
      source.fullTextCorpusVerified !== false) issues.push(`${source.id}: source provenance or draft status is incomplete`);
  try { if (new URL(String(source.url)).protocol !== 'https:') issues.push(`${source.id}: source URL must be HTTPS`); }
  catch { issues.push(`${source.id}: invalid source URL`); }
  return issues;
}

function hasValidExpectations(expected: unknown): boolean {
  return object(expected) && nonempty(expected.responseMode) && nonempty(expected.scientificReview) &&
    strings(expected.materialQuestions) && strings(expected.knownFactsDoNotReask) &&
    strings(expected.mustAvoid) && Boolean((expected.mustAvoid as string[]).length);
}

function validateCase(item: unknown, caseIds: Set<string>, sourceIds: Set<string>): string[] {
  if (!object(item) || !nonempty(item.id)) return ['malformed case'];
  const issues: string[] = [];
  if (caseIds.has(item.id)) issues.push(`duplicate case ${item.id}`);
  caseIds.add(item.id);
  if (['domain', 'market', 'initialUserMessage'].some(k => !nonempty(item[k])) || item.reviewStatus !== 'reviewer-draft') {
    issues.push(`${item.id}: case input or draft status is incomplete`);
  }
  if (!strings(item.sourceIds) || !(item.sourceIds as string[]).length ||
      (item.sourceIds as string[]).some(id => !sourceIds.has(id))) issues.push(`${item.id}: unresolved source reference`);
  if (item.followUpUserMessages !== undefined && !strings(item.followUpUserMessages)) {
    issues.push(`${item.id}: invalid follow-up messages`);
  }
  if (!hasValidExpectations(item.expectedBehavior)) issues.push(`${item.id}: reviewer expectations are incomplete`);
  if (['candidateContent', 'candidateExtraction', 'score', 'verdict'].some(k => k in item)) {
    issues.push(`${item.id}: fabricated candidate or verdict must not be part of this bank`);
  }
  return issues;
}

/** Input integrity only; a green result is never a regulatory or expert review. */
export function validateIaReviewBank(value: unknown): string[] {
  if (!object(value)) return ['case bank must be an object'];
  const issues = validateBankHeader(value);
  const sources = Array.isArray(value.sources) ? value.sources : [];
  const cases = Array.isArray(value.cases) ? value.cases : [];
  if (!sources.length || !cases.length) issues.push('sources and cases must both be nonempty');
  const sourceIds = new Set<string>();
  for (const source of sources) issues.push(...validateSource(source, sourceIds));
  const caseIds = new Set<string>();
  for (const item of cases) issues.push(...validateCase(item, caseIds, sourceIds));
  return issues;
}

export const IA_REVIEW_DIMENSIONS = [
  'material_gap_recognition', 'question_relevance_and_burden', 'context_integration',
  'bounded_helpfulness', 'scientific_applicability', 'market_and_source_discipline', 'record_and_authority',
] as const;

export interface IaCapturedTurn {
  turn: number;
  requestMessages: GatewayMessage[];
  requestSha256: string;
  response: string | null;
  responseSha256: string | null;
  servedModel: string | null;
  servedProvider: string | null;
  attributionVerified: boolean;
  finishReason: string | null;
  cached: boolean | null;
  deterministic: boolean | null;
  executionStatus: 'captured' | 'unattributable' | 'not-executed';
  errorCode?: 'gateway-call-failed' | 'empty-response' | 'incomplete-provider-output';
}

export interface IaCaseCapture {
  caseId: string;
  expectedBehavior: IaReviewCase['expectedBehavior'];
  plannedTurns: number;
  turns: IaCapturedTurn[];
  reviewer: {
    status: 'pending';
    reviewerId: null;
    reviewedOn: null;
    dimensionScores: Record<string, null>;
    criticalFailures: null;
    rationale: null;
  };
}

export interface IaCaptureResult {
  status: 'NOT_EXECUTED' | 'INCOMPLETE' | 'PENDING_REVIEW';
  cases: IaCaseCapture[];
  plannedTurns: number;
  capturedTurns: number;
  attributableTurns: number;
  policySha256: string;
}

type ReviewEntry = { id: string; pinnedVersion: string; provider: string };
type ReviewGateway = Pick<ReturnType<typeof getGateway>, 'evaluateModel'>;

async function captureTurn(requestMessages: GatewayMessage[], turn: number, entry: ReviewEntry, gateway: ReviewGateway): Promise<IaCapturedTurn> {
  const base = { turn, requestMessages, requestSha256: hash(JSON.stringify(requestMessages)) };
  try {
    const response = await gateway.evaluateModel(entry.id, {
      taskType: 'regulatory_review', riskTier: 'high',
      messages: requestMessages.map(message => ({ ...message })),
      temperature: 0, maxTokens: 2000, callerModule: 'pq-ia-review',
    });
    const metadata = providerResponseMetadata(response);
    if (typeof response.content !== 'string' || !response.content.trim()) {
      return { ...base, response: null, responseSha256: null, ...metadata, attributionVerified: false,
        executionStatus: 'not-executed', errorCode: 'empty-response' };
    }
    const completed = isCompletedProviderText(response);
    const verified = completed && servedModelMatches(response.resolvedModel ?? null, entry.pinnedVersion) && response.provider === entry.provider;
    return { ...base, response: response.content, responseSha256: hash(response.content),
      ...metadata,
      attributionVerified: verified, executionStatus: verified ? 'captured' : 'unattributable',
      ...(!completed ? { errorCode: 'incomplete-provider-output' as const } : {}) };
  } catch {
    // Raw provider errors can carry credentials or request contents. The
    // qualification package records failure without exporting those errors.
    return { ...base, response: null, responseSha256: null, servedModel: null, servedProvider: null,
      finishReason: null, cached: null, deterministic: null,
      attributionVerified: false, executionStatus: 'not-executed', errorCode: 'gateway-call-failed' };
  }
}

async function captureCase(item: IaReviewCase, bank: IaReviewBank, entry: ReviewEntry, gateway: ReviewGateway): Promise<IaCaseCapture> {
  const sourceContext = item.sourceIds.map(id => {
    const source = bank.sources.find(s => s.id === id)!;
    return `[${source.id}] ${source.issuer}; ${source.authorityType}; ${source.revision}; ` +
      `checked ${source.checkedOn}; ${source.url}\nBounded source summary: ${source.scopeNote}`;
  }).join('\n\n');
  const messages: GatewayMessage[] = [
    { role: 'system', origin: 'app', content: ANA_INTELLIGENT_AWARENESS },
    { role: 'user', origin: 'external', content: 'Evaluation source context only. These summaries are not a complete dossier ' +
      'or verified full-text corpus. No tools or project records are connected in this policy probe.\n\n' + sourceContext },
  ];
  const userTurns = [item.initialUserMessage, ...(item.followUpUserMessages ?? [])];
  const turns: IaCapturedTurn[] = [];
  for (const [index, userMessage] of userTurns.entries()) {
    messages.push({ role: 'user', content: userMessage });
    // Copy before dispatch: provider mutation or later conversation turns must
    // not rewrite the request that this response is claimed to answer.
    const captured = await captureTurn(messages.map(message => ({ ...message })), index + 1, entry, gateway);
    turns.push(captured);
    if (!captured.attributionVerified) break; // No nominal conversation on substituted/unreported output.
    messages.push({ role: 'assistant', content: captured.response! });
  }
  return { caseId: item.id, expectedBehavior: item.expectedBehavior, plannedTurns: userTurns.length, turns,
    reviewer: { status: 'pending', reviewerId: null, reviewedOn: null,
      dimensionScores: Object.fromEntries(IA_REVIEW_DIMENSIONS.map(d => [d, null])), criticalFailures: null, rationale: null } };
}

export async function captureIaReview(
  bank: IaReviewBank,
  entry: ReviewEntry,
  gateway: ReviewGateway,
): Promise<IaCaptureResult> {
  const issues = validateIaReviewBank(bank);
  if (issues.length) throw new Error(`IA case bank refused: ${issues.join('; ')}`);
  const captures: IaCaseCapture[] = [];
  for (const item of bank.cases) captures.push(await captureCase(item, bank, entry, gateway));
  const turns = captures.flatMap(c => c.turns);
  const plannedTurns = captures.reduce((sum, c) => sum + c.plannedTurns, 0);
  const capturedTurns = turns.filter(t => t.response !== null).length;
  const attributableTurns = turns.filter(t => t.attributionVerified).length;
  return { status: capturedTurns === 0 ? 'NOT_EXECUTED' : attributableTurns === plannedTurns ? 'PENDING_REVIEW' : 'INCOMPLETE',
    cases: captures, plannedTurns, capturedTurns, attributableTurns, policySha256: hash(ANA_INTELLIGENT_AWARENESS) };
}
