/** Offline, fail-closed claim verification against repository-owned evidence. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PqProtocol, RegistryPqClaim, computeVerdict, servedModelMatches } from './pq-verdict.js';
import { hasCompletedProviderFlags } from './output-integrity.js';
import { extractionCriteriaProblems as sharedExtractionCriteriaProblems, ragCriteriaProblems } from './pq-criteria.js';

export interface CanonicalPqEvidence {
  protocolText: string;
  docBankText: string;
  ragGoldText: string;
  corpusManifestText: string;
}

export interface QualificationPreflight {
  kind: 'qualification-prerequisites';
  status: 'blocked' | 'ready_to_evaluate';
  readyToEvaluate: boolean;
  qualifiesModel: false;
  blockers: Array<{ code: string; message: string; count?: number }>;
  protocol: { id: string | null; status: string | null; approved: boolean };
  counts: { generationTasks: number; extractionTasks: number; ragPositiveItems: number; ragNegativeControls: number;
    ragRequiredPositiveItems: number | null; openGoldChecks: number; missingGoldEvidence: number;
    sourceEntries: number; requiredSourceEntries: number; reviewedSources: number; publishers: number;
    requiredPublisherTerms: number; reviewedPublisherTerms: number };
}
interface Rules { computeVerdict: typeof computeVerdict; servedModelMatches: typeof servedModelMatches }
type Row = Record<string, unknown>;
const object = (v: unknown): v is Row => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const nonempty = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const sameIds = (actual: unknown, expected: string[]) => Array.isArray(actual) && actual.every(nonempty) &&
  actual.length === expected.length && new Set(actual).size === actual.length && expected.every(id => actual.includes(id));
const validDate = (v: unknown) => nonempty(v) && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v.slice(0, 10)).toISOString().slice(0, 10) === v.slice(0, 10);

/** Source modules and the shipped dist/index.js bundle share the nearest package root. */
export function qualificationEvidenceRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) return realpathSync(dir);
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Qualification package root is unavailable');
    dir = parent;
  }
}

export function readCanonicalPqEvidence(): CanonicalPqEvidence {
  return { protocolText: readQualificationAsset('server/eval/pq/pq-protocol.json'),
    docBankText: readQualificationAsset('server/eval/doc-quality/gold-tasks.json'),
    ragGoldText: readQualificationAsset('server/eval/rag/gold-dataset.json'),
    corpusManifestText: readQualificationAsset('server/eval/rag/guidance-corpus-manifest.json') };
}

/** Build assets contain only reviewed registry references and the canonical inputs, never a run directory. */
export function readQualificationAsset(reference: string): string {
  const root = qualificationEvidenceRoot();
  if (path.isAbsolute(reference)) throw new Error('Repository-relative qualification evidence required');
  const source = path.resolve(root, reference);
  if (!source.startsWith(`${root}${path.sep}`)) throw new Error('Qualification reference leaves package');
  const candidate = existsSync(source) ? source : path.resolve(root, 'dist/runtime-assets', reference);
  const file = realpathSync(candidate);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('Qualification evidence leaves package');
  return readFileSync(file, 'utf8');
}

function emptyQualificationPreflight(): QualificationPreflight {
  return { kind: 'qualification-prerequisites', status: 'blocked', readyToEvaluate: false, qualifiesModel: false,
    blockers: [], protocol: { id: null, status: null, approved: false },
    counts: { generationTasks: 0, extractionTasks: 0, ragPositiveItems: 0, ragNegativeControls: 0,
      ragRequiredPositiveItems: null, openGoldChecks: 0, missingGoldEvidence: 0, sourceEntries: 0, requiredSourceEntries: 0,
      reviewedSources: 0, publishers: 0, requiredPublisherTerms: 0, reviewedPublisherTerms: 0 } };
}

function preflightTaskBank(protocol: PqProtocol, bank: Row, report: QualificationPreflight): void {
  const tasks: Row[] = Array.isArray(bank.tasks) ? bank.tasks.filter(object) : [];
  for (const phase of ['generation', 'extraction'] as const) {
    const component = protocol.components[phase];
    if (!component?.required) continue;
    const runnable = tasks.filter(task => task.taskType === phase && nonempty(task.input));
    report.counts[phase === 'generation' ? 'generationTasks' : 'extractionTasks'] = runnable.length;
    const floor = component.criteria?.minTasksPerDocType;
    const perType = new Map<string, number>();
    for (const task of runnable) perType.set(String(task.docType), (perType.get(String(task.docType)) ?? 0) + 1);
    if (!Number.isSafeInteger(floor) || floor < 1 || !runnable.length || [...perType.values()].some(count => count < floor)) {
      report.blockers.push({ code: 'DOCUMENT_SAMPLE_SHORTFALL', message: `The ${phase} bank does not meet its approved per-document sample floor.` });
    }
    preflightTaskCriteria(phase, component.criteria, report);
  }
}

