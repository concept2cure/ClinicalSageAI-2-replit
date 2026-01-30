import crypto from 'crypto';

export class WorkflowExecutionEngine {
  db: any;
  logger: any;

  constructor(db: any, logger: any) {
    if (!db || typeof db.query !== 'function') throw new Error('db with query() is required');
    this.db = db;
    this.logger = logger || console;
  }

  async startWorkflow(workflowDefinitionId: string, context: any = {}, tenantId?: string, opts: any = {}) {
    // Fetch definition
    const defR = await this.db.query('SELECT id, name, version FROM workflow_definitions WHERE id = $1 LIMIT 1', [workflowDefinitionId]);
    const def = defR.rows && defR.rows[0];
    if (!def) throw new Error('workflow_definition_not_found');

    const name = `${def.name} run`;
    const startedAt = new Date();

    const insertResp = await this.db.query(
      `INSERT INTO workflow_runs (tenant_id, workflow_definition_id, project_id, name, status, started_at, total_steps_count, current_step_id, created_at, created_by, state_hash, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11)
       RETURNING id`,
      [tenantId || opts.tenantId || null, workflowDefinitionId, opts.projectId || null, name, 'ACTIVE', startedAt, opts.totalStepsCount || 0, opts.currentStepId || null, opts.createdBy || null, null, context]
    );

    const runId = insertResp.rows[0].id;

    // Initial state hash
    const stateHash = this._computeHash({ runId, startedAt, workflowDefinitionId });

    await this.db.query('UPDATE workflow_runs SET state_hash = $1 WHERE id = $2', [stateHash, runId]);

    // Insert initial step run entry (audit)
    const entry = {
      workflowRunId: runId,
      tenantId: tenantId || opts.tenantId || null,
      action: 'STARTED',
      performedBy: opts.createdBy || null,
      performedAt: new Date().toISOString(),
      details: { name, workflowDefinitionId },
    };

    await this._insertStepRun(entry);

    return { runId, stateHash };
  }

