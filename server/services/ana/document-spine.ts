/**
 * The canonical regulated-document revision spine.
 *
 * ONE atomic flow every AnA-authored document mutation runs through, over the
 * canonical document identity (concept2cure_artifacts). It replaces the
 * previously-scattered "create a version here, log an action there, maybe
 * recompute readiness somewhere else" with a single connected operation:
 *
 *   AnA prepares a revision
 *     1. a new canonical version is created           (concept2cure_artifact_versions)
 *     2. the AI action is recorded                    ┐ recordGovernedAction writes
 *     4. an audit event is written                    ┘ c2c_ana_actions + audit_logs (sha256 chain)
 *     6. review state is updated                       (concept2cure_artifacts.status → review)
 *     7. dossier placement is refreshed               (concept2cure_artifacts.ctd_section)
 *   — steps 1,2,4,6,7 commit in a SINGLE transaction, so a version can never
 *     exist without its audit row, nor a status flip without its version —
 *   then, immediately after commit (awaited, still part of the guarantee):
 *     3. sources / provenance are recorded            (data_lineage_records, append-only)
 *     5. readiness is recalculated                    (project-readiness-aggregator)
 *     +  the UI is notified to refresh
 *
 * Steps 3 and 5 are intentionally post-commit: lineage is an append-only audit
 * trail written through its own recorder, and readiness is a DERIVED figure that
 * must be recomputed from the committed state — neither can be produced from
 * inside the transaction that is creating that state. They are still awaited, so
 * the flow only reports success once all seven have run.
 *
 * The core (commitCanonicalRevision) is dependency-injected and I/O-free, so the
 * ordering and atomicity contract is unit-tested with no database, exactly like
 * the agentic loop. defaultSpineDeps() wires the real services; the handler is
 * registered via the inject-and-sibling pattern to avoid an import cycle.
 *
 * @module server/services/ana/document-spine
 */

import type { PoolClient } from 'pg';
import type { AnaTool } from '../ai-gateway/types';
import type { ToolContext } from './AnaToolExecutor.js';
import type { ReadinessComponentKey } from './project-readiness-aggregator.js';
import { STATED_REASON_INPUT, gatedReason, requireStatedReason } from './stated-reason-input.js';
import { moveArtifactToSection } from '../artifact-approval-act';

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

export interface CanonicalRevisionRequest {
  organizationId: number;
  projectId: number;
  /** The actor on whose behalf the revision is committed (Part 11 attribution). */
  userId?: number | null;
  anaThreadId: string;
  title: string;
  content: string;
  documentType?: string;
  /**
   * The person's stated reason for the change (at least 8 characters, trimmed),
   * recorded on the version and as the ledger row's reason. Required: the
   * spine records no reason nobody gave (2026-09-29; it used to write
   * `AnA revised "<title>" (v<n>)` when none was passed). A caller with no
   * person's reason does not commit through the spine.
   */
  reasonForChange: string;
  /** eCTD section to place the artifact at (step 7). Omit to leave placement as-is. */
  ctdSection?: string | null;
  /**
   * The model call that produced the revision, as the gateway reported it
   * (ToolContext.servingModel), recorded on the AI-action ledger. Never a name
   * the model gives for itself: until 2026-11-10 this was `aiModelUsed`, a
   * string the tool read from the model's own input. Absent or null when the
   * caller was told of no model, and the ledger then says so (null).
   */
  servingModel?: ServedModelCall | null;
  /** Flip the artifact into review state (step 6). Default true. */
  triggerReview?: boolean;
  /** Provenance records to persist as lineage (step 3). Opaque to the core. */
  provenance?: unknown[];
}

/** The model call that served a turn: ToolContext.servingModel, as the gateway reported it. */
export type ServedModelCall = NonNullable<ToolContext['servingModel']>;

/**
 * The readiness figure recomputed after a revision. 2026-10-15: this was the
 * bare score, so a score that left components out (no scan on record, or a
 * store that could not be read) was reported as the whole readiness figure.
 */
export interface SpineReadiness {
  /** 0–100 over the components that were measured. */
  score: number;
  /** Components the score leaves out because they were not assessed. */
  notAssessed: ReadinessComponentKey[];
}

export interface VersionWriteResult {
  artifactId: string;
  artifactPk: number;
  version: number;
  created: boolean;
  contentHash: string;
}

export interface CanonicalRevisionResult {
  artifactId: string;
  artifactPk: number;
  version: number;
  created: boolean;
  contentHash: string;
  status: string;
  ctdSection: string | null;
  actionId: string | null;
  auditId: string | null;
  provenanceLinks: number;
  readiness: SpineReadiness | null;
  /** Ordered record of the steps that ran — surfaced to the model and asserted in tests. */
  steps: string[];
}