function preflightTaskCriteria(phase: 'generation' | 'extraction', criteria: unknown, report: QualificationPreflight): void {
  if (phase === 'extraction' && sharedExtractionCriteriaProblems(criteria).length) {
    report.blockers.push({ code: 'EXTRACTION_CRITERIA_INVALID', message: 'Extraction acceptance criteria are incomplete or malformed.' });
  }
  if (phase === 'generation' && (!object(criteria) || !unit(criteria.minSectionCoverage) ||
      typeof criteria.maxForbiddenHits !== 'number' || !Number.isSafeInteger(criteria.maxForbiddenHits) || criteria.maxForbiddenHits < 0)) {
    report.blockers.push({ code: 'GENERATION_CRITERIA_INVALID', message: 'Generation acceptance criteria are incomplete or malformed.' });
  }
}

function preflightSourceReview(report: QualificationPreflight): void {
  const count = report.counts;
  if (!count.requiredSourceEntries || count.reviewedSources < count.requiredSourceEntries) report.blockers.push({ code: 'SOURCE_REVIEW_INCOMPLETE', message: 'Required source versions, hashes or provenance remain unverified.', count: count.requiredSourceEntries - count.reviewedSources });
  if (!count.requiredPublisherTerms || count.reviewedPublisherTerms < count.requiredPublisherTerms) report.blockers.push({ code: 'PUBLISHER_TERMS_UNVERIFIED', message: 'Reuse terms for required publishers need verification.', count: count.requiredPublisherTerms - count.reviewedPublisherTerms });
}

function preflightRequiredSources(positives: Row[], sources: Row[], report: QualificationPreflight): Row[] {
  const keys = new Set(positives.flatMap(item => Array.isArray(item.expectedSourceKeys) ? item.expectedSourceKeys.filter(nonempty) : []));
  const required = sources.filter(source => keys.has(`${source.document_code}@${source.version}`));
  if (!keys.size || required.length !== keys.size || new Set(required.map(source => `${source.document_code}@${source.version}`)).size !== keys.size) {
    report.blockers.push({ code: 'SOURCE_IDENTITY_UNRESOLVED', message: 'Gold source keys do not resolve to distinct canonical source versions.' });
  }
  return required;
}

function preflightPublisherCounts(required: Row[], manifest: Row) {
  const publishers: Row = object(manifest.publishers) ? manifest.publishers : {};
  const names = new Set(required.map(source => object(source.redistribution) ? source.redistribution.termsOf : null).filter(nonempty));
  const reviewed = [...names].map(name => publishers[name]).filter(object)
    .filter(publisher => publisher.termsVerified === true && nonempty(publisher.terms) && nonempty(publisher.termsUrl));
  return { publishers: Object.keys(publishers).length, requiredPublisherTerms: names.size, reviewedPublisherTerms: reviewed.length };
}

function preflightRagBank(protocol: PqProtocol, gold: Row, manifest: Row, report: QualificationPreflight): void {
  const component = protocol.components.rag;
  if (!component?.required) return;
  const items: Row[] = Array.isArray(gold.items) ? gold.items.filter(object) : [];
  const positives = items.filter(item => !Array.isArray(item.tags) || !item.tags.includes('negative-control'));
  const sources: Row[] = Array.isArray(manifest.entries) ? manifest.entries.filter(object) : [];
  const requiredSources = preflightRequiredSources(positives, sources, report);
  const required = component.criteria?.minScoredItems;
  Object.assign(report.counts, { ragPositiveItems: positives.length, ragNegativeControls: items.length - positives.length,
    ragRequiredPositiveItems: Number.isSafeInteger(required) ? required : null,
    openGoldChecks: positives.filter(item => Array.isArray(item.openChecks) && item.openChecks.length).length,
    missingGoldEvidence: positives.filter(item => !reviewedGold(item, { keysProvisional: false })).length,
    sourceEntries: sources.length, requiredSourceEntries: requiredSources.length,
    reviewedSources: requiredSources.filter(source => reviewedSource(source, manifest)).length,
    ...preflightPublisherCounts(requiredSources, manifest) });
  if (ragCriteriaProblems(component.criteria).length) report.blockers.push({ code: 'RAG_CRITERIA_INVALID', message: 'RAG acceptance criteria are incomplete or malformed.' });
  if (!Number.isSafeInteger(required) || positives.length < required) report.blockers.push({ code: 'RAG_SAMPLE_SHORTFALL', message: 'The positive RAG bank is below its approved sample floor.', count: positives.length });
  if (gold.keysProvisional !== false) report.blockers.push({ code: 'RAG_KEYS_PROVISIONAL', message: 'Official-source version keys still require review.' });
  if (report.counts.openGoldChecks) report.blockers.push({ code: 'RAG_GOLD_OPEN_CHECKS', message: 'Gold answers retain unresolved official-text checks.', count: report.counts.openGoldChecks });
  if (report.counts.missingGoldEvidence) report.blockers.push({ code: 'RAG_GOLD_EVIDENCE_MISSING', message: 'Positive gold items lack reviewed source keys, sections or quotations.', count: report.counts.missingGoldEvidence });
  preflightSourceReview(report);
}