  async advanceStep(runId: string) {
    // Fetch current run
    const rr = await this.db.query('SELECT id, workflow_definition_id, current_step_id, completed_steps_count, total_steps_count, context, tenant_id FROM workflow_runs WHERE id = $1 LIMIT 1', [runId]);
    const run = rr.rows && rr.rows[0];
    if (!run) throw new Error('workflow_run_not_found');

    // Load current step definition
    const stepId = run.current_step_id;
    if (!stepId) {
      // Nothing to advance; maybe we're at the end
      return { ok: false, reason: 'no_current_step' };
    }

    const sr = await this.db.query('SELECT id, preconditions, effects, name FROM workflow_step_definitions WHERE id = $1 LIMIT 1', [stepId]);
    const stepDef = sr.rows && sr.rows[0];
    if (!stepDef) throw new Error('workflow_step_definition_not_found');

    // Check preconditions via PreconditionChecker
    const { checkPreconditions } = await import('./PreconditionChecker');
    const check = await checkPreconditions(stepDef.preconditions || [], run.context || {});

    // Determine prevHash
    const last = await this.db.query('SELECT entry_hash FROM step_runs WHERE workflow_run_id = $1 ORDER BY performed_at DESC LIMIT 1', [runId]);
    const prevHash = last.rows && last.rows[0] ? last.rows[0].entry_hash : null;

    if (!check.passed) {
      // Record a step_run with BLOCKED
      const entry = {
        workflowStepId: stepId,
        workflowRunId: runId,
        tenantId: run.tenant_id,
        action: 'BLOCKED',
        performedBy: null,
        performedAt: new Date().toISOString(),
        details: { reason: 'preconditions_failed', results: check.results },
        prevHash,
      };
      await this._insertStepRun(entry);

      // Update workflow run to BLOCKED
      await this.db.query('UPDATE workflow_runs SET status = $1, updated_at = NOW() WHERE id = $2', ['BLOCKED', runId]);
      return { ok: false, passed: false, results: check.results };
    }

    // Execute effects (MVP: basic handlers)
    const effects = stepDef.effects || [];
    const effectsResults: any[] = [];

    for (const eff of effects) {
      try {
        // Basic handler: SEND_NOTIFICATION, LOCK_VERSION, TRIGGER_WORKER
        if (eff.type === 'SEND_NOTIFICATION') {
          this.logger.info('Effect SEND_NOTIFICATION', { target: eff.target, payload: eff.payload });
          effectsResults.push({ effectId: eff.id, success: true });
        } else if (eff.type === 'LOCK_VERSION') {
          // update context to indicate locked
          run.context = { ...(run.context || {}), locked: true };
          effectsResults.push({ effectId: eff.id, success: true });
        } else if (eff.type === 'TRIGGER_WORKER') {
          // push to a worker queue (MVP: log)
          this.logger.info('Triggering worker', { payload: eff.payload });
          effectsResults.push({ effectId: eff.id, success: true });
        } else {
          effectsResults.push({ effectId: eff.id, success: false, reason: 'unsupported_effect' });
        }
      } catch (e: any) {
        effectsResults.push({ effectId: eff.id, success: false, reason: e?.message || String(e) });
      }
    }

    // Mark step completed: update counts & advance currentStepId
    const nextStepRow = await this.db.query('SELECT id FROM workflow_step_definitions WHERE workflow_definition_id = $1 AND "order" > (SELECT "order" FROM workflow_step_definitions WHERE id = $2) ORDER BY "order" ASC LIMIT 1', [run.workflow_definition_id, stepId]);
    const nextStep = nextStepRow.rows && nextStepRow.rows[0] ? nextStepRow.rows[0].id : null;

    const newCompleted = (run.completed_steps_count || 0) + 1;
    const total = run.total_steps_count || 0;
    const progress = total > 0 ? Math.floor((newCompleted / total) * 100) : 0;
    const newStatus = nextStep ? 'ACTIVE' : 'COMPLETED';

    await this.db.query('UPDATE workflow_runs SET completed_steps_count = $1, current_step_id = $2, progress_percent = $3, status = $4, context = $5, updated_at = NOW() WHERE id = $6', [newCompleted, nextStep, progress, newStatus, run.context || {}, runId]);

    // Insert effect-executed step run with COMPLETED
    const entry = {
      workflowStepId: stepId,
      workflowRunId: runId,
      tenantId: run.tenant_id,
      action: 'COMPLETED',
      performedBy: null,
      performedAt: new Date().toISOString(),
      details: { effectResults: effectsResults },
      effectsSnapshot: effectsResults,
      prevHash,
    };

    await this._insertStepRun(entry);

    // Update run state hash
    const stateHash = this._computeHash({ runId, completedSteps: newCompleted, progress, ts: new Date().toISOString() });
    await this.db.query('UPDATE workflow_runs SET state_hash = $1 WHERE id = $2', [stateHash, runId]);

    return { ok: true, passed: true, nextStep, effectsResults };
  }

  async _insertStepRun(entry: any) {
    // prevHash may be provided; compute entryHash
    const raw = JSON.stringify({ workflowRunId: entry.workflowRunId, action: entry.action, details: entry.details, ts: entry.performedAt, prevHash: entry.prevHash });
    const entryHash = this._computeHash(raw);

    const sql = `INSERT INTO step_runs (workflow_step_id, workflow_run_id, tenant_id, action, previous_status, new_status, performed_by, performed_by_name, performed_at, duration_ms, details, preconditions_snapshot, effects_snapshot, error_code, error_message, prev_hash, entry_hash, ip_address, user_agent, session_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`;

    const params = [
      entry.workflowStepId || null,
      entry.workflowRunId,
      entry.tenantId,
      entry.action,
      null,
      null,
      entry.performedBy || null,
      entry.performedByName || null,
      entry.performedAt ? new Date(entry.performedAt) : new Date(),
      entry.durationMs || null,
      entry.details || null,
      entry.preconditionsSnapshot || null,
      entry.effectsSnapshot || null,
      entry.errorCode || null,
      entry.errorMessage || null,
      entry.prevHash || null,
      entryHash,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.sessionId || null,
    ];

    await this.db.query(sql, params);
    return entryHash;
  }

  _computeHash(obj: any) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return crypto.createHash('sha256').update(s).digest('hex');
  }
}
