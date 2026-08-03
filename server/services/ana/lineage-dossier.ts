/**
 * Document Lineage & Decision Dossier assembler.
 *
 * Converges — at read time, for a single generated document (artifact) — the
 * platform's existing-but-fragmented lineage sources into one auditable,
 * reportable dossier answering: "what data and what decisions (AnA's and the
 * human's) produced this document, across every iteration?"
 *
 * It reuses the AnALedger collector (`collectArtifactLedger`) for the base
 * record — artifact + active version + citations + authoring plan + regulatory
 * audit log + e-signatures + rewrite proposals + citation runs — and adds the
 * sections the AnALedger (a docx-export payload) does not carry:
 *
 *   - versionHistory  — every iteration (concept2cure_artifact_versions)
 *   - decisions       — AI-vs-human decision records anchored to the artifact
 *                       (decision_records: related_/executed_artifact_id)
 *   - provenanceEvents— the "how this was made" event ledger
 *                       (concept2cure_provenance_events)
 *   - reasoning       — AnA's persisted thought process per turn
 *                       (chat_messages.metadata.reasoning for the artifact thread)
 *   - dataLineage     — evidence source → content links
 *                       (data_lineage_records targeting the artifact / its thread)
 *
 * Every satellite query is tenant-scoped and tolerant of a missing/unmigrated
 * table (contributes an empty array), mirroring the AnALedger collector — the
 * dossier always assembles from whatever is available. The pure derivation
 * helpers (`deriveDecisionActors`, `summarizeDecisions`) are exported for unit
 * testing without a database.
 *
 * @module server/services/ana/lineage-dossier
 */
import { getPool } from '../../db/runtime.js';
import {
  collectArtifactLedger,
  type ArtifactLedger,
} from '../export/docx-ledger-collector.js';

export const DOSSIER_SCHEMA_VERSION = '1.0';

/** How many rows to pull per satellite source — bounds the dossier payload. */
const MAX_VERSIONS = 200;
const MAX_DECISIONS = 300;
const MAX_PROVENANCE = 500;
const MAX_REASONING_TURNS = 100;
const MAX_DATA_LINEAGE = 500;
/** Per-turn reasoning excerpt cap so one huge turn can't dominate the payload. */
const REASONING_EXCERPT_CHARS = 8_000;

function isMissingTable(err: any): boolean {
  return err?.code === '42P01';
}