function preflightProtocol(protocol: PqProtocol, report: QualificationPreflight): void {
  report.protocol = { id: nonempty(protocol.protocolId) ? protocol.protocolId : null, status: nonempty(protocol.status) ? protocol.status : null,
    approved: protocol.status === 'approved' && nonempty(protocol.approvedBy) && validDate(protocol.approvedOn) };
  if (!report.protocol.approved) report.blockers.push({ code: 'PROTOCOL_NOT_APPROVED', message: 'The responsible owner has not approved the canonical qualification protocol.' });
  if (!object(protocol.components.generation) || protocol.components.generation.required !== true) report.blockers.push({ code: 'GENERATION_COMPONENT_MISSING', message: 'The canonical drafting protocol does not declare its required generation component.' });
  for (const [name, component] of Object.entries(protocol.components)) {
    if (!object(component) || !component.required) continue;
    if (!component.executable || !['generation', 'extraction', 'rag'].includes(name)) report.blockers.push({ code: 'REQUIRED_COMPONENT_UNAVAILABLE', message: 'A required qualification component cannot be executed and measured.' });
  }
}

/** Offline prerequisite diagnostics. Ready means evaluation may begin; it never establishes a model PQ PASS. */
export function qualificationPreflight(suppliedEvidence?: CanonicalPqEvidence): QualificationPreflight {
  const report = emptyQualificationPreflight();
  try {
    const evidence = suppliedEvidence ?? readCanonicalPqEvidence();
    const protocol: unknown = JSON.parse(evidence.protocolText);
    const bank: unknown = JSON.parse(evidence.docBankText);
    const gold: unknown = JSON.parse(evidence.ragGoldText);
    const manifest: unknown = JSON.parse(evidence.corpusManifestText);
    if (![protocol, bank, gold, manifest].every(object) || !object((protocol as Row).components)) throw new Error('Invalid canonical evidence');
    const p = protocol as unknown as PqProtocol;
    preflightProtocol(p, report);
    preflightTaskBank(p, bank as Row, report);
    preflightRagBank(p, gold as Row, manifest as Row, report);
  } catch { report.blockers.push({ code: 'CANONICAL_EVIDENCE_UNAVAILABLE', message: 'Canonical qualification inputs are unavailable or malformed.' }); }
  report.readyToEvaluate = report.blockers.length === 0;
  report.status = report.readyToEvaluate ? 'ready_to_evaluate' : 'blocked';
  return report;
}

function taskAttributionValid(row: Row, entry: RegistryPqClaim, rules: Rules): boolean {
  return row.servedModelVerified === true && typeof row.servedModel === 'string' &&
    (entry.pq.pinKind ? row.servedModel === entry.pinnedVersion : rules.servedModelMatches(row.servedModel, entry.pinnedVersion)) && row.servedProvider === entry.provider;
}

function taskMetricProblems(row: Row, phase: 'generation' | 'extraction'): string[] {
  const label = `${phase} ${String(row.taskId)}`;
  if (phase === 'extraction') return ['f1', 'precision', 'recall'].some(key => !unit(row[key])) ? [`${label} has invalid extraction metrics`] : [];
  const out: string[] = [];
  if (!unit(row.sectionCoverage)) out.push(`${label} has invalid section coverage`);
  if (typeof row.forbiddenHits !== 'number' || !Number.isSafeInteger(row.forbiddenHits) || row.forbiddenHits < 0) out.push(`${label} has invalid forbidden count`);
  return out;
}

