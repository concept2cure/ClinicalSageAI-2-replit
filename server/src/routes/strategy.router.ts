import { Router } from 'express';
import { getPool } from '../../db/pool';
import { z } from 'zod';
import crypto from 'crypto';
import { aiProposeControls, aiDraftP34 } from '../services/ai/strategy.js';

const r = Router();
const PROD = 'DP-001';

async function q<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
}

async function audit(processId: string, action: string, payload: any, req: any) {
  const actor = (req.headers['x-user-name'] || req.headers['x-user-email'] || 'user').toString();
  await q(
    `insert into strategy_audit (process_id,actor,action,payload_json) values ($1,$2,$3,$4)`,
    [processId, actor, action, payload]
  );
}

/* ===== Overview (coverage metrics) ===== */
r.get('/overview', async (_req, res) => {
  const { rows: cpp } = await q<any>(
    `
    select p.param_id as param_id, p.name as param_name, u.name as unit_name, u.process_id
    from cmc_parameters p join cmc_unit_ops u on u.unit_id=p.unit_id
    where p.kind='CPP'
  `,
    []
  );
  const ids = cpp.map((x: any) => x.param_id);
  let covered = new Set<string>();
  if (ids.length) {
    const { rows: cov } = await q<any>(
      `select distinct param_id from strategy_controls where param_id = any($1) and status='ACTIVE'`,
      [ids]
    );
    cov.forEach((c: any) => covered.add(c.param_id));
  }
  const out = {
    cpp_total: cpp.length,
    cpp_covered: covered.size,
    coverage_pct: cpp.length ? Math.round((100 * covered.size) / cpp.length) : 0,
  };
  res.json(out);
});

/* ===== CQAs ===== */
const CqaCreate = z.object({
  name: z.string().min(2),
  criticality: z.enum(['Critical', 'Key', 'Other']).default('Critical'),
  acceptance_criteria: z.string().optional(),
  rationale: z.string().optional(),
});

r.get('/cqas', async (_req, res) => {
  const { rows } = await q<any>(
    `select * from strategy_cqas where product_id=$1 order by criticality, name`,
    [PROD]
  );
  res.json(rows);
});

r.post('/cqas', async (req, res) => {
  const p = CqaCreate.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid payload' });
  const { rows } = await q<any>(
    `insert into strategy_cqas (product_id,name,criticality,acceptance_criteria,rationale)
                                 values ($1,$2,$3,$4,$5) returning *`,
    [
      PROD,
      p.data.name.trim(),
      p.data.criticality,
      p.data.acceptance_criteria || null,
      p.data.rationale || null,
    ]
  );
  res.json(rows[0]);
});

r.patch('/cqas/:id', async (req, res) => {
  const b = req.body || {};
  const id = req.params.id;
  await q(
    `update strategy_cqas set criticality=coalesce($2,criticality), acceptance_criteria=coalesce($3,acceptance_criteria), rationale=coalesce($4,rationale)
           where cqa_id=$1`,
    [id, b.criticality || null, b.acceptance_criteria || null, b.rationale || null]
  );
  res.json({ ok: true });
});

/* ===== Controls (map CPP->CQA) ===== */
const CtrlCreate = z.object({
  process_id: z.string().uuid(),
  param_id: z.string().uuid(),
  cqa_id: z.string().uuid().optional(),
  control_type: z.enum(['IPC', 'Release', 'Alarm', 'PAT']),
  test_name: z.string().optional(),
  method_id: z.string().uuid().optional(),
  spec_low: z.string().optional(),
  spec_high: z.string().optional(),
  frequency: z.string().optional(),
  sampling_plan: z.string().optional(),
  action_on_fail: z.string().optional(),
  rationale: z.string().optional(),
  owner: z.string().optional(),
});