/** The injected step surface — real implementations in defaultSpineDeps(). */
export interface SpineDeps {
  /** Run `fn` inside one transaction with tenant context set; commit or rollback. */
  withTransaction<T>(organizationId: number, fn: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Step 1 — append a canonical version (in the caller's tx). */
  writeVersionTx(client: PoolClient, req: CanonicalRevisionRequest): Promise<VersionWriteResult>;
  /** Steps 2 + 4 — record the AI action and the audit event (in the caller's tx). */
  recordGovernedActionTx(
    client: PoolClient,
    args: {
      organizationId: number;
      userId: number;
      target: string;
      reason: string;
      command: string;
      payload: Record<string, unknown>;
    },
  ): Promise<{ actionId: string; auditId: string }>;
  /** Step 6 — flip the artifact into review; returns the effective status. */
  setReviewStatusTx(client: PoolClient, artifactPk: number, organizationId: number): Promise<string>;
  /** Step 7 — set/refresh dossier placement; returns the effective ctd_section. */
  setPlacementTx(
    client: PoolClient,
    artifactPk: number,
    organizationId: number,
    ctdSection: string | null,
  ): Promise<string | null>;
  /** Step 3 — persist provenance as lineage (post-commit, append-only, fail-soft). */
  persistProvenance(req: CanonicalRevisionRequest, artifactId: string): Promise<number>;
  /** Step 5 — recompute readiness from committed state (post-commit). */
  recomputeReadiness(organizationId: number, projectId: number): Promise<SpineReadiness | null>;
  /** Notify the UI to refresh (post-commit). */
  emitRefresh(event: {
    organizationId: number;
    projectId: number;
    artifactId: string;
    version: number;
    status: string;
  }): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// The atomic flow (pure orchestration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commit a canonical document revision through the full spine. Throws (and rolls
 * the transaction back) if any of the atomic-core steps fail; the post-commit
 * steps are awaited so the returned result reflects the whole flow.
 */
export async function commitCanonicalRevision(
  req: CanonicalRevisionRequest,
  deps: SpineDeps,
): Promise<CanonicalRevisionResult> {
  if (!Number.isFinite(req.organizationId) || !Number.isFinite(req.projectId)) {
    throw new Error('commitCanonicalRevision requires organizationId and projectId.');
  }
  if (!req.anaThreadId || !req.title || typeof req.content !== 'string' || req.content.length === 0) {
    throw new Error('commitCanonicalRevision requires anaThreadId, title and non-empty content.');
  }
  // The person's reason, or nothing is opened: ReasonNotStatedError before the
  // transaction. The tool handler has already asked (gatedReason); this holds
  // every other caller of the core to the same rule.
  const reason = requireStatedReason(req.reasonForChange, 'reason_for_change');

  const steps: string[] = [];
  const triggerReview = req.triggerReview !== false;

  // ── Atomic governed core: version + AI action + audit + review + placement ──
  const core = await deps.withTransaction(req.organizationId, async (client) => {
    const version = await deps.writeVersionTx(client, { ...req, reasonForChange: reason });
    steps.push('version');

    const gov = await deps.recordGovernedActionTx(client, {
      organizationId: req.organizationId,
      userId: req.userId ?? 0,
      target: `artifact:${version.artifactId}`,
      command: version.created ? 'update' : 'reaffirm',
      reason,
      payload: {
        title: req.title,
        version: version.version,
        contentHash: version.contentHash,
        documentType: req.documentType ?? null,
        // The served model call, in the agent-audit shape (agentAuditDetails,
        // ana-ri/mdx-tool-policy): provider and model, and the gateway request
        // that joins this row to its ai.gateway_audit_log row. Null is "not
        // known"; a model is never named on the model's own word.
        gatewayRequestId: req.servingModel?.requestId ?? null,
        servingModel: { provider: req.servingModel?.provider ?? null, model: req.servingModel?.model ?? null },
      },
    });
    steps.push('ai_action', 'audit');

    let status = 'draft';
    if (triggerReview) {
      status = await deps.setReviewStatusTx(client, version.artifactPk, req.organizationId);
      steps.push('review');
    }

    const ctdSection = await deps.setPlacementTx(
      client,
      version.artifactPk,
      req.organizationId,
      req.ctdSection ?? null,
    );
    steps.push('placement');

    return { version, gov, status, ctdSection };
  });

  // ── Post-commit, awaited: provenance (append-only), readiness (derived), UI ──
  let provenanceLinks = 0;
  if (Array.isArray(req.provenance) && req.provenance.length > 0) {
    provenanceLinks = await deps.persistProvenance(req, core.version.artifactId);
    steps.push('provenance');
  }

  const readiness = await deps.recomputeReadiness(req.organizationId, req.projectId);
  steps.push('readiness');

  deps.emitRefresh({
    organizationId: req.organizationId,
    projectId: req.projectId,
    artifactId: core.version.artifactId,
    version: core.version.version,
    status: core.status,
  });
  steps.push('ui_refresh');

  return {
    artifactId: core.version.artifactId,
    artifactPk: core.version.artifactPk,
    version: core.version.version,
    created: core.version.created,
    contentHash: core.version.contentHash,
    status: core.status,
    ctdSection: core.ctdSection,
    actionId: core.gov.actionId,
    auditId: core.gov.auditId,
    provenanceLinks,
    readiness,
    steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real dependency wiring
// ─────────────────────────────────────────────────────────────────────────────

/** Status values that must not be silently downgraded into review. */
const LOCKED_STATUSES = ['locked', 'frozen', 'approved', 'submission_ready', 'submitted'];

/** Build the production SpineDeps, wiring the real services (all dynamic-imported). */
export function defaultSpineDeps(): SpineDeps {
  return {
    async withTransaction(organizationId, fn) {
      const { getPool } = await import('../../db.js');
      const { setTenantContextTx } = await import('../tenant/governed-tenant-context.js');
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await setTenantContextTx(client, organizationId);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },

    async writeVersionTx(client, req) {
      const { upsertDocumentArtifactVersionTx } = await import('./artifactVersionStore.js');
      const r = await upsertDocumentArtifactVersionTx(client, {
        organizationId: req.organizationId,
        projectId: req.projectId,
        userId: req.userId ?? null,
        anaThreadId: req.anaThreadId,
        title: req.title,
        content: req.content,
        documentType: req.documentType,
        reasonForChange: req.reasonForChange,
      });
      return {
        artifactId: r.artifactId,
        artifactPk: r.artifactPk,
        version: r.version,
        created: r.created,
        contentHash: r.contentHash,
      };
    },

    async recordGovernedActionTx(client, args) {
      const { recordGovernedAction } = await import('../../routes/c2c/actions.js');
      const res = await recordGovernedAction(client, {
        orgId: args.organizationId,
        userId: args.userId,
        command: args.command,
        target: args.target,
        reason: args.reason,
        payload: args.payload,
        domain: 'authoring',
        surface: 'ana',
      });
      return { actionId: res.actionId, auditId: res.auditId };
    },

    async setReviewStatusTx(client, artifactPk, organizationId) {
      // Flip draft-ish artifacts into review; never downgrade a locked/approved one.
      const updated = await client.query(
        `UPDATE concept2cure_artifacts
            SET status = 'review', updated_at = now()
          WHERE id = $1 AND organization_id = $2
            AND status <> ALL($3::text[])
          RETURNING status`,
        [artifactPk, organizationId, LOCKED_STATUSES],
      );
      if (updated.rows.length > 0) return String(updated.rows[0].status);
      const current = await client.query(
        `SELECT status FROM concept2cure_artifacts WHERE id = $1 AND organization_id = $2`,
        [artifactPk, organizationId],
      );
      return current.rows.length > 0 ? String(current.rows[0].status) : 'unknown';
    },

    async setPlacementTx(client, artifactPk, organizationId, ctdSection) {
      if (ctdSection && ctdSection.trim()) {
        // P-95 Q2 (2026-11-09): a move voids review decisions, as an edit does.
        const moved = await moveArtifactToSection(client, artifactPk, organizationId, ctdSection.trim());
        return moved ? (moved.ctd_section ?? null) : null;
      }
      const r = await client.query(
        `SELECT ctd_section FROM concept2cure_artifacts WHERE id = $1 AND organization_id = $2`,
        [artifactPk, organizationId],
      );
      return r.rows.length > 0 ? (r.rows[0].ctd_section ?? null) : null;
    },

    async persistProvenance(req, artifactId) {
      try {
        const records = (req.provenance ?? []) as import('../evidence/provenance.js').ProvenanceRecord[];
        if (!records.length) return 0;
        const { persistProvenance } = await import('../evidence/persist-provenance.js');
        return await persistProvenance(records, {
          organizationId: req.organizationId,
          projectId: req.projectId,
          targetObjectType: 'artifact',
          targetObjectId: artifactId,
          targetTitle: req.title,
          createdById: req.userId ?? undefined,
          // The served model's name, as the stream records it on its own lineage rows.
          aiModelUsed: req.servingModel?.model ?? undefined,
        });
      } catch {
        return 0; // append-only lineage is best-effort; never fail the revision on it
      }
    },

    async recomputeReadiness(organizationId, projectId) {
      try {
        const { getProjectReadinessAggregate } = await import('./project-readiness-aggregator.js');
        const agg = await getProjectReadinessAggregate(projectId, organizationId);
        return typeof agg.score === 'number'
          ? { score: agg.score, notAssessed: agg.notAssessed.map(n => n.component) }
          : null;
      } catch {
        return null; // derived figure; a recompute hiccup never fails the revision
      }
    },

    emitRefresh(event) {
      // No general socket broadcast bus exists yet; the returned result carries
      // everything the client needs on its next poll of the readiness / artifact
      // endpoints. Emit a structured breadcrumb so the refresh intent is
      // observable, and leave this as the single seam a socket broadcaster wires
      // into later without touching the flow.
      try {
        // eslint-disable-next-line no-console
        console.info('[document-spine] revision committed', {
          organizationId: event.organizationId,
          projectId: event.projectId,
          artifactId: event.artifactId,
          version: event.version,
          status: event.status,
        });
      } catch {
        /* never throw from the notify step */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────────────────────

export const COMMIT_DOCUMENT_REVISION: AnaTool = {
  name: 'commit_document_revision',
  description:
    "Commit a governed revision of a regulated document through the ONE canonical document spine — the single atomic flow that creates a new version of the artifact, records the AI action, writes the 21 CFR Part 11 audit event, moves the document into review, refreshes its eCTD dossier placement, records source provenance, and recalculates program readiness, all connected so no step can silently be skipped. Use this to SAVE a draft or revision you have authored (instead of any ad-hoc save), so the version, audit trail, review state and placement always move together over the canonical concept2cure_artifacts identity. The revision is saved in the project this conversation is open in and under this conversation, and the ledger records the model the server was answered by: none of the three is an input, so to revise a document in another project the person opens that project and asks there. Returns the artifact id, new version number, effective status, placement, audit ids and the recalculated readiness. Requires tenant + user context, an open project and a saved conversation.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title (stable per thread — successive revisions of the same title append as new versions).' },
      content: { type: 'string', description: 'The full revised content to store as the new canonical version.' },
      document_type: { type: 'string', description: 'Optional document type (e.g. "clinical_overview", "cover_letter").' },
      reason_for_change: STATED_REASON_INPUT,
      ctd_section: { type: 'string', description: 'Optional eCTD section to place the artifact at (e.g. "2.5", "3.2.S.4.1"). Omit to leave placement unchanged.' },
      trigger_review: { type: 'boolean', description: 'Move the document into review state after saving. Default true; pass false to keep it a draft.' },
    },
    required: ['title', 'content'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler registration (injected register avoids an import cycle)
// ─────────────────────────────────────────────────────────────────────────────

type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

/** A refusal the model reads and relays. Nothing was written. */
function notSaved(code: string, error: string): string {
  return JSON.stringify({ ok: false, code, error });
}

/** A value the model put in an input that is no longer one, as text to compare; '' when it sent none. */
function namedInInput(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * The conversation a revision is saved under: the turn's own (ToolContext.threadId,
 * set by the stream and carried on the held run), never one the model names.
 *
 * The artifact is keyed on organization, project, thread and title, and until
 * 2026-11-10 `input.ana_thread_id` won over the context, so a chosen thread
 * added a version to another conversation's document. A call that still sends
 * one (it was in the schema, and a held call keeps its input) runs only if it
 * repeats the server's; a different one is refused, not dropped.
 */
function revisionThread(input: Record<string, unknown>, ctx: ToolContext): { threadId: string } | { refusal: string } {
  const threadId = typeof ctx.threadId === 'string' ? ctx.threadId.trim() : '';
  if (!threadId) {
    return {
      refusal: notSaved(
        'REVISION_CONVERSATION_REQUIRED',
        'A revision is saved under the conversation it was written in, and this call carries no saved conversation. ' +
          'Nothing was saved. Ask the person to send their request again.',
      ),
    };
  }
  const named = namedInInput(input.ana_thread_id);
  if (named && named !== threadId) {
    return {
      refusal: notSaved(
        'REVISION_CONVERSATION_MISMATCH',
        'ana_thread_id names a conversation other than this one. A revision is saved under the conversation it ' +
          'was written in, so nothing was saved. Call commit_document_revision again without ana_thread_id.',
      ),
    };
  }
  return { threadId };
}

/**
 * The project a revision is saved in: the one this conversation is open in, as
 * the server pinned it (ToolContext.projectId / projectRef), admitted for this
 * person now (admitAnaProjectScope, the admission the turn itself and AnA's
 * other project tools use). Never a project the model names.
 *
 * Until 2026-11-10 `input.project_id` won over the context and the only check
 * after it was that the project is the organization's (projectBelongsToTenant,
 * artifactVersionStore.ts), so a revision could be saved into a project the
 * person cannot open. The input existed because a project opened as a program
 * (the v2 shell) has no integer in context: its verified project is resolved
 * here instead. A call that still sends project_id runs only if it repeats the
 * admitted project; a different one is refused, not dropped.
 */
async function revisionProject(
  input: Record<string, unknown>,
  ctx: ToolContext,
  actor: { organizationId: number; userId: number },
): Promise<{ projectId: number } | { refusal: string }> {
  const { admitAnaProjectScope, projectScopeRefusalOf } = await import('./project-scope-admission.js');
  let admitted: Awaited<ReturnType<typeof admitAnaProjectScope>>;
  try {
    const { getPool } = await import('../../db.js');
    admitted = await admitAnaProjectScope(ctx.sqlClient ?? getPool(), {
      ...actor,
      projectId: ctx.projectId,
      projectRef: ctx.projectRef,
    });
  } catch (error) {
    // In the admission's own words and code (not found, no access, unverifiable).
    const { code, error: why } = projectScopeRefusalOf(error);
    return { refusal: notSaved(code, `${why} Nothing was saved.`) };
  }
  if (admitted.projectId === null) {
    return {
      refusal: notSaved(
        'REVISION_PROJECT_REQUIRED',
        'A revision is saved in the project its conversation is open in, and this conversation is not in a project. ' +
          'Nothing was saved. Ask the person to open the project the document belongs to and ask there.',
      ),
    };
  }
  const named = namedInInput(input.project_id).toLowerCase();
  if (named && named !== String(admitted.projectId) && named !== admitted.programId) {
    return {
      refusal: notSaved(
        'REVISION_PROJECT_MISMATCH',
        'project_id names a project other than the one this conversation is open in. A revision is saved in the ' +
          'open project, so nothing was saved. To revise a document in another project, the person opens that ' +
          'project and asks there; otherwise call commit_document_revision again without project_id.',
      ),
    };
  }
  return { projectId: admitted.projectId };
}

/** Register the document-spine tool handler on the executor's registry. */
export function registerDocumentSpineHandlers(register: RegisterFn): void {
  register('commit_document_revision', async (input, ctx) => {
    const organizationId = ctx?.organizationId ?? null;
    const userId = ctx?.userId ?? null;
    if (!ctx || organizationId == null || userId == null) {
      return JSON.stringify({ error: 'commit_document_revision requires tenant + user context.' });
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const content = typeof input.content === 'string' ? input.content : '';
    if (!title || !content) {
      return JSON.stringify({ error: 'title and non-empty content are required.' });
    }
    // Recorded on the version and the ledger row; refused before anything opens without it.
    const reasonForChange = gatedReason(input, 'reason_for_change');
    // Where it is saved is the server's to say: the turn's conversation and its
    // open project, admitted for this person. Refused here, before the spine opens.
    const thread = revisionThread(input, ctx);
    if ('refusal' in thread) return thread.refusal;
    const project = await revisionProject(input, ctx, { organizationId, userId });
    if ('refusal' in project) return project.refusal;

    try {
      const result = await commitCanonicalRevision(
        {
          organizationId,
          projectId: project.projectId,
          userId,
          anaThreadId: thread.threadId,
          title,
          content,
          documentType: typeof input.document_type === 'string' ? input.document_type : undefined,
          reasonForChange,
          ctdSection: typeof input.ctd_section === 'string' ? input.ctd_section : null,
          // The model call the gateway reported for this turn. `input.ai_model_used`
          // (the model's name for itself) is no longer read.
          servingModel: ctx.servingModel ?? null,
          triggerReview: input.trigger_review !== false,
        },
        defaultSpineDeps(),
      );
      return JSON.stringify({
        ok: true,
        source: 'AnA canonical document spine',
        ...result,
        message: `Committed "${title}" as v${result.version} (${result.status}); audit ${result.auditId}. All ${result.steps.length} spine steps ran: ${result.steps.join(' → ')}.`,
      });
    } catch (err) {
      return JSON.stringify({
        error: `commit_document_revision failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