function taskProblems(rows: unknown, tasks: Row[], phase: 'generation' | 'extraction', entry: RegistryPqClaim, rules: Rules): string[] {
  if (!Array.isArray(rows) || rows.some(row => !object(row))) return [`${phase} evidence is not a list of task records`];
  const problems: string[] = [];
  if (!sameIds(rows.map(row => row.taskId), tasks.map(task => String(task.id)))) problems.push(`${phase} task IDs omit, repeat or invent canonical gold tasks`);
  for (const row of rows as Row[]) {
    const task = tasks.find(t => t.id === row.taskId);
    if (!task || row.docType !== task.docType) problems.push(`${phase} ${String(row.taskId)} has no matching canonical document type`);
    if (row.error !== undefined) problems.push(`${phase} ${String(row.taskId)} carries an execution error`);
    if (!taskAttributionValid(row, entry, rules)) {
      problems.push(`${phase} ${String(row.taskId)} was not served by the exact registry model/provider`);
    }
    if (!hasCompletedProviderFlags(row)) problems.push(`${phase} ${String(row.taskId)} has no complete uncached provider output`);
    problems.push(...taskMetricProblems(row, phase));
  }
  return problems;
}

function reviewedSource(source: unknown, manifest: Row): boolean {
  if (!object(source)) return false;
  const publisher = object(manifest.publishers) && object(source.redistribution) ? manifest.publishers[source.redistribution.termsOf as string] : null;
  if (!object(publisher)) return false;
  return [source.role === 'answer-source', source.verified === true, source.versionVerified === true,
    nonempty(source.versionScheme), source.versionScheme !== 'UNPINNED', nonempty(source.sourceUrl), nonempty(source.date),
    typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256), publisher.termsVerified === true,
    nonempty(publisher.terms), nonempty(publisher.termsUrl)].every(Boolean);
}

function reviewedGold(item: Row, gold: Row): boolean {
  return [gold.keysProvisional !== true, Array.isArray(item.expectedSourceKeys) && item.expectedSourceKeys.length > 0,
    Array.isArray(item.openChecks) && item.openChecks.length === 0,
    object(item.evidence) && nonempty(item.evidence.section) && nonempty(item.evidence.quote)].every(Boolean);
}

function ragGoldProblems(item: unknown, ragItems: unknown[], gold: Row, manifest: Row): string[] {
  if (!object(item) || !nonempty(item.id) || !Array.isArray(item.expectedSourceKeys)) return ['Canonical RAG gold item is malformed'];
  const out: string[] = [];
  const negative = Array.isArray(item.tags) && item.tags.includes('negative-control');
  const row = ragItems.find(r => object(r) && r.itemId === item.id);
  if (!object(row) || row.negativeControl !== negative || !sameIds(row.expectedSourceKeys, item.expectedSourceKeys)) out.push(`RAG ${item.id} does not match canonical control/source keys`);
  if (negative) return item.expectedSourceKeys.length ? [...out, `Canonical negative control ${item.id} names sources`] : out;
  if (!reviewedGold(item, gold)) out.push(`Canonical RAG ${item.id} has unresolved source review`);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  for (const key of item.expectedSourceKeys) {
    const matches = entries.filter(e => object(e) && `${e.document_code}@${e.version}` === key);
    if (matches.length !== 1 || !reviewedSource(matches[0], manifest)) out.push(`Canonical RAG source ${String(key)} is not reviewed/version-pinned`);
  }
  return out;
}

function capturedResponseValid(row: Row, lane: 'generation' | 'judge'): boolean {
  const response = row[`${lane}Response`];
  if (!object(response)) return false;
  const model = lane === 'generation' ? row.servedModel : row.judgeServedModel;
  const provider = lane === 'generation' ? row.servedProvider : row.judgeServedProvider;
  return [nonempty(response.content), hasCompletedProviderFlags(response), response.resolvedModel === model,
    response.provider === provider, row[`${lane}ResponseSha256`] === sha(JSON.stringify(response))].every(Boolean);
}