r.get('/controls', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  const where = processId ? `where sc.process_id=$1` : ``;
  const args = processId ? [processId] : [];
  const { rows } = await q<any>(
    `
    select sc.*, p.name as param_name, u.name as unit_name, cqa.name as cqa_name
    from strategy_controls sc
    join cmc_parameters p on p.param_id=sc.param_id
    join cmc_unit_ops u on u.unit_id=p.unit_id
    left join strategy_cqas cqa on cqa.cqa_id=sc.cqa_id
    ${where}
    order by u.name, p.name
  `,
    args
  );
  res.json(rows);
});

r.post('/controls', async (req, res) => {
  const p = CtrlCreate.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid payload' });
  const { rows } = await q<any>(
    `
    insert into strategy_controls (process_id,param_id,cqa_id,control_type,test_name,method_id,spec_low,spec_high,frequency,sampling_plan,action_on_fail,rationale,owner)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [
      p.data.process_id,
      p.data.param_id,
      p.data.cqa_id || null,
      p.data.control_type,
      p.data.test_name || null,
      p.data.method_id || null,
      p.data.spec_low || null,
      p.data.spec_high || null,
      p.data.frequency || null,
      p.data.sampling_plan || null,
      p.data.action_on_fail || null,
      p.data.rationale || null,
      p.data.owner || null,
    ]
  );
  await audit(p.data.process_id, 'ctrl_add', rows[0], req);
  res.json(rows[0]);
});

r.patch('/controls/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const { rows: proc } = await q<any>(`select process_id from strategy_controls where ctrl_id=$1`, [
    id,
  ]);
  await q(
    `update strategy_controls set cqa_id=coalesce($2,cqa_id), test_name=coalesce($3,test_name), method_id=coalesce($4,method_id),
           spec_low=coalesce($5,spec_low), spec_high=coalesce($6,spec_high), frequency=coalesce($7,frequency), sampling_plan=coalesce($8,sampling_plan),
           action_on_fail=coalesce($9,action_on_fail), rationale=coalesce($10,rationale), status=coalesce($11,status), owner=coalesce($12,owner)
           where ctrl_id=$1`,
    [
      id,
      b.cqa_id || null,
      b.test_name || null,
      b.method_id || null,
      b.spec_low || null,
      b.spec_high || null,
      b.frequency || null,
      b.sampling_plan || null,
      b.action_on_fail || null,
      b.rationale || null,
      b.status || null,
      b.owner || null,
    ]
  );
  if (proc[0]) await audit(proc[0].process_id, 'ctrl_update', { ctrl_id: id, body: b }, req);
  res.json({ ok: true });
});

/* ===== Gaps (coverage) ===== */
r.get('/gaps', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  if (!processId) return res.status(400).json({ error: 'processId required' });
  const [{ rows: cpp }, { rows: ctrl }, { rows: cqas }] = await Promise.all([
    q<any>(
      `select p.param_id as param_id, p.name as param_name, u.name as unit_name from cmc_parameters p join cmc_unit_ops u on u.unit_id=p.unit_id where p.kind='CPP' and u.process_id=$1`,
      [processId]
    ),
    q<any>(
      `select param_id, control_type from strategy_controls where process_id=$1 and status='ACTIVE'`,
      [processId]
    ),
    q<any>(`select cqa_id,name from strategy_cqas where product_id=$1`, [PROD]),
  ]);
  const has = new Map<string, Set<string>>();
  ctrl.forEach((c: any) => {
    const s = has.get(c.param_id) || new Set<string>();
    s.add(c.control_type);
    has.set(c.param_id, s);
  });
  const gaps: any[] = [];
  for (const p of cpp) {
    const s = has.get(p.param_id) || new Set<string>();
    if (!s.has('IPC'))
      gaps.push({
        param_id: p.param_id,
        param_name: p.param_name,
        unit_name: p.unit_name,
        missing: 'IPC',
      });
    if (!s.has('Release'))
      gaps.push({
        param_id: p.param_id,
        param_name: p.param_name,
        unit_name: p.unit_name,
        missing: 'Release',
      });
  }
  res.json({ cpp: cpp.length, gaps, cqas });
});

/* ===== AI propose controls (one-click add) ===== */
r.post('/ai/propose', async (req, res) => {
  const processId = (req.body?.process_id as string) || '';
  if (!processId) return res.status(400).json({ error: 'process_id required' });
  const [{ rows: proc }, { rows: cpp }, { rows: cqas }] = await Promise.all([
    q<any>(`select * from cmc_stage_gates where process_id=$1 limit 1`, [processId]).catch(() => ({
      rows: [{ process_id }] as any,
    })),
    q<any>(
      `select p.param_id as param_id, p.name as param_name, u.name as unit_name from cmc_parameters p join cmc_unit_ops u on u.unit_id=p.unit_id where p.kind='CPP' and u.process_id=$1`,
      [processId]
    ),
    q<any>(`select * from strategy_cqas where product_id=$1`, [PROD]),
  ]);
  const plan = await aiProposeControls({ process: proc?.[0], cpps: cpp, cqas, dosage_form: null });
  // Apply
  const applied: any[] = [];
  for (const c of plan.proposals || []) {
    const { rows } = await q<any>(
      `insert into strategy_controls (process_id,param_id,control_type,test_name,spec_low,spec_high,frequency,sampling_plan,action_on_fail,rationale)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [
        processId,
        c.param_id,
        c.control_type,
        c.test_name || null,
        c.spec_low || null,
        c.spec_high || null,
        c.frequency || null,
        c.sampling_plan || null,
        c.action_on_fail || null,
        c.rationale || null,
      ]
    );
    applied.push(rows[0]);
  }
  await audit(processId, 'ai_propose', { count: applied.length }, req);
  res.json({ applied });
});

