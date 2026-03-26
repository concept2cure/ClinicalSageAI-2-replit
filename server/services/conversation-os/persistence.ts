import { getPool } from '../../db.ts';
import type { ArtifactProposal, PlanTrace, RetrievalChunk, ScoutFinding, ToolEvent, ToolManifest } from './types';

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Ctx = { projectId: string; conversationId: string; userId: string };

function tableMissing(error: unknown) {
  return error instanceof Error && /conversation_os_/.test(error.message);
}
function dbUnavailable(error: unknown) {
  return error instanceof Error && /Database connection not available/i.test(error.message);
}

export class ConversationOsPersistence {
  id() {
    return makeId();
  }

  async upsertToolManifest(ctx: Ctx, manifest: ToolManifest) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_os_tool_manifests (project_id, conversation_id, user_id, mode, tools, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,'active',NOW(),NOW())
         ON CONFLICT (project_id, conversation_id)
         DO UPDATE SET user_id = EXCLUDED.user_id, mode = EXCLUDED.mode, tools = EXCLUDED.tools, updated_at = NOW()`,
        [ctx.projectId, ctx.conversationId, ctx.userId, manifest.mode, JSON.stringify(manifest.tools)]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async getToolManifest(ctx: Ctx): Promise<ToolManifest | null> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT mode, tools, updated_at FROM conversation_os_tool_manifests WHERE project_id = $1 AND conversation_id = $2`,
        [ctx.projectId, ctx.conversationId]
      );
      if (!result.rows[0]) return null;
      return {
        conversationId: ctx.conversationId,
        mode: result.rows[0].mode,
        tools: result.rows[0].tools,
        updatedAt: new Date(result.rows[0].updated_at).toISOString(),
      };
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return null;
      throw error;
    }
  }

  async logToolEvent(ctx: Ctx, event: ToolEvent) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_os_tool_events (id, project_id, conversation_id, user_id, tool, action, reason, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'recorded',$8)`,
        [event.id, ctx.projectId, ctx.conversationId, ctx.userId, event.tool, event.action, event.reason, event.timestamp]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async listToolEvents(ctx: Ctx): Promise<ToolEvent[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, conversation_id, tool, action, reason, created_at FROM conversation_os_tool_events
         WHERE project_id = $1 AND conversation_id = $2 ORDER BY created_at DESC LIMIT 100`,
        [ctx.projectId, ctx.conversationId]
      );
      return result.rows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        tool: row.tool,
        action: row.action,
        reason: row.reason,
        timestamp: new Date(row.created_at).toISOString(),
      }));
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return [];
      throw error;
    }
  }

  async ingestRetrieval(ctx: Ctx, sourceId: string, tags: string[], chunks: RetrievalChunk[]) {
    try {
      const pool = getPool();
      const sourceRefId = this.id();
      await pool.query(
        `INSERT INTO conversation_os_retrieval_sources (id, project_id, conversation_id, user_id, source_id, source_status, tags, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'ingested',$6::jsonb,NOW(),NOW())
         ON CONFLICT (project_id, conversation_id, source_id)
         DO UPDATE SET user_id = EXCLUDED.user_id, tags = EXCLUDED.tags, updated_at = NOW()`,
        [sourceRefId, ctx.projectId, ctx.conversationId, ctx.userId, sourceId, JSON.stringify(tags)]
      );
      for (const chunk of chunks) {
        await pool.query(
          `INSERT INTO conversation_os_retrieval_chunks (id, project_id, conversation_id, user_id, source_ref_id, source_id, section, approved_only, text, tags, status, created_at)
           VALUES ($1,$2,$3,$4,
              COALESCE((SELECT id FROM conversation_os_retrieval_sources WHERE project_id = $2 AND conversation_id = $3 AND source_id = $6 LIMIT 1), $5),
              $6,$7,$8,$9,$10::jsonb,'active',NOW())
           ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, tags = EXCLUDED.tags`,
          [chunk.id, ctx.projectId, ctx.conversationId, ctx.userId, sourceRefId, sourceId, chunk.section ?? null, chunk.approvedOnly ?? false, chunk.text, JSON.stringify(chunk.tags)]
        );
      }
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async listRetrievalChunks(ctx: Ctx): Promise<RetrievalChunk[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, source_id, section, approved_only, text, tags FROM conversation_os_retrieval_chunks
         WHERE project_id = $1 AND conversation_id = $2 ORDER BY created_at DESC`,
        [ctx.projectId, ctx.conversationId]
      );
      return result.rows.map(row => ({ id: row.id, sourceId: row.source_id, section: row.section ?? undefined, approvedOnly: row.approved_only, text: row.text, tags: row.tags ?? [] }));
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return [];
      throw error;
    }
  }

  async upsertScoutFinding(ctx: Ctx, finding: ScoutFinding) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_os_scout_findings (id, project_id, conversation_id, user_id, summary, chunk_ids, promoted, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'open',$8,NOW())
         ON CONFLICT (id) DO UPDATE SET promoted = EXCLUDED.promoted, updated_at = NOW()`,
        [finding.id, ctx.projectId, ctx.conversationId, ctx.userId, finding.summary, JSON.stringify(finding.chunkIds), finding.promoted, finding.createdAt]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async listScoutFindings(ctx: Ctx): Promise<ScoutFinding[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, summary, chunk_ids, promoted, created_at FROM conversation_os_scout_findings
         WHERE project_id = $1 AND conversation_id = $2 ORDER BY created_at DESC`,
        [ctx.projectId, ctx.conversationId]
      );
      return result.rows.map(row => ({ id: row.id, summary: row.summary, chunkIds: row.chunk_ids ?? [], promoted: row.promoted, createdAt: new Date(row.created_at).toISOString() }));
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return [];
      throw error;
    }
  }

  async upsertPlan(ctx: Ctx, trace: PlanTrace) {
    try {
      const pool = getPool();
      const planId = `${ctx.projectId}:${ctx.conversationId}`;
      await pool.query(
        `INSERT INTO conversation_os_execution_plans (id, project_id, conversation_id, user_id, task, class, sources_used, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'completed',NOW(),NOW())
         ON CONFLICT (project_id, conversation_id)
         DO UPDATE SET user_id = EXCLUDED.user_id, task = EXCLUDED.task, class = EXCLUDED.class, sources_used = EXCLUDED.sources_used, updated_at = NOW()`,
        [planId, ctx.projectId, ctx.conversationId, ctx.userId, trace.task, trace.class, JSON.stringify(trace.sourcesUsed)]
      );
      await pool.query(`DELETE FROM conversation_os_execution_steps WHERE plan_id = $1`, [planId]);
      for (const [index, step] of trace.steps.entries()) {
        await pool.query(
          `INSERT INTO conversation_os_execution_steps (id, plan_id, project_id, conversation_id, user_id, label, step_status, sequence, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [step.id, planId, ctx.projectId, ctx.conversationId, ctx.userId, step.label, step.status, index]
        );
      }
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async getPlan(ctx: Ctx): Promise<PlanTrace | null> {
    try {
      const pool = getPool();
      const planRes = await pool.query(
        `SELECT task, class, sources_used FROM conversation_os_execution_plans WHERE project_id = $1 AND conversation_id = $2`,
        [ctx.projectId, ctx.conversationId]
      );
      const plan = planRes.rows[0];
      if (!plan) return null;
      const stepsRes = await pool.query(
        `SELECT id, label, step_status FROM conversation_os_execution_steps WHERE plan_id = $1 ORDER BY sequence ASC`,
        [`${ctx.projectId}:${ctx.conversationId}`]
      );
      return {
        conversationId: ctx.conversationId,
        task: plan.task,
        class: plan.class,
        sourcesUsed: plan.sources_used ?? [],
        steps: stepsRes.rows.map(row => ({ id: row.id, label: row.label, status: row.step_status })),
      };
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return null;
      throw error;
    }
  }

  async createProposal(ctx: Ctx, proposal: ArtifactProposal, quality?: unknown) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_os_artifact_proposals (id, project_id, conversation_id, user_id, artifact_id, content, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [proposal.id, ctx.projectId, ctx.conversationId, ctx.userId, proposal.artifactId, proposal.content, proposal.status, proposal.createdAt]
      );
      await pool.query(
        `INSERT INTO conversation_os_proposal_versions (id, proposal_id, project_id, conversation_id, user_id, version, content, quality, status, created_at)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7::jsonb,'draft',NOW())`,
        [this.id(), proposal.id, ctx.projectId, ctx.conversationId, ctx.userId, proposal.content, JSON.stringify(quality ?? null)]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async listProposals(ctx: Ctx): Promise<ArtifactProposal[]> {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, conversation_id, artifact_id, content, status, created_at FROM conversation_os_artifact_proposals
         WHERE project_id = $1 AND conversation_id = $2 ORDER BY created_at DESC`,
        [ctx.projectId, ctx.conversationId]
      );
      return result.rows.map(row => ({ id: row.id, conversationId: row.conversation_id, artifactId: row.artifact_id, content: row.content, status: row.status, createdAt: new Date(row.created_at).toISOString() }));
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return [];
      throw error;
    }
  }

  async updateProposalStatus(ctx: Ctx, proposalId: string, status: 'accepted' | 'rejected') {
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE conversation_os_artifact_proposals SET status = $1, updated_at = NOW() WHERE project_id = $2 AND conversation_id = $3 AND id = $4`,
        [status, ctx.projectId, ctx.conversationId, proposalId]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }

  async logQualityEvaluation(ctx: Ctx, proposalId: string | null, evaluation: unknown) {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO conversation_os_quality_evaluations (id, project_id, conversation_id, proposal_id, user_id, evaluation, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,'recorded',NOW())`,
        [this.id(), ctx.projectId, ctx.conversationId, proposalId, ctx.userId, JSON.stringify(evaluation)]
      );
      return true;
    } catch (error) {
      if (tableMissing(error) || dbUnavailable(error)) return false;
      throw error;
    }
  }
}

export const conversationPersistence = new ConversationOsPersistence();
export type { Ctx as ConversationContext };