function warnUnless42P01(source: string, err: any): void {
  if (!isMissingTable(err)) {
    console.warn(`[lineage-dossier] ${source} load failed:`, err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Who authored / decided a decision record. Derived, not a stored column. */
export type DecisionActor = 'ana' | 'human' | 'system';

export interface DossierVersion {
  version: number;
  contentHash: string | null;
  changeDescription: string | null;
  contentLength: number;
  createdById: number | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface DossierDecision {
  id: string;
  contextType: string;
  contextDescription: string | null;
  recommendationType: string | null;
  recommendationSummary: string;
  confidence: string;
  actionState: string;
  approvalState: string | null;
  governanceBoundary: string | null;
  /** Derived: who proposed the decision (AnA vs a human user). */
  authoredBy: DecisionActor;
  /** Derived: who resolved it (approved/rejected by a human), else null (pending). */
  decidedBy: DecisionActor | null;
  createdById: number | null;
  approvedById: number | null;
  approvedAt: string | null;
  rejectedById: number | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  relatedArtifactVersionId: number | null;
  executedArtifactVersionId: number | null;
  evidenceSources: string[];
  createdAt: string;
}

export interface DossierDecisionSummary {
  total: number;
  anaAuthored: number;
  humanAuthored: number;
  humanDecided: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface DossierProvenanceEvent {
  eventId: string;
  eventType: string;
  eventAction: string;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  artifactVersionId: number | null;
  sourceDescription: string | null;
  backendService: string | null;
  details: unknown;
  createdAt: string;
}

export interface DossierReasoningTurn {
  turn: number;
  reasoning: string;
  model: string | null;
  createdAt: string | null;
}

export interface DossierHumanControl {
  /** The assistant turn (1-based) the control was recorded against. */
  turn: number;
  action: 'pause' | 'resume' | 'interject' | 'cancel';
  message: string | null;
  round: number | null;
  at: string | null;
}

export interface DossierDataLineage {
  sourceObjectType: string;
  sourceObjectId: string;
  sourceTitle: string | null;
  sourceContentHash: string | null;
  targetObjectType: string;
  targetObjectId: string;
  linkageType: string;
  transformationType: string | null;
  confidenceScore: number | null;
  aiModelUsed: string | null;
  createdAt: string;
}

export interface DocumentLineageDossier {
  schemaVersion: string;
  generatedAt: string;
  /** The AnALedger base record (artifact, org, project, citations, plan, audit, signatures, proposals, runs). */
  ledger: ArtifactLedger;
  /** The AnA conversation thread that authored this document, if known. */
  threadId: string | null;
  versionHistory: DossierVersion[];
  decisions: DossierDecision[];
  decisionSummary: DossierDecisionSummary;
  provenanceEvents: DossierProvenanceEvent[];
  reasoning: DossierReasoningTurn[];
  /** Human control actions (pause/interject/redirect/cancel) across the turns. */
  humanControls: DossierHumanControl[];
  dataLineage: DossierDataLineage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure derivation helpers (unit-tested without a DB)
// ─────────────────────────────────────────────────────────────────────────────

/** Raw decision_records shape needed to derive actors (subset of columns). */
export interface RawDecisionRow {
  created_by_id: number | null;
  approved_by_id: number | null;
  rejected_by_id: number | null;
  provenance?: unknown;
}

/**
 * Derive who authored and who decided a decision record.
 *
 * `decision_records` has no explicit AI/human flag: by platform convention AI
 * attribution lives in the `provenance` JSON while a null `created_by_id` marks
 * an AnA-proposed decision (the durable FK is human-only). So:
 *   - authoredBy: an explicit provenance.createdByType wins; else a present
 *     human `created_by_id` ⇒ 'human'; else ⇒ 'ana' (AnA proposed it).
 *   - decidedBy: a rejecting or approving human user ⇒ 'human'; else null (the
 *     decision is still pending a human).
 */
export function deriveDecisionActors(row: RawDecisionRow): {
  authoredBy: DecisionActor;
  decidedBy: DecisionActor | null;
} {
  const prov =
    row.provenance && typeof row.provenance === 'object'
      ? (row.provenance as Record<string, unknown>)
      : undefined;
  const declared = typeof prov?.createdByType === 'string' ? prov.createdByType : undefined;

  let authoredBy: DecisionActor;
  if (declared === 'human' || declared === 'ana' || declared === 'system') {
    authoredBy = declared;
  } else if (row.created_by_id != null) {
    authoredBy = 'human';
  } else {
    authoredBy = 'ana';
  }

  const decidedBy: DecisionActor | null =
    row.rejected_by_id != null || row.approved_by_id != null ? 'human' : null;

  return { authoredBy, decidedBy };
}

/** Roll a set of decisions up into the dossier headline counts. */
export function summarizeDecisions(decisions: DossierDecision[]): DossierDecisionSummary {
  const summary: DossierDecisionSummary = {
    total: decisions.length,
    anaAuthored: 0,
    humanAuthored: 0,
    humanDecided: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
  };
  for (const d of decisions) {
    if (d.authoredBy === 'ana') summary.anaAuthored += 1;
    else if (d.authoredBy === 'human') summary.humanAuthored += 1;
    if (d.decidedBy === 'human') summary.humanDecided += 1;
    if (d.rejectedById != null) summary.rejected += 1;
    else if (d.approvedById != null) summary.approved += 1;
    else summary.pending += 1;
  }
  return summary;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Satellite loaders (tenant-scoped, tolerant of missing tables)
// ─────────────────────────────────────────────────────────────────────────────

async function loadThreadId(
  artifactId: string,
  organizationId: number,
): Promise<string | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT ana_thread_id FROM concept2cure_artifacts
       WHERE artifact_id = $1 AND organization_id = $2 LIMIT 1`,
      [artifactId, organizationId],
    );
    return rows[0]?.ana_thread_id ?? null;
  } catch (err) {
    warnUnless42P01('thread', err);
    return null;
  }
}

async function loadVersionHistory(
  artifactPk: number,
  organizationId: number,
  currentVersion: number,
): Promise<DossierVersion[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT version, content_hash, change_description,
              COALESCE(LENGTH(content), 0) AS content_length,
              created_by_id, created_at
       FROM concept2cure_artifact_versions
       WHERE artifact_id = $1 AND organization_id = $2
       ORDER BY version ASC
       LIMIT ${MAX_VERSIONS}`,
      [artifactPk, organizationId],
    );
    return rows.map((r: any) => ({
      version: Number(r.version),
      contentHash: r.content_hash ?? null,
      changeDescription: r.change_description ?? null,
      contentLength: Number(r.content_length ?? 0),
      createdById: r.created_by_id ?? null,
      createdAt: toIso(r.created_at),
      isCurrent: Number(r.version) === currentVersion,
    }));
  } catch (err) {
    warnUnless42P01('versions', err);
    return [];
  }
}

async function loadDecisions(
  artifactPk: number,
  organizationId: number,
): Promise<DossierDecision[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, context_type, context_description, recommendation_type,
              recommendation_summary, confidence, action_state, approval_state,
              governance_boundary, created_by_id, approved_by_id, approved_at,
              rejected_by_id, rejected_at, rejection_reason,
              related_artifact_version_id, executed_artifact_version_id,
              evidence_sources, provenance, created_at
       FROM decision_records
       WHERE organization_id = $2
         AND (related_artifact_id = $1 OR executed_artifact_id = $1)
       ORDER BY created_at ASC
       LIMIT ${MAX_DECISIONS}`,
      [artifactPk, organizationId],
    );
    return rows.map((r: any) => {
      const { authoredBy, decidedBy } = deriveDecisionActors({
        created_by_id: r.created_by_id ?? null,
        approved_by_id: r.approved_by_id ?? null,
        rejected_by_id: r.rejected_by_id ?? null,
        provenance: r.provenance,
      });
      return {
        id: String(r.id),
        contextType: r.context_type ?? 'unknown',
        contextDescription: r.context_description ?? null,
        recommendationType: r.recommendation_type ?? null,
        recommendationSummary: r.recommendation_summary ?? '',
        confidence: r.confidence ?? 'provisional',
        actionState: r.action_state ?? 'recommended_only',
        approvalState: r.approval_state ?? null,
        governanceBoundary: r.governance_boundary ?? null,
        authoredBy,
        decidedBy,
        createdById: r.created_by_id ?? null,
        approvedById: r.approved_by_id ?? null,
        approvedAt: r.approved_at ? toIso(r.approved_at) : null,
        rejectedById: r.rejected_by_id ?? null,
        rejectedAt: r.rejected_at ? toIso(r.rejected_at) : null,
        rejectionReason: r.rejection_reason ?? null,
        relatedArtifactVersionId: r.related_artifact_version_id ?? null,
        executedArtifactVersionId: r.executed_artifact_version_id ?? null,
        evidenceSources: coerceStringArray(r.evidence_sources),
        createdAt: toIso(r.created_at),
      } satisfies DossierDecision;
    });
  } catch (err) {
    warnUnless42P01('decisions', err);
    return [];
  }
}

async function loadProvenanceEvents(
  artifactPk: number,
  organizationId: number,
): Promise<DossierProvenanceEvent[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT event_id, event_type, event_action, actor_id, actor_name,
              actor_email, artifact_version_id, source_description,
              backend_service, details, created_at
       FROM concept2cure_provenance_events
       WHERE artifact_id = $1 AND organization_id = $2
       ORDER BY created_at ASC
       LIMIT ${MAX_PROVENANCE}`,
      [artifactPk, organizationId],
    );
    return rows.map((r: any) => ({
      eventId: String(r.event_id),
      eventType: r.event_type ?? 'unknown',
      eventAction: r.event_action ?? 'unknown',
      actorId: r.actor_id ?? null,
      actorName: r.actor_name ?? null,
      actorEmail: r.actor_email ?? null,
      artifactVersionId: r.artifact_version_id ?? null,
      sourceDescription: r.source_description ?? null,
      backendService: r.backend_service ?? null,
      details: r.details ?? null,
      createdAt: toIso(r.created_at),
    }));
  } catch (err) {
    warnUnless42P01('provenance', err);
    return [];
  }
}

/** Parse a chat_messages.metadata cell that may be json/jsonb (object) or text. */
function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Load AnA's persisted reasoning AND the human control actions for a thread's
 * assistant turns — both live on `chat_messages.metadata`, so one query yields
 * both. Turn numbering is 1-based over all assistant messages so reasoning and
 * controls share a consistent turn index.
 */
async function loadTurnRecords(
  threadId: string | null,
): Promise<{ reasoning: DossierReasoningTurn[]; humanControls: DossierHumanControl[] }> {
  if (!threadId) return { reasoning: [], humanControls: [] };
  try {
    const { rows } = await getPool().query(
      `SELECT metadata, model, created_at
       FROM chat_messages
       WHERE thread_id = $1 AND role = 'assistant'
       ORDER BY created_at ASC
       LIMIT ${MAX_REASONING_TURNS}`,
      [threadId],
    );
    const reasoning: DossierReasoningTurn[] = [];
    const humanControls: DossierHumanControl[] = [];
    let turn = 0;
    for (const r of rows as any[]) {
      turn += 1;
      const meta = parseMetadata(r.metadata);
      if (!meta) continue;
      const createdAt = r.created_at ? toIso(r.created_at) : null;

      const reasoningText = typeof meta.reasoning === 'string' ? meta.reasoning.trim() : '';
      if (reasoningText) {
        reasoning.push({
          turn,
          reasoning:
            reasoningText.length > REASONING_EXCERPT_CHARS
              ? `${reasoningText.slice(0, REASONING_EXCERPT_CHARS)}…`
              : reasoningText,
          model: r.model ?? null,
          createdAt,
        });
      }

      if (Array.isArray(meta.humanControls)) {
        for (const c of meta.humanControls as any[]) {
          if (!c || typeof c.action !== 'string') continue;
          humanControls.push({
            turn,
            action: c.action,
            message: typeof c.message === 'string' ? c.message : null,
            round: typeof c.round === 'number' ? c.round : null,
            at: typeof c.at === 'string' ? c.at : createdAt,
          });
        }
      }
    }
    return { reasoning, humanControls };
  } catch (err) {
    warnUnless42P01('turn-records', err);
    return { reasoning: [], humanControls: [] };
  }
}

async function loadDataLineage(
  artifactId: string,
  threadId: string | null,
  organizationId: number,
): Promise<DossierDataLineage[]> {
  try {
    // Lineage rows target either the artifact directly or the authoring thread
    // (the streaming path records evidence lineage against the answer/thread).
    const targets = [artifactId, ...(threadId ? [threadId] : [])];
    const { rows } = await getPool().query(
      `SELECT source_object_type, source_object_id, source_title,
              source_content_hash, target_object_type, target_object_id,
              linkage_type, transformation_type, confidence_score,
              ai_model_used, created_at
       FROM data_lineage_records
       WHERE organization_id = $1 AND target_object_id = ANY($2)
       ORDER BY created_at ASC
       LIMIT ${MAX_DATA_LINEAGE}`,
      [organizationId, targets],
    );
    return rows.map((r: any) => ({
      sourceObjectType: r.source_object_type ?? 'unknown',
      sourceObjectId: String(r.source_object_id ?? ''),
      sourceTitle: r.source_title ?? null,
      sourceContentHash: r.source_content_hash ?? null,
      targetObjectType: r.target_object_type ?? 'unknown',
      targetObjectId: String(r.target_object_id ?? ''),
      linkageType: r.linkage_type ?? 'unknown',
      transformationType: r.transformation_type ?? null,
      confidenceScore: r.confidence_score != null ? Number(r.confidence_score) : null,
      aiModelUsed: r.ai_model_used ?? null,
      createdAt: toIso(r.created_at),
    }));
  } catch (err) {
    warnUnless42P01('data-lineage', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the full lineage & decision dossier for one document (artifact).
 *
 * Returns null when the artifact does not exist for the tenant (the base
 * AnALedger collector returns null). Otherwise always returns a dossier — any
 * unavailable satellite source contributes an empty section.
 */
export async function buildDocumentLineageDossier(
  artifactId: string,
  organizationId: number,
): Promise<DocumentLineageDossier | null> {
  const ledger = await collectArtifactLedger(artifactId, organizationId);
  if (!ledger) return null;

  const artifactPk = ledger.artifact.artifactPk;
  const threadId = await loadThreadId(artifactId, organizationId);

  const [versionHistory, decisions, provenanceEvents, turnRecords, dataLineage] =
    await Promise.all([
      loadVersionHistory(artifactPk, organizationId, ledger.artifact.version),
      loadDecisions(artifactPk, organizationId),
      loadProvenanceEvents(artifactPk, organizationId),
      loadTurnRecords(threadId),
      loadDataLineage(artifactId, threadId, organizationId),
    ]);

  return {
    schemaVersion: DOSSIER_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ledger,
    threadId,
    versionHistory,
    decisions,
    decisionSummary: summarizeDecisions(decisions),
    provenanceEvents,
    reasoning: turnRecords.reasoning,
    humanControls: turnRecords.humanControls,
    dataLineage,
  };
}