/* ===== P.3.4 draft/tokens/export ===== */
r.post('/p34/draft', async (req, res) => {
  const processId = (req.body?.process_id as string) || '';
  if (!processId) return res.status(400).json({ error: 'process_id required' });
  const { rows } = await q<any>(
    `
    select sc.*, p.name as param_name, u.name as unit_name, cqa.name as cqa_name
    from strategy_controls sc join cmc_parameters p on p.param_id=sc.param_id join cmc_unit_ops u on u.unit_id=p.unit_id
    left join strategy_cqas cqa on cqa.cqa_id=sc.cqa_id
    where sc.process_id=$1 and sc.status='ACTIVE'`,
    [processId]
  );
  const md = await aiDraftP34({ process: { id: processId }, rows });
  await q(`insert into strategy_p34 (process_id, tokens_json, markdown) values ($1,$2,$3)`, [
    processId,
    { 'STRAT.P34.CPP_COUNT': rows.length } as any,
    md,
  ]);
  res.json({ markdown: md, tokens: { 'STRAT.P34.CPP_COUNT': rows.length } });
});

/* ===== Advanced Strategy STEP 2 Features ===== */

// GET /api/strategy/heatmap?processId=...
r.get('/heatmap', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  if (!processId) return res.status(400).json({ error: 'processId required' });

  // CPPs for this process
  const { rows: cpps } = await q<any>(
    `
    select p.param_id as param_id, p.name as param_name, u.name as unit_name
    from cmc_parameters p join cmc_unit_ops u on u.unit_id=p.unit_id
    where p.kind='CPP' and u.process_id=$1
    order by u.name, p.name`,
    [processId]
  );

  // CQAs (product-level)
  const { rows: cqas } = await q<any>(
    `select cqa_id,name from strategy_cqas where product_id=$1 order by name`,
    [PROD]
  );

  // Controls
  const { rows: ctrls } = await q<any>(
    `
    select sc.param_id, sc.cqa_id, sc.control_type
    from strategy_controls sc
    where sc.process_id=$1 and sc.status='ACTIVE'`,
    [processId]
  );

  // build map param_id × cqa_id → set(types)
  const matrix: any = {};
  for (const c of ctrls) {
    const k = `${c.param_id}::${c.cqa_id || 'NULL'}`;
    (matrix[k] ||= new Set<string>()).add(c.control_type);
  }

  // compress to arrays for heatmap
  const rowsOut = cpps.map((p: any) => ({
    param_id: p.param_id,
    param_name: p.param_name,
    unit_name: p.unit_name,
    coverage: cqas.map((cqa: any) => {
      const k = `${p.param_id}::${cqa.cqa_id}`;
      const set = matrix[k] || new Set<string>();
      return { cqa_id: cqa.cqa_id, cqa_name: cqa.name, types: Array.from(set) };
    }),
  }));

  res.json({ cpp: cpps, cqa: cqas, rows: rowsOut });
});

