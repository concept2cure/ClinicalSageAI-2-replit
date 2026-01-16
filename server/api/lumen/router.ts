import { Router } from 'express';
import { LumenCache } from '../../lib/lumen-cache';
import { LumenGovernance } from '../../lib/lumen-governance';
import { CircuitBreaker } from '../../lib/circuit-breaker';
import { DataHunterService } from '../../workers/scheduler';
import { DeficiencyBank } from './agents/deficiency-bank';
import { AnalystAgent } from './agents/analyst';
import { AlertDispatcher } from '../../workers/dispatcher';
import { db } from '../../../lib/database.js';
import auditService from '../../services/auditService.js';

import * as CoAuthor from './agents/co-author';
import * as FDA from './agents/fda-intel';
import * as Broker from './agents/broker';
import * as Learning from './agents/learning';

const router = Router();
const breaker = new CircuitBreaker();

// --- UNIVERSAL QUERY ENDPOINT ---
router.post('/query', async (req, res) => {
  const { tenantId, module, query, context } = req.body;
  
  try {
    // 1. Governance
    await LumenGovernance.checkAccess(tenantId);

    // 2. Cache Check (Speed Layer)
    const cached = await LumenCache.lookup(tenantId, query);
    if (cached) return res.json({ data: cached, meta: { source: 'cache', cost: 0, latency: '15ms' } });

    // 3. Intelligent Routing
    let result, agent = 'general';
    const startTime = Date.now();
    
    if (module === 'broker' || query.toLowerCase().includes('distressed')) {
        agent = 'broker';
        result = await Broker.scan(query);
    } else if (module === 'device' || query.toLowerCase().includes('predicate')) {
        agent = 'fda-intel';
        // Breaker protects FDA API
        result = await breaker.execute(() => FDA.query(query), []);
    } else {
        agent = 'co-author';
        result = await CoAuthor.draft(query, context);
    }

    // 4. Cost Tracking & Storage
    const cost = await LumenGovernance.track(tenantId, query.length, JSON.stringify(result).length);
    await LumenCache.store(tenantId, query, result);
    const latency = Date.now() - startTime;

    res.json({ 
        data: result, 
        meta: { source: agent, cost: cost.toFixed(6), latency: `${latency}ms` } 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lumen Cortex Error' });
  }
});

// --- FEEDBACK ENDPOINT ---
router.post('/feedback', async (req, res) => {
    const { tenantId, original, edited } = req.body;
    await Learning.processFeedback(tenantId, original, edited);
    res.json({ status: 'ok' });
});

// ADMIN TRIGGER
router.post('/admin/force-hunt', async (_req, res) => {
  try {
    const { keywords, sources, alerts, threshold } = _req.body || {};
    const tenantHeader = _req.headers['x-organization-id'] || _req.headers['x-tenant-id'];
    const tenantId = tenantHeader ? Number(tenantHeader) : null;

    await DataHunterService.huntGlobal({ keywords, sources });

    const stream = await DeficiencyBank.getStream(100);
    const cutoff = Date.now() - 60 * 60 * 1000;
    const findings = stream.filter(item => {
      const timestamp = new Date(item.created_at).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });

    await AlertDispatcher.dispatch(
      findings,
      {
      slack: Boolean(alerts?.slack),
      email: Boolean(alerts?.email),
      jira: Boolean(alerts?.jira),
      threshold: threshold || 'HIGH',
      },
      {
        tenantId: tenantId || undefined,
        ipAddress: _req.ip || null,
        userAgent: _req.headers['user-agent'] || null,
      }
    );

    res.json({ status: 'Hunt & Active Defense Complete' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// CONTEXTUAL ANALYSIS
router.post('/analyze', async (req, res) => {
  const { insight, source } = req.body;
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }

  let activeContext: string[] = [];
  try {
    const result = await db.query(
      `
      SELECT id, name, type, status, priority
      FROM projects
      WHERE organization_id = $1
        AND status NOT IN ('archived', 'completed')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 20
      `,
      [tenantId]
    );

    activeContext = result.rows.map(
      row => `[ID: ${row.id}] ${row.name} (${row.type || 'General'})`
    );
  } catch (error) {
    console.warn('[Lumen] DB Context lookup failed, proceeding without context.', error);
  }

  const analysis = await AnalystAgent.analyzeImpact(insight, source, activeContext);
  if (!analysis) {
    return res.status(500).json({ error: 'Analysis failed' });
  }
  res.json(analysis);
});

// RISK RECORD CREATION
router.post('/risk-records', async (req, res) => {
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;
  const { projectId, alertId, source, severity, rationale, actionItems } = req.body || {};

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }
  if (!projectId || !source || !severity || !rationale) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.query(
      `
      INSERT INTO lumen_risk_records
        (organization_id, project_id, alert_id, source, severity, rationale, action_items, metadata, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id
      `,
      [
        tenantId,
        Number(projectId),
        alertId || null,
        source,
        severity,
        rationale,
        JSON.stringify(actionItems || []),
        JSON.stringify({ origin: 'lumen_cortex' }),
      ]
    );

    await auditService.logAction({
      tenantId,
      userId: null,
      action: 'lumen.risk_record.created',
      resourceType: 'lumen_risk_record',
      resourceId: String(result.rows[0]?.id || ''),
      details: {
        projectId,
        alertId,
        severity,
        source,
      },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      sessionId: null,
      severity: 'info',
    });

    res.json({ status: 'created', id: result.rows[0]?.id });
  } catch (error) {
    console.error('[Lumen] Failed to create risk record:', error);
    res.status(500).json({ error: 'Failed to create risk record' });
  }
});

router.get('/risk-records/:id', async (req, res) => {
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;
  const recordId = Number(req.params.id);

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }
  if (!recordId || Number.isNaN(recordId)) {
    return res.status(400).json({ error: 'Invalid record id' });
  }

  try {
    const result = await db.query(
      `
      SELECT r.*, p.name as project_name
      FROM lumen_risk_records r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = $1 AND r.organization_id = $2
      LIMIT 1
      `,
      [recordId, tenantId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Risk record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Lumen] Failed to fetch risk record:', error);
    res.status(500).json({ error: 'Failed to fetch risk record' });
  }
});

// REAL-TIME STATUS DASHBOARD
router.get('/status', async (_req, res) => {
  try {
    const stats = await DeficiencyBank.getStats();
    const huntStatus = DataHunterService.getStatus();

    res.json({
      status: 'ONLINE',
      cortex: 'ACTIVE',
      intelligence: stats,
      hunt: huntStatus,
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: 'Failed to fetch cortex stats' });
  }
});

router.get('/stream', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const stream = await DeficiencyBank.getStream(limit);
    res.json(stream);
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: 'Failed to fetch intelligence stream' });
  }
});

export default router;
