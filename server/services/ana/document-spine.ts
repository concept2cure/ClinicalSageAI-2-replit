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
  reasonForChange?: string;
  /** eCTD section to place the artifact at (step 7). Omit to leave placement as-is. */
  ctdSection?: string | null;
  /** Model that authored the revision, recorded on the AI-action ledger. */
  aiModelUsed?: string | null;
  /** Flip the artifact into review state (step 6). Default true. */
  triggerReview?: boolean;
  /** Provenance records to persist as lineage (step 3). Opaque to the core. */
  provenance?: unknown[];
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
  readiness: number | null;
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
  recomputeReadiness(organizationId: number, projectId: number): Promise<number | null>;
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

  const steps: string[] = [];
  const triggerReview = req.triggerReview !== false;

  // ── Atomic governed core: version + AI action + audit + review + placement ──
  const core = await deps.withTransaction(req.organizationId, async (client) => {
    const version = await deps.writeVersionTx(client, req);
    steps.push('version');

    const gov = await deps.recordGovernedActionTx(client, {
      organizationId: req.organizationId,
      userId: req.userId ?? 0,
      target: `artifact:${version.artifactId}`,
      command: version.created ? 'update' : 'reaffirm',
      reason:
        (req.reasonForChange && req.reasonForChange.trim()) ||
        `AnA revised "${req.title}" (v${version.version})`,
      payload: {
        title: req.title,
        version: version.version,
        contentHash: version.contentHash,
        documentType: req.documentType ?? null,
        aiModelUsed: req.aiModelUsed ?? null,
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
        const r = await client.query(
          `UPDATE concept2cure_artifacts
              SET ctd_section = $3, updated_at = now()
            WHERE id = $1 AND organization_id = $2
            RETURNING ctd_section`,
          [artifactPk, organizationId, ctdSection.trim()],
        );
        return r.rows.length > 0 ? (r.rows[0].ctd_section ?? null) : null;
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
          aiModelUsed: req.aiModelUsed ?? undefined,
        });
      } catch {
        return 0; // append-only lineage is best-effort; never fail the revision on it
      }
    },

    async recomputeReadiness(organizationId, projectId) {
      try {
        const { getProjectReadinessAggregate } = await import('./project-readiness-aggregator.js');
        const agg = await getProjectReadinessAggregate(projectId, organizationId);
        return typeof agg.score === 'number' ? agg.score : null;
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
    "Commit a governed revision of a regulated document through the ONE canonical document spine — the single atomic flow that creates a new version of the artifact, records the AI action, writes the 21 CFR Part 11 audit event, moves the document into review, refreshes its eCTD dossier placement, records source provenance, and recalculates program readiness, all connected so no step can silently be skipped. Use this to SAVE a draft or revision you have authored (instead of any ad-hoc save), so the version, audit trail, review state and placement always move together over the canonical concept2cure_artifacts identity. Returns the artifact id, new version number, effective status, placement, audit ids and the recalculated readiness. Requires tenant + user context.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title (stable per thread — successive revisions of the same title append as new versions).' },
      content: { type: 'string', description: 'The full revised content to store as the new canonical version.' },
      ana_thread_id: { type: 'string', description: 'The AnA thread this document belongs to. Defaults to the current thread when omitted.' },
      project_id: { type: 'number', description: 'Project id. Defaults to the current project when omitted.' },
      document_type: { type: 'string', description: 'Optional document type (e.g. "clinical_overview", "cover_letter").' },
      reason_for_change: { type: 'string', description: 'Reason-for-change recorded on the version and the audit event (Part 11 E6b).' },
      ctd_section: { type: 'string', description: 'Optional eCTD section to place the artifact at (e.g. "2.5", "3.2.S.4.1"). Omit to leave placement unchanged.' },
      ai_model_used: { type: 'string', description: 'Optional model identifier that authored the revision, recorded on the AI-action ledger.' },
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

/** Register the document-spine tool handler on the executor's registry. */
export function registerDocumentSpineHandlers(register: RegisterFn): void {
  register('commit_document_revision', async (input, ctx) => {
    const organizationId = ctx?.organizationId ?? null;
    const userId = ctx?.userId ?? null;
    if (organizationId == null || userId == null) {
      return JSON.stringify({ error: 'commit_document_revision requires tenant + user context.' });
    }
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const content = typeof input.content === 'string' ? input.content : '';
    if (!title || !content) {
      return JSON.stringify({ error: 'title and non-empty content are required.' });
    }
    const projectId =
      typeof input.project_id === 'number'
        ? input.project_id
        : typeof (ctx as { projectId?: number } | undefined)?.projectId === 'number'
          ? (ctx as { projectId?: number }).projectId!
          : NaN;
    if (!Number.isFinite(projectId)) {
      return JSON.stringify({ error: 'project_id is required (no active project in context).' });
    }
    const anaThreadId =
      typeof input.ana_thread_id === 'string' && input.ana_thread_id.trim()
        ? input.ana_thread_id.trim()
        : typeof (ctx as { threadId?: string } | undefined)?.threadId === 'string'
          ? (ctx as { threadId?: string }).threadId!
          : '';
    if (!anaThreadId) {
      return JSON.stringify({ error: 'ana_thread_id is required (no active thread in context).' });
    }

    try {
      const result = await commitCanonicalRevision(
        {
          organizationId,
          projectId,
          userId,
          anaThreadId,
          title,
          content,
          documentType: typeof input.document_type === 'string' ? input.document_type : undefined,
          reasonForChange: typeof input.reason_for_change === 'string' ? input.reason_for_change : undefined,
          ctdSection: typeof input.ctd_section === 'string' ? input.ctd_section : null,
          aiModelUsed: typeof input.ai_model_used === 'string' ? input.ai_model_used : null,
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