// GET /api/strategy/pat?processId=...
r.get('/pat', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  if (!processId) return res.status(400).json({ error: 'processId required' });
  const { rows } = await q<any>(
    `select * from strategy_pat where process_id=$1 order by created_at desc`,
    [processId]
  );
  res.json(rows);
});

// POST /api/strategy/pat
r.post('/pat', async (req, res) => {
  const b = req.body || {};
  if (!b.process_id || !b.param_id || !b.probe)
    return res.status(400).json({ error: 'process_id,param_id,probe required' });
  const { rows } = await q<any>(
    `insert into strategy_pat (process_id,param_id,probe,variables,model,status,owner)
                                 values ($1,$2,$3,$4,$5,'DRAFT',$6) returning *`,
    [b.process_id, b.param_id, b.probe, b.variables || [], b.model || {}, b.owner || null]
  );
  await audit(b.process_id, 'pat_add', rows[0], req);
  res.json(rows[0]);
});

// PATCH /api/strategy/pat/:id
r.patch('/pat/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const { rows: proc } = await q<any>(`select process_id from strategy_pat where pat_id=$1`, [id]);
  await q(
    `update strategy_pat set variables=coalesce($2,variables), model=coalesce($3,model),
           status=coalesce($4,status), owner=coalesce($5,owner)
           where pat_id=$1`,
    [id, b.variables || null, b.model || null, b.status || null, b.owner || null]
  );
  if (proc[0]) await audit(proc[0].process_id, 'pat_update', { pat_id: id, body: b }, req);
  res.json({ ok: true });
});

// POST /api/strategy/changes/propose
r.post('/changes/propose', async (req, res) => {
  const b = req.body || {};
  if (!b.process_id || !b.title || !b.delta)
    return res.status(400).json({ error: 'process_id,title,delta required' });

  // compute impact
  const impact: any[] = [];
  for (const c of b.delta.add || []) {
    if ((c.control_type || '').toUpperCase() === 'RELEASE')
      impact.push({ module: 'Regulatory', action: 'Update P.3.4' });
    if ((c.control_type || '').toUpperCase() === 'ALARM')
      impact.push({ module: 'QA', action: 'Add alarm SOP reference' });
    if ((c.control_type || '').toUpperCase() === 'PAT')
      impact.push({ module: 'PAT', action: 'Model qualification' });
  }

  const { rows } = await q<any>(
    `insert into strategy_changes (process_id,title,rationale,delta_json,impact_json,created_by)
                                  values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      b.process_id,
      b.title,
      b.rationale || null,
      b.delta,
      impact,
      (req.headers['x-user-name'] || 'user').toString(),
    ]
  );
  await audit(b.process_id, 'change_propose', rows[0], req);
  res.json(rows[0]);
});

// POST /api/strategy/changes/:id/apply
r.post('/changes/:id/apply', async (req, res) => {
  const id = req.params.id;
  const { rows: chg } = await q<any>(`select * from strategy_changes where change_id=$1`, [id]);
  if (!chg[0]) return res.status(404).json({ error: 'not found' });
  const processId = chg[0].process_id;
  const delta = chg[0].delta_json || {};

  // apply ADD
  for (const c of delta.add || []) {
    await q(
      `insert into strategy_controls (process_id,param_id,cqa_id,control_type,test_name,method_id,spec_low,spec_high,frequency,sampling_plan,action_on_fail,rationale,owner)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        processId,
        c.param_id,
        c.cqa_id || null,
        c.control_type,
        c.test_name || null,
        c.method_id || null,
        c.spec_low || null,
        c.spec_high || null,
        c.frequency || null,
        c.sampling_plan || null,
        c.action_on_fail || null,
        c.rationale || null,
        c.owner || null,
      ]
    );
  }

  await q(`update strategy_changes set status='APPLIED', applied_at=now() where change_id=$1`, [
    id,
  ]);
  await audit(processId, 'change_apply', { change_id: id }, req);
  res.json({ ok: true });
});