function capturedRagProblems(row: unknown, scope: unknown): string[] {
  if (!object(row)) return ['RAG capture row is malformed'];
  if (row.generatorCalled === false && row.negativeControl === true) return []; // Pure fixed refusal is checked by the verdict.
  const out: string[] = [];
  for (const lane of ['generation', 'judge'] as const) {
    if (!capturedResponseValid(row, lane)) out.push(`RAG ${String(row.itemId)} ${lane} capture does not prove complete matching provider output/digest`);
    const request = row[`${lane}Request`];
    if (!object(request) || !object(scope) || request.organizationId !== scope.organizationId ||
        row[`${lane}RequestSha256`] !== sha(JSON.stringify(request))) out.push(`RAG ${String(row.itemId)} ${lane} request digest/placement binding is inconsistent`);
  }
  if (object(row.generationResponse) && row.answer !== row.generationResponse.content) out.push(`RAG ${String(row.itemId)} answer differs from captured output`);
  const text = object(row.judgeResponse) && typeof row.judgeResponse.content === 'string' ? row.judgeResponse.content.trim() : '';
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text) || Number(text) !== row.faithfulness) out.push(`RAG ${String(row.itemId)} faithfulness differs from the strict captured judge score`);
  return out;
}

function ragCanonicalProblems(rag: unknown, gold: Row, manifest: Row, evidence: CanonicalPqEvidence, entry: RegistryPqClaim): string[] {
  if (!object(rag) || !Array.isArray(rag.items) || !Array.isArray(gold.items)) return ['RAG record or canonical gold items are missing'];
  const problems: string[] = [];
  if (rag.goldBankSha256 !== sha(evidence.ragGoldText) || rag.corpusManifestSha256 !== sha(evidence.corpusManifestText)) problems.push('RAG gold/corpus SHA-256 does not match canonical evidence');
  if (!sameIds(rag.plannedItemIds, gold.items.map(item => item.id)) ||
      !sameIds(rag.items.map(item => item?.itemId), gold.items.map(item => item.id))) problems.push('RAG plan omits, repeats or invents canonical gold items');
  const attribution = rag.attribution;
  if (!object(attribution) || !object(attribution.generator) || attribution.generator.modelId !== entry.id ||
      attribution.generator.pinnedVersion !== entry.pinnedVersion || attribution.generator.provider !== entry.provider) problems.push('RAG generator is not the registry model being qualified');
  for (const item of gold.items) problems.push(...ragGoldProblems(item, rag.items, gold, manifest));
  for (const row of rag.items) problems.push(...capturedRagProblems(row, rag.scope));
  problems.push(...strictRagPinProblems(rag.items, entry));
  return problems;
}

function strictRagPinProblems(items: Row[], entry: RegistryPqClaim): string[] {
  return entry.pq.pinKind && items.some(row => row.generatorCalled === true &&
    (row.servedModel !== entry.pinnedVersion || row.servedProvider !== entry.provider))
    ? ['strict RAG output differs from the immutable registry pin'] : [];
}

function recordHeaderProblems(rec: Row, entry: RegistryPqClaim): string[] {
  const problems: string[] = [];
  if (rec.modelId !== entry.id) problems.push(`record is for "${String(rec.modelId)}"`);
  if (rec.pinnedVersion !== entry.pinnedVersion) problems.push(`record qualified ${String(rec.pinnedVersion)}; re-qualification is owed`);
  if (!nonempty(entry.provider) || rec.provider !== entry.provider) problems.push('record provider is missing or differs from the registry');
  if (entry.pq.intendedUses !== undefined && (!entry.pq.intendedUses.length ||
      new Set(entry.pq.intendedUses).size !== entry.pq.intendedUses.length ||
      !sameIds(rec.intendedUses, [...entry.pq.intendedUses]))) problems.push('record intended uses are missing, duplicated or differ from the registry');
  if (entry.pq.status === 'failed') {
    if (rec.verdict !== 'FAIL') problems.push(`claims failed; the record says ${String(rec.verdict)}`);
    return problems;
  }
  if (rec.verdict !== 'PASS') problems.push(`claims passed; the record says ${String(rec.verdict)}`);
  if (rec.protocolStatus !== 'approved') problems.push(`record ran against a ${String(rec.protocolStatus)} protocol`);
  return problems;
}

function protocolProblems(protocol: PqProtocol, rec: Row, text: string): string[] {
  const out: string[] = [];
  if (![protocol.status === 'approved', nonempty(protocol.approvedBy), validDate(protocol.approvedOn)].every(Boolean)) out.push('canonical protocol is not approved with a valid owner/date');
  if (rec.protocolId !== protocol.protocolId || rec.protocolVersion !== protocol.version || rec.protocolSha256 !== sha(text)) out.push('protocol identity/SHA-256 differs from the current canonical protocol');
  const gen = protocol.components.generation?.criteria;
  const known = ['minSectionCoverage', 'maxForbiddenHits', 'minTasksPerDocType'];
  if (!gen || Object.keys(gen).some(k => !known.includes(k)) || !unit(gen.minSectionCoverage) ||
      !Number.isSafeInteger(gen.maxForbiddenHits) || gen.maxForbiddenHits < 0 || !Number.isSafeInteger(gen.minTasksPerDocType) || gen.minTasksPerDocType < 1) out.push('canonical generation criteria are malformed or unmeasured');
  return out;
}