// GET /api/strategy/changes?processId=...
r.get('/changes', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  if (!processId) return res.status(400).json({ error: 'processId required' });
  const { rows } = await q<any>(
    `select * from strategy_changes where process_id=$1 order by created_at desc`,
    [processId]
  );
  res.json(rows);
});

// POST /api/strategy/p34/push
r.post('/p34/push', async (req, res) => {
  const processId = (req.body?.process_id as string) || '';
  if (!processId) return res.status(400).json({ error: 'process_id required' });

  // compose tokens
  const { rows } = await q<any>(
    `
    select sc.control_type, p.name as param_name, sc.test_name
    from strategy_controls sc join cmc_parameters p on p.param_id=sc.param_id
    where sc.process_id=$1 and sc.status='ACTIVE'`,
    [processId]
  );

  const tokens: any = {
    'STRAT.P34.CPP_COUNT': rows.length,
    'STRAT.P34.IPC_COUNT': rows.filter((r: any) => r.control_type === 'IPC').length,
    'STRAT.P34.REL_COUNT': rows.filter((r: any) => r.control_type === 'Release').length,
  };

  const markdown = `# 3.2.P.3.4 Control Strategy

## Overview
Total CPPs controlled: ${tokens['STRAT.P34.CPP_COUNT']}
- IPC controls: ${tokens['STRAT.P34.IPC_COUNT']}  
- Release controls: ${tokens['STRAT.P34.REL_COUNT']}

## Control Details
${rows.map((r: any) => `- **${r.param_name}**: ${r.control_type} - ${r.test_name || 'TBD'}`).join('\n')}
`;

  await q(
    `insert into strategy_p34_exports (process_id, fmt, tokens_json, markdown, created_by) values ($1,'md',$2,$3,$4)`,
    [processId, tokens as any, markdown, (req.headers['x-user-name'] || 'user').toString()]
  );
  await audit(processId, 'p34_push', { tokens: Object.keys(tokens) }, req);

  res.json({ ok: true, tokens, markdown });
});

// GET /api/strategy/signoffs?processId=...
r.get('/signoffs', async (req, res) => {
  const processId = (req.query.processId as string) || '';
  if (!processId) return res.status(400).json({ error: 'processId required' });
  const { rows } = await q<any>(
    `select * from strategy_signoffs where process_id=$1 order by signed_at desc`,
    [processId]
  );
  res.json(rows);
});

// POST /api/strategy/signoffs
r.post('/signoffs', async (req, res) => {
  const b = req.body || {};
  if (!b.process_id || !b.stage || !b.signer_name || !b.signer_role)
    return res.status(400).json({ error: 'process_id,stage,signer_name,signer_role required' });

  const hash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(b.payload_json || {}))
    .digest('hex');
  const { rows } = await q<any>(
    `insert into strategy_signoffs (process_id,stage,signer_name,signer_role,reason,hash,payload_json)
                                 values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [
      b.process_id,
      b.stage,
      b.signer_name,
      b.signer_role,
      b.reason || null,
      hash,
      b.payload_json || {},
    ]
  );
  await audit(b.process_id, 'signoff', rows[0], req);
  res.json(rows[0]);
});

export default r;