function extractionCriteriaProblems(protocol: PqProtocol): string[] {
  const ext = protocol.components.extraction;
  if (!ext?.required) return [];
  // The one reading of the extraction criteria the verdict applies (pq-criteria.ts), its sample floor included.
  return object(ext.criteria) && sharedExtractionCriteriaProblems(ext.criteria).length === 0
    ? [] : ['canonical extraction criteria are malformed or unmeasured'];
}

function canonicalProblems(rec: Row, entry: RegistryPqClaim, rules: Rules, evidence: CanonicalPqEvidence): string[] {
  const problems: string[] = [];
  try {
    const protocol = JSON.parse(evidence.protocolText) as PqProtocol;
    const bank = JSON.parse(evidence.docBankText) as Row;
    const gold = JSON.parse(evidence.ragGoldText) as Row;
    const manifest = JSON.parse(evidence.corpusManifestText) as Row;
    problems.push(...protocolProblems(protocol, rec, evidence.protocolText), ...extractionCriteriaProblems(protocol));
    if (rec.goldBankVersion !== bank.version || rec.goldBankSha256 !== sha(evidence.docBankText)) problems.push('gold bank version/SHA-256 differs from canonical tasks');
    if (!Array.isArray(bank.tasks) || bank.tasks.some(t => !object(t) || !nonempty(t.id) || !nonempty(t.docType)) ||
        new Set(bank.tasks.map(t => t.id)).size !== bank.tasks.length) throw new Error('invalid canonical task bank');
    const runnable = (task: Row) => nonempty(task.input);
    const gen = bank.tasks.filter(t => t.taskType === 'generation' && runnable(t));
    const ext = bank.tasks.filter(t => t.taskType === 'extraction' && runnable(t) && object(t.expectedFields) && Object.keys(t.expectedFields).length);
    problems.push(...taskProblems(rec.generation, gen, 'generation', entry, rules));
    if (protocol.components.extraction?.required) problems.push(...taskProblems(rec.extraction, ext, 'extraction', entry, rules));
    if (protocol.components.rag?.required) problems.push(...ragCanonicalProblems(rec.rag, gold, manifest, evidence, entry));
    if (!problems.length) {
      const recomputed = rules.computeVerdict(protocol, rec.generation as never, (rec.extraction ?? []) as never, rec.rag as never);
      if (recomputed.verdict !== 'PASS') problems.push(`recomputed complete-component verdict is ${recomputed.verdict}: ${recomputed.reasons.join('; ')}`);
    }
  } catch { problems.push('canonical qualification evidence is unavailable or malformed; no PASS can be verified'); }
  return problems;
}

/** Rules are injected by pq-verdict, avoiding a runtime module initialization cycle. */
export function verifyCanonicalPqClaim(entry: RegistryPqClaim, readRecord: (ref: string) => unknown,
  rules: Rules, suppliedEvidence?: CanonicalPqEvidence): string[] {
  const label = (reason: string) => `${entry.id}: ${reason}`;
  if (entry.pq.status === 'pending') return entry.pq.reference === null ? [] : [label('pending PQ cites a record — record the outcome or drop the reference')];
  if (!['passed', 'failed'].includes(entry.pq.status)) return [label('unknown PQ status')];
  if (!nonempty(entry.pq.reference)) return [label(`pq.status is "${entry.pq.status}" with no record to point at`)];
  let rec: unknown;
  try { rec = readRecord(entry.pq.reference); } catch { return [label(`cannot read PQ record ${entry.pq.reference}`)]; }
  if (!object(rec) || rec.kind !== 'pq-record') return [label(`${entry.pq.reference} is not a PQ record`)];
  const problems = recordHeaderProblems(rec, entry);
  if (entry.pq.status === 'failed') return problems.map(label);
  try { problems.push(...canonicalProblems(rec, entry, rules, suppliedEvidence ?? readCanonicalPqEvidence())); }
  catch { problems.push('canonical qualification evidence is unavailable or malformed; no PASS can be verified'); }
  return problems.map(label);
}
