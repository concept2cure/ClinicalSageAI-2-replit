import express from 'express';
import { randomUUID } from 'crypto';
import pg from 'pg';
import multer from 'multer';
import dayjs from 'dayjs';
import { cached, invalidate } from '../src/cache.ts';
import {
  StageBody,
  PPQBody,
  CSBody,
  DSBody,
  CPVRulesBody,
} from '../src/validation/processSchemas.ts';

// Conditional imports with fallbacks
let parse, JSZip, marked, Document, Packer, Paragraph, TextRun, puppeteer, notifyGuardFailure;

try {
  const csvParse = await import('csv-parse/sync');
  parse = csvParse.parse;
} catch (e) {
  parse = () => {
    throw new Error('CSV parsing not available');
  };
}

try {
  // Use createRequire for CommonJS modules that don't support ES modules
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  JSZip = require('jszip');
} catch (e) {
  JSZip = class {
    constructor() {
      throw new Error('ZIP functionality not available');
    }
  };
}

try {
  // Use createRequire for marked as well since ES module import fails
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const markedModule = require('marked');
  marked = markedModule.parse || markedModule.marked || markedModule;
} catch (e) {
  marked = { parse: text => text };
}

try {
  const docxImport = await import('docx');
  ({ Document, Packer, Paragraph, TextRun } = docxImport);
} catch (e) {
  Document = class {
    constructor() {
      throw new Error('DOCX functionality not available');
    }
  };
  Packer = {
    toBuffer: () => {
      throw new Error('DOCX functionality not available');
    },
  };
  Paragraph = class {};
  TextRun = class {};
}

try {
  const puppeteerImport = await import('puppeteer');
  puppeteer = puppeteerImport.default;
} catch (e) {
  puppeteer = {
    launch: () => {
      throw new Error('PDF generation not available');
    },
  };
}

try {
  const notifyImport = await import('../src/services/notify.js');
  notifyGuardFailure = notifyImport.notifyGuardFailure;
} catch (e) {
  notifyGuardFailure = () => console.warn('Notification service not available');
}

const router = express.Router();
const PROD = 'DP-001';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

// Helper functions
async function bundle(processId) {
  const client = await pool.connect();
  try {
    const [{ rows: p }, { rows: u }, { rows: params }, { rows: ds }, { rows: cs }] =
      await Promise.all([
        client.query(`select * from cmc_processes where process_id=$1`, [processId]),
        client.query(`select * from cmc_unit_ops where process_id=$1 order by sequence_no`, [
          processId,
        ]),
        client.query(
          `select p.* from cmc_parameters p join cmc_unit_ops u on p.unit_id=u.unit_id where u.process_id=$1`,
          [processId]
        ),
        client.query(`select * from cmc_design_space where process_id=$1`, [processId]),
        client.query(`select * from cmc_control_strategy where process_id=$1`, [processId]),
      ]);
    const units = u.map(uu => ({
      ...uu,
      parameters: params.filter(pp => pp.unit_id === uu.unit_id),
    }));
    return {
      process: p[0],
      units,
      designSpace: ds[0] || null,
      controlStrategy: cs[0]?.controls_json || {},
    };
  } finally {
    client.release();
  }
}

function mean(a) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function sd(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}

// List processes
router.get('/processes', async (_req, res) => {
  const data = await cached('proc:list', async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `select p.process_id, p.name, p.scope, p.stage, p.owner, 
                count(distinct u.unit_id)::int as units, 
                sum(case when par.kind='CPP' then 1 else 0 end)::int as cpp_count
         from cmc_processes p
         left join cmc_unit_ops u on u.process_id=p.process_id
         left join cmc_parameters par on par.unit_id=u.unit_id
         where p.product_id=$1
         group by p.process_id`,
        [PROD]
      );
      return rows;
    } finally {
      client.release();
    }
  });
  res.json(data);
});

// CREATE: POST /api/cmc-process/processes - Create new process
router.post('/processes', async (req, res) => {
  const { name, scope } = req.body || {};
  if (!name || !['DS', 'DP'].includes(scope)) {
    return res.status(400).json({ error: 'name and scope (DS/DP) required' });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO cmc_processes (product_id, name, scope, stage, owner)
       VALUES ($1, $2, $3, 'DESIGN', 'Process Eng') 
       RETURNING process_id, name, scope, stage, owner`,
      [PROD, name, scope]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating process:', error);
    if (error.code === '23505') {
      // unique constraint violation
      res.status(409).json({ error: 'Process name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create process' });
    }
  } finally {
    client.release();
  }
});

// Get process details
router.get('/processes/:id', async (req, res) => {
  try {
    const data = await cached(`proc:${req.params.id}`, async () => await bundle(req.params.id));
    res.json(data);
  } catch (error) {
    console.error('Error fetching process details:', error);
    res.status(500).json({ error: 'Failed to fetch process details' });
  }
});

// Stage guard (DESIGN/QUAL/VALIDATED)
router.patch('/processes/:id/stage', async (req, res) => {
  const id = req.params.id;
  const parsed = StageBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid stage' });
  const { stage } = parsed.data;

  const client = await pool.connect();
  try {
    if (stage === 'VALIDATED') {
      const procRow = await client.query(
        `select name, product_id from cmc_processes where process_id=$1`,
        [id]
      );
      const procName = procRow.rows[0]?.name || id;
      const productId = procRow.rows[0]?.product_id || 'UNKNOWN';
      const link = `${process.env.APP_ORIGIN ?? ''}/process/${id}`;

      const { rows } = await client.query(
        `select count(*)::int as c from cmc_ppq_lots where process_id=$1 and result='PASS'`,
        [id]
      );
      if ((rows[0]?.c || 0) < 3) {
        const msg = `PPQ PASS lots=${rows[0]?.c || 0} (<3).`;
        await notifyGuardFailure({
          processName: procName,
          productId,
          guard: 'PPQ',
          details: msg,
          link,
        });
        return res
          .status(412)
          .json({ error: 'PPQ guard: need ≥3 PASS lots', passLots: rows[0]?.c || 0 });
      }
      const { rows: highRpn } = await client.query(
        `select count(*)::int as c from cmc_fmea where process_id=$1 and status!='CLOSED' and (s*o*d)>=120`,
        [id]
      );
      if ((highRpn[0]?.c || 0) > 0) {
        const msg = `Open high RPN items=${highRpn[0]?.c || 0} (RPN≥120).`;
        await notifyGuardFailure({
          processName: procName,
          productId,
          guard: 'FMEA',
          details: msg,
          link,
        });
        return res
          .status(412)
          .json({
            error: 'FMEA guard: open high RPN (≥120) items exist',
            openHighRpn: highRpn[0]?.c || 0,
          });
      }
    }

    // Require approval for target stage within the last 24h
    const appr = await client.query(
      `SELECT COUNT(*)::int as c FROM cmc_approvals 
       WHERE process_id=$1 AND stage=$2 AND now() - signed_at <= interval '24 hour'`,
      [id, stage]
    );
    if ((appr.rows[0]?.c || 0) === 0) {
      return res.status(412).json({
        error: `Approval required for ${stage}. Ask QA/Reg to sign in Approvals panel.`,
      });
    }

    const { rows: upd } = await client.query(
      `update cmc_processes set stage=$1 where process_id=$2 returning stage`,
      [stage, id]
    );

    // Invalidate cache after update
    invalidate('proc:list');
    invalidate(`proc:${id}`);

    res.json({ stage: upd[0].stage });
  } catch (error) {
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  } finally {
    client.release();
  }
});

// CONTROL STRATEGY (simple editor merge)
router.post('/processes/:id/control-strategy', async (req, res) => {
  const id = req.params.id;
  const { paramName, test, limit, methodHint } = req.body || {};
  if (!paramName || !test) return res.status(400).json({ error: 'Missing paramName/test' });
  const toMerge = { [paramName]: { test, limit, methodHint } };

  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_control_strategy (process_id, controls_json)
       values ($1, $2)
       on conflict (process_id) do update set controls_json = cmc_control_strategy.controls_json || EXCLUDED.controls_json`,
      [id, JSON.stringify(toMerge)]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving control strategy:', error);
    res.status(500).json({ error: 'Failed to save control strategy' });
  } finally {
    client.release();
  }
});

// DESIGN SPACE save
router.post('/processes/:id/design-space', async (req, res) => {
  const id = req.params.id;
  const { factors, status } = req.body || {};
  if (!Array.isArray(factors)) return res.status(400).json({ error: 'factors must be []' });

  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_design_space (process_id, factors_json, status)
       values ($1,$2,$3)
       on conflict (process_id) do update set factors_json=$2, status=$3`,
      [id, JSON.stringify(factors), status || 'DRAFT']
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving design space:', error);
    res.status(500).json({ error: 'Failed to save design space' });
  } finally {
    client.release();
  }
});

// PPQ
router.get('/processes/:id/ppq', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select ppq_id, lot_no, run_date, result, notes from cmc_ppq_lots where process_id=$1 order by run_date`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching PPQ:', error);
    res.status(500).json({ error: 'Failed to fetch PPQ' });
  } finally {
    client.release();
  }
});

router.post('/processes/:id/ppq', async (req, res) => {
  const id = req.params.id;
  const parsed = PPQBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid PPQ data' });
  const { lot_no, run_date, result, notes } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_ppq_lots (process_id, lot_no, run_date, result, notes) values ($1,$2,$3,$4,$5)`,
      [id, lot_no, run_date, result, notes || null]
    );

    // Invalidate cache after update
    invalidate('proc:list');
    invalidate(`proc:${id}`);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error adding PPQ:', error);
    res.status(500).json({ error: 'Failed to add PPQ' });
  } finally {
    client.release();
  }
});

// CPV
router.get('/processes/:id/cpv', async (req, res) => {
  const id = req.params.id;
  const param = req.query.param || null;
  const key = `cpv:${id}:${param || '*'}`;

  const data = await cached(key, async () => {
    const where = param ? `and param_name=$2` : ``;
    const args = [id];
    if (param) args.push(param);

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `select param_name, ts, value from cmc_cpv_points where process_id=$1 ${where} order by param_name, ts`,
        args
      );

      // group + baseline (mean, 3σ) + breaches
      const grouped = {};
      rows.forEach(r => (grouped[r.param_name] ||= []).push(r));
      const out = Object.entries(grouped).map(([name, arr]) => {
        const vals = arr.map(a => Number(a.value));
        const m = mean(vals);
        const s = vals.length > 1 ? sd(vals) : 0;
        const ucl = m + 3 * s,
          lcl = m - 3 * s;
        const points = arr.map(a => ({
          ts: a.ts,
          value: Number(a.value),
          breach: s > 0 && (a.value > ucl || a.value < lcl),
        }));
        const breaches = points.filter(p => p.breach).length;
        return { param: name, mean: m, ucl, lcl, breaches, points };
      });
      return out;
    } finally {
      client.release();
    }
  });
  res.json(data);
});

router.post('/processes/:id/cpv/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file missing' });
  const id = req.params.id;

  const client = await pool.connect();
  try {
    const records = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      trim: true,
      skip_empty_lines: true,
    });
    let inserted = 0;
    for (const rrow of records) {
      if (!rrow.param_name || !rrow.ts || !rrow.value) continue;
      await client.query(
        `insert into cmc_cpv_points (process_id, param_name, ts, value) values ($1,$2,$3,$4)`,
        [id, rrow.param_name, rrow.ts, Number(rrow.value)]
      );
      inserted++;
    }

    // Invalidate cache after import
    invalidate(`cpv:${id}`);

    res.json({ inserted });
  } catch (error) {
    console.error('Error importing CPV:', error);
    res.status(500).json({ error: 'Failed to import CPV' });
  } finally {
    client.release();
  }
});

// AI suggest endpoint (enhanced)
router.post('/processes/:id/ai/suggest', async (req, res) => {
  const proc = req.params.id;
  const client = await pool.connect();

  try {
    const { rows: u } = await client.query(
      `select unit_id, name from cmc_unit_ops where process_id=$1 order by sequence_no`,
      [proc]
    );
    const blend = u.find(x => x.name === 'Blend')?.unit_id;
    const dry = u.find(x => x.name === 'Dry')?.unit_id;

    const suggestions = [
      {
        sugg_id: randomUUID(),
        action: 'promote_cpp',
        unit_id: blend,
        payload_json: { paramName: 'Blend Time', range: { low: '12', high: '18', unit: 'min' } },
        rationale: 'CU risk increases when blend time <12 min; promote to CPP and link IPC.',
        score: 0.84,
      },
      {
        sugg_id: randomUUID(),
        action: 'add_ipc',
        unit_id: dry,
        payload_json: {
          paramName: 'Inlet Temp',
          ipc: { test: 'Loss on Drying', limit: '≤ 3.0%', methodHint: 'AM-001' },
        },
        rationale: 'Drying excursions correlate to LOD; add IPC to control.',
        score: 0.78,
      },
      {
        sugg_id: randomUUID(),
        action: 'propose_ppq_plan',
        unit_id: null,
        payload_json: {
          lots: 3,
          acceptance: ['Assay', 'CU', 'Dissolution', 'Micro all PASS'],
          scale: 'commercial',
        },
        rationale: 'Stage 2 PPQ requires ≥3 consecutive PASS lots at commercial scale.',
        score: 0.8,
      },
      {
        sugg_id: randomUUID(),
        action: 'propose_cpv_rules',
        unit_id: null,
        payload_json: {
          params: ['Inlet Temp', 'Blend Time'],
          rules: ['WE1', 'WE2', 'WE4'],
          chart: 'Xbar-R',
        },
        rationale: 'Apply Western Electric rules to monitor drift and sudden shifts.',
        score: 0.76,
      },
      {
        sugg_id: randomUUID(),
        action: 'tighten_range',
        unit_id: dry,
        payload_json: { paramName: 'Inlet Temp', newRange: { low: '52', high: '58', unit: '°C' } },
        rationale: 'Tightening range reduces variability; triggers change control and doc updates.',
        score: 0.71,
      },
    ];

    for (const s of suggestions) {
      await client.query(
        `insert into cmc_ai_suggestions (sugg_id, process_id, unit_id, action, payload_json, rationale, score) 
         values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [s.sugg_id, proc, s.unit_id, s.action, JSON.stringify(s.payload_json), s.rationale, s.score]
      );
    }
    res.json(suggestions);
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    res.status(500).json({ error: 'Failed to generate AI suggestions' });
  } finally {
    client.release();
  }
});

// Accept suggestion (enhanced)
router.post('/ai/:suggId/accept', async (req, res) => {
  const { suggId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: sRows } = await client.query(
      `select * from cmc_ai_suggestions where sugg_id=$1`,
      [suggId]
    );
    const s = sRows[0];
    if (!s) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    if (s.action === 'promote_cpp') {
      const { paramName, range } = s.payload_json;
      await client.query(
        `update cmc_parameters set kind='CPP', low=$1, high=$2, unit=coalesce(unit,$3) 
         where unit_id=$4 and lower(name)=lower($5)`,
        [range.low, range.high, range.unit, s.unit_id, paramName]
      );
      await client.query(
        `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
         values ($1,$2,$3,$4,$5,$6,'HIGH','OPEN', now()+ interval '7 day', $7)
         on conflict do nothing`,
        [
          PROD,
          'Process CPP',
          `Add IPC for CPP: ${paramName}`,
          'CPP promoted; ensure IPC method link',
          'Analytical Lead',
          'Analytical',
          `/process/${s.process_id}`,
        ]
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3 Manufacturing Process', 'CPP change']
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3.4 Controls of critical steps', 'CPP/control change']
      );
    }

    if (s.action === 'add_ipc') {
      const { paramName, ipc } = s.payload_json;
      await client.query(
        `insert into cmc_control_strategy (process_id, controls_json)
         values ($1, $2)
         on conflict (process_id) do update set controls_json = cmc_control_strategy.controls_json || EXCLUDED.controls_json`,
        [s.process_id, JSON.stringify({ [paramName]: ipc })]
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3.4 Controls of critical steps', 'Control Strategy update']
      );
    }

    if (s.action === 'propose_ppq_plan') {
      const { lots, acceptance, scale } = s.payload_json;
      for (let i = 1; i <= lots; i++) {
        await client.query(
          `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
           values ($1,$2,$3,$4,$5,$6,'HIGH','OPEN', now()+ interval '21 day', $7)
           on conflict do nothing`,
          [
            PROD,
            'PPQ',
            `Run PPQ lot ${i} (${scale})`,
            `Acceptance: ${acceptance.join(', ')}`,
            'Manufacturing Lead',
            'Manufacturing',
            `/process/${s.process_id}`,
          ]
        );
      }
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3.5 Process validation', 'PPQ plan update']
      );
    }

    if (s.action === 'propose_cpv_rules') {
      const { params, rules, chart } = s.payload_json;
      await client.query(
        `insert into cmc_control_strategy (process_id, controls_json)
         values ($1, $2)
         on conflict (process_id) do update set controls_json = cmc_control_strategy.controls_json || EXCLUDED.controls_json`,
        [s.process_id, JSON.stringify({ CPV: { params, rules, chart } })]
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3.4 Controls of critical steps', 'Control Strategy update']
      );
    }

    if (s.action === 'tighten_range') {
      const { paramName, newRange } = s.payload_json;
      await client.query(
        `update cmc_parameters set low=$1, high=$2, unit=coalesce(unit,$3) 
         where unit_id=$4 and lower(name)=lower($5)`,
        [newRange.low, newRange.high, newRange.unit, s.unit_id, paramName]
      );
      await client.query(
        `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
         values ($1,$2,$3,$4,$5,$6,'HIGH','OPEN', now()+ interval '14 day', $7)
         on conflict do nothing`,
        [
          PROD,
          'Change Control',
          `Update docs & specs for tightened ${paramName}`,
          'Parameter range tightened; update P.3.3/P.3.4 + BMR',
          'Reg CMC',
          'Regulatory',
          `/process/${s.process_id}`,
        ]
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3 Manufacturing Process', 'CPP change']
      );
      await client.query(
        `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
        [s.process_id, 'Module 3 > 3.2.P.3.4 Controls of critical steps', 'CPP/control change']
      );
    }

    await client.query(`update cmc_ai_suggestions set status='ACCEPTED' where sugg_id=$1`, [
      suggId,
    ]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Failed to apply suggestion' });
  } finally {
    client.release();
  }
});

// Reject suggestion
router.post('/ai/:suggId/reject', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query(`update cmc_ai_suggestions set status='REJECTED' where sugg_id=$1`, [
      req.params.suggId,
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error rejecting suggestion:', error);
    res.status(500).json({ error: 'Failed to reject suggestion' });
  } finally {
    client.release();
  }
});

// Generate P.3 document
router.post('/processes/:id/generate-docs', async (req, res) => {
  const procId = req.params.id;

  try {
    const data = await bundle(procId);
    const docTitle = `P.3 Manufacturing Process — ${data.process.name}`;
    const md = `<!-- PROCESS_ID: ${procId} -->
# 3.2.P.3 Manufacturing Process

## Process Flow (DP)
{{PROC.FLOW.PFD_IMAGE_URL}}

## Critical Process Parameters (CPPs)
| Unit | Parameter | Target | Range | IPC |
|---|---|---|---|---|
${data.units
  .map(u =>
    u.parameters
      .filter(p => p.kind === 'CPP')
      .map(
        p =>
          `| ${u.name} | ${p.name} | ${p.target || ''} | ${p.low || ''}–${p.high || ''} ${p.unit || ''} | {{PROC.CPP.${p.param_id}.IPC}} |`
      )
      .join('\n')
  )
  .join('\n')}

## Control Strategy
{{PROC.CONTROL_STRATEGY}}

## Process Validation (PPQ) & Continued Process Verification (CPV)
{{PROC.PPQ.SUMMARY}}
{{PROC.CPV.STRATEGY}}
`;

    res.json({
      url: `/authoring/documents/new?title=${encodeURIComponent(docTitle)}&content=${encodeURIComponent(md)}&process=${procId}`,
      content: md,
      title: docTitle,
    });
  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// === FMEA ===
router.get('/processes/:id/fmea', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select * from cmc_fmea where process_id=$1 order by created_at desc`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching FMEA:', error);
    res.status(500).json({ error: 'Failed to fetch FMEA' });
  } finally {
    client.release();
  }
});

router.post('/processes/:id/fmea', async (req, res) => {
  const id = req.params.id;
  const { unit_id, failure_mode, cause, effect, s, o, d, mitigation, owner } = req.body || {};
  if (!failure_mode || !s || !o || !d)
    return res.status(400).json({ error: 'failure_mode, s, o, d required' });

  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_fmea (process_id, unit_id, failure_mode, cause, effect, s, o, d, mitigation, owner)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        unit_id || null,
        failure_mode,
        cause || null,
        effect || null,
        Number(s),
        Number(o),
        Number(d),
        mitigation || null,
        owner || null,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error adding FMEA:', error);
    res.status(500).json({ error: 'Failed to add FMEA' });
  } finally {
    client.release();
  }
});

router.patch('/fmea/:fmeaId', async (req, res) => {
  const { status, mitigation, owner, s, o, d } = req.body || {};
  const sets = [];
  const vals = [];
  function addSet(col, val) {
    sets.push(`${col}=$${sets.length + 1}`);
    vals.push(val);
  }
  if (status) addSet('status', status);
  if (mitigation !== undefined) addSet('mitigation', mitigation);
  if (owner !== undefined) addSet('owner', owner);
  if (s) addSet('s', Number(s));
  if (o) addSet('o', Number(o));
  if (d) addSet('d', Number(d));
  if (!sets.length) return res.json({ ok: true });
  vals.push(req.params.fmeaId);

  const client = await pool.connect();
  try {
    const sql = `update cmc_fmea set ${sets.join(', ')} where fmea_id=$${sets.length + 1}`;
    await client.query(sql, vals);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating FMEA:', error);
    res.status(500).json({ error: 'Failed to update FMEA' });
  } finally {
    client.release();
  }
});

// mark doc "dirty"
async function markDocDirty(processId, sectionPath, reason) {
  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_doc_dirty (process_id, section_path, reason) values ($1,$2,$3)`,
      [processId, sectionPath, reason]
    );
  } catch (error) {
    console.error('Error marking doc dirty:', error);
  } finally {
    client.release();
  }
}

// === Impact graph: simple computed dependencies ===
router.get('/processes/:id/impact', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();

  try {
    const { rows: params } = await client.query(
      `select u.name as unit_name, p.param_id, p.name, p.kind, p.low, p.high, p.unit
       from cmc_parameters p join cmc_unit_ops u on p.unit_id=u.unit_id
       where u.process_id=$1`,
      [id]
    );

    const { rows: cs } = await client.query(
      `select controls_json from cmc_control_strategy where process_id=$1`,
      [id]
    );
    const control = cs[0]?.controls_json || {};

    const changes = [];
    const impacts = [];

    // CPPs without a control entry -> impact Analytical/Regulatory
    params
      .filter(p => p.kind === 'CPP')
      .forEach(p => {
        if (!control[p.name]) {
          changes.push({ entity: 'PARAM', id: p.param_id, field: 'CPP', value: p.name });
          impacts.push({ module: 'Analytical', action: 'ensure_ipc_method', param: p.name });
          impacts.push({ module: 'Regulatory', action: 'update_section', section: '3.2.P.3.4' });
        }
      });

    // Build a link list (toy)
    const links = params
      .filter(p => p.kind === 'CPP')
      .map(p => ({
        from: `CPP:${p.name}`,
        to: `DOC:3.2.P.3.4`,
        type: 'DOC',
      }));

    res.json({ changes, impacts, links, control });
  } catch (error) {
    console.error('Error fetching impact:', error);
    res.status(500).json({ error: 'Failed to fetch impact' });
  } finally {
    client.release();
  }
});

// === DOE: propose a 2^k screening design from factors (k<=4) ===
router.post('/processes/:id/doe/propose', async (req, res) => {
  const id = req.params.id;
  const { factors } = req.body || {}; // [{name, low, high}]
  if (!Array.isArray(factors) || factors.length < 1 || factors.length > 4) {
    return res.status(400).json({ error: 'factors[1..4] required' });
  }

  // build ±1 coded design (full factorial)
  const k = factors.length;
  const rows = [];
  const n = 1 << k;
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < k; j++) {
      row.push((i >> j) & 1 ? 1 : -1);
    }
    rows.push(row);
  }
  const design = rows.map(r => Object.fromEntries(r.map((v, idx) => [factors[idx].name, v])));
  res.json({ factors, design });
});

// Fit OLS (main effects only), CSV or JSON rows [{factorA: coded ±1, ..., y}]
router.post('/processes/:id/doe/fit', upload.single('file'), async (req, res) => {
  const id = req.params.id;
  let rows = [];
  if (req.file) {
    const recs = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      trim: true,
      skip_empty_lines: true,
    });
    rows = recs;
  } else {
    rows = req.body?.rows || [];
  }
  if (!rows.length) return res.status(400).json({ error: 'rows required (CSV or JSON)' });

  const keys = Object.keys(rows[0]).filter(k => k !== 'y');
  // X: [1, x1, x2,...], y: scalar
  const X = rows.map(r => [1, ...keys.map(k => Number(r[k]))]);
  const y = rows.map(r => Number(r.y));

  // beta = (X'X)^-1 X'y
  function transpose(m) {
    return m[0].map((_, i) => m.map(r => r[i]));
  }
  function mult(A, B) {
    return A.map(r => B[0].map((_, j) => r.reduce((s, _, k) => s + r[k] * B[k][j], 0)));
  }
  function inv(M) {
    // very small k => use Gaussian elimination naive
    const n = M.length;
    const I = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
    );
    const A = M.map(r => r.slice());
    const B = I.map(r => r.slice());
    for (let i = 0; i < n; i++) {
      let piv = A[i][i];
      if (Math.abs(piv) < 1e-9) {
        // swap
        for (let r = i + 1; r < n; r++) {
          if (Math.abs(A[r][i]) > 1e-9) {
            [A[i], A[r]] = [A[r], A[i]];
            [B[i], B[r]] = [B[r], B[i]];
            piv = A[i][i];
            break;
          }
        }
      }
      const f = piv;
      for (let j = 0; j < n; j++) {
        A[i][j] /= f;
        B[i][j] /= f;
      }
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const g = A[r][i];
        for (let j = 0; j < n; j++) {
          A[r][j] -= g * A[i][j];
          B[r][j] -= g * B[i][j];
        }
      }
    }
    return B;
  }

  const Xt = transpose(X);
  const XtX = mult(Xt, X);
  const XtXinv = inv(XtX);
  const Xty = mult(
    Xt,
    y.map(v => [v])
  );
  const beta = mult(XtXinv, Xty).map(r => r[0]); // [b0, b1, b2...]

  // R^2
  const yhat = X.map(r => r.reduce((s, xi, i) => s + xi * beta[i], 0));
  const ybar = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  const coeffs = Object.fromEntries([
    ['Intercept', beta[0]],
    ...keys.map((k, i) => [k, beta[i + 1]]),
  ]);
  const fit_stats = { coeffs, r2 };

  // store model
  const client = await pool.connect();
  try {
    await client.query(
      `insert into cmc_doe_models (process_id, factors_json, design_json, fit_stats_json)
       values ($1,$2,$3,$4)`,
      [id, keys.map(k => ({ name: k })), rows, fit_stats]
    );
    res.json({ fit: fit_stats });
  } catch (error) {
    console.error('Error storing DOE model:', error);
    res.status(500).json({ error: 'Failed to store DOE model' });
  } finally {
    client.release();
  }
});

// Simulate & recommend range (threshold on y)
router.post('/processes/:id/doe/simulate', async (req, res) => {
  const id = req.params.id;
  const { target, step } = req.body || {};
  const client = await pool.connect();

  try {
    const { rows: mRows } = await client.query(
      `select * from cmc_doe_models where process_id=$1 order by created_at desc limit 1`,
      [id]
    );
    if (!mRows[0]) return res.status(404).json({ error: 'No model' });

    const fit = mRows[0].fit_stats_json;
    const factors = (mRows[0].factors_json || []).map(f => f.name);

    // simple grid [-1..1] per factor
    const s = Number(step || 0.5);
    function grid1() {
      const arr = [];
      for (let v = -1; v <= 1.0001; v += s) arr.push(Number(v.toFixed(4)));
      return arr;
    }
    const axes = factors.map(() => grid1());

    // generate all combinations (k<=3 recommended)
    let combos = [[]];
    for (const ax of axes) {
      const next = [];
      for (const c of combos) {
        for (const v of ax) next.push([...c, v]);
      }
      combos = next;
    }

    // predict y = b0 + sum(bi*xi)
    const b0 = fit.coeffs.Intercept || 0;
    const ys = combos.map(
      c => b0 + c.reduce((s, xi, i) => s + (fit.coeffs[factors[i]] || 0) * xi, 0)
    );
    const rec = { min: Math.min(...ys), max: Math.max(...ys) };

    res.json({
      grid: { factors, step: s, points: combos.map((c, i) => ({ x: c, y: ys[i] })) },
      summary: { r2: fit.r2, yRange: rec },
    });
  } catch (error) {
    console.error('Error simulating DOE:', error);
    res.status(500).json({ error: 'Failed to simulate DOE' });
  } finally {
    client.release();
  }
});

// Adopt recommendation into Design Space (map coded -1..1 back using factor bounds in request)
router.post('/processes/:id/doe/adopt', async (req, res) => {
  const id = req.params.id;
  const { factors } = req.body || {}; // [{name, low, high, unit}]
  if (!Array.isArray(factors) || !factors.length) {
    return res.status(400).json({ error: 'factors required' });
  }

  const client = await pool.connect();
  try {
    // Check if a design space already exists for this process
    const existing = await client.query(
      'SELECT ds_id FROM cmc_design_space WHERE process_id = $1',
      [id]
    );

    if (existing.rows.length > 0) {
      // Update existing design space
      await client.query(
        'UPDATE cmc_design_space SET factors_json = $2, status = $3 WHERE process_id = $1',
        [id, JSON.stringify(factors), 'LOCKED']
      );
    } else {
      // Insert new design space
      await client.query(
        'INSERT INTO cmc_design_space (process_id, factors_json, status) VALUES ($1, $2, $3)',
        [id, JSON.stringify(factors), 'LOCKED']
      );
    }
    await markDocDirty(id, 'Module 3 > 3.2.P.3.6 Process development', 'Design Space adoption');
    res.json({ ok: true });
  } catch (error) {
    console.error('Error adopting DOE:', error);
    res.status(500).json({ error: 'Failed to adopt DOE' });
  } finally {
    client.release();
  }
});

// AI explain endpoint (for "Why?" UI button)
router.post('/processes/:id/ai/explain', async (req, res) => {
  const { rule, context } = req.body || {};
  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      explanation: 'AI not configured; check OPENAI_API_KEY.',
      citations: ['ICH Q8', 'ICH Q9', 'FDA PV'],
    });
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const sys =
      'Explain the regulatory and scientific rationale succinctly. Cite ICH Q8/Q9/Q10 or FDA PV.';
    const out = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: `Rule or topic: ${rule}\nContext:\n${JSON.stringify(context)}` },
      ],
    });
    res.json({ explanation: out.choices[0]?.message?.content || '—' });
  } catch (error) {
    console.error('Error with AI explain:', error);
    res.json({
      explanation: 'AI explanation temporarily unavailable.',
      citations: ['ICH Q8', 'ICH Q9', 'FDA PV'],
    });
  }
});

// Constants for task assignment
const ANALYTICAL_LEAD = process.env.ANALYTICAL_LEAD_NAME || 'Analytical Lead';
const REG_LEAD = process.env.REG_LEAD_NAME || 'Reg CMC';

// Create tasks from /impact signals
router.post('/processes/:id/impact/apply', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();
  try {
    const { rows: proc } = await client.query(
      `select name, product_id from cmc_processes where process_id=$1`,
      [id]
    );
    if (!proc[0]) return res.status(404).json({ error: 'Process not found' });
    const name = proc[0].name;
    const productId = proc[0].product_id;

    // reuse the same logic as GET /impact
    const { rows: params } = await client.query(
      `select u.name as unit_name, p.param_id, p.name, p.kind
       from cmc_parameters p join cmc_unit_ops u on p.unit_id=u.unit_id
       where u.process_id=$1`,
      [id]
    );
    const { rows: cs } = await client.query(
      `select controls_json from cmc_control_strategy where process_id=$1`,
      [id]
    );
    const control = cs[0]?.controls_json || {};

    let created = 0;

    for (const p of params.filter(x => x.kind === 'CPP')) {
      const hasControl = !!control[p.name];
      if (!hasControl) {
        // Analytical task
        await client.query(
          `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
           values ($1,$2,$3,$4,$5,$6,'HIGH','OPEN',now()+interval '10 day',$7)
           on conflict do nothing`,
          [
            productId,
            'Analytical IPC',
            `Develop/verify IPC for CPP: ${p.name}`,
            `CPP has no IPC in Control Strategy for process ${name}`,
            ANALYTICAL_LEAD,
            'Analytical',
            `/process/${id}`,
          ]
        );
        created++;
        // Regulatory task
        await client.query(
          `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
           values ($1,$2,$3,$4,$5,$6,'MEDIUM','OPEN',now()+interval '14 day',$7)
           on conflict do nothing`,
          [
            productId,
            'Reg Update',
            `Update 3.2.P.3.4 for ${p.name}`,
            `Add control description for CPP in P.3.4 (controls of critical steps)`,
            REG_LEAD,
            'Regulatory',
            `/process/${id}`,
          ]
        );
        created++;
        // mark docs dirty
        await markDocDirty(
          id,
          'Module 3 > 3.2.P.3.4 Controls of critical steps',
          `CPP ${p.name} missing IPC`
        );
      }
    }

    res.json({ created });
  } catch (error) {
    console.error('Error applying impact tasks:', error);
    res.status(500).json({ error: 'Failed to apply impact tasks' });
  } finally {
    client.release();
  }
});

// --- Build Process token map ---
async function buildProcTokenMap(processId) {
  const client = await pool.connect();
  try {
    const [{ rows: u }, { rows: cs }, { rows: ppq }, { rows: cpv }] = await Promise.all([
      client.query(
        `select u.unit_id, u.name as unit_name, p.param_id, p.name, p.kind, p.target, p.low, p.high, p.unit
              from cmc_unit_ops u left join cmc_parameters p on p.unit_id=u.unit_id
              where u.process_id=$1 order by u.sequence_no`,
        [processId]
      ),
      client.query(`select controls_json from cmc_control_strategy where process_id=$1`, [
        processId,
      ]),
      client.query(`select result from cmc_ppq_lots where process_id=$1 order by run_date`, [
        processId,
      ]),
      client.query(`select param_name, value from cmc_cpv_points where process_id=$1`, [processId]),
    ]);
    const control = cs[0]?.controls_json || {};

    // CPP IPC tokens
    const cpp = u.filter(r => r.kind === 'CPP');
    const map = {};
    cpp.forEach(r => {
      const token = `PROC.CPP.${r.param_id}.IPC`;
      const c = control[r.name];
      map[token] = c
        ? `${c.test}: ${c.limit}${c.methodHint ? ` (${c.methodHint})` : ''}`
        : '(add IPC)';
    });

    // Control strategy JSON dump
    map['PROC.CONTROL_STRATEGY'] = Object.keys(control).length
      ? JSON.stringify(control, null, 2)
      : '(none)';

    // PPQ summary
    const pass = ppq.filter(x => x.result === 'PASS').length;
    const fail = ppq.filter(x => x.result === 'FAIL').length;
    map['PROC.PPQ.SUMMARY'] =
      `PPQ lots: PASS=${pass}, FAIL=${fail}. ${pass >= 3 ? 'Meets ≥3 PASS requirement.' : 'Below requirement.'}`;

    // CPV strategy (very light synopsis)
    const params = new Set(cpv.map(x => x.param_name));
    map['PROC.CPV.STRATEGY'] = params.size
      ? `CPV monitored params: ${Array.from(params).join(', ')}. Charts: X̄ with 3σ limits.`
      : '(no CPV data)';

    // Flow image URL placeholder
    map['PROC.FLOW.PFD_IMAGE_URL'] = '(provide PFD image URL)';

    return map;
  } finally {
    client.release();
  }
}

// Replace {{TOKENS}} in section content
function fillTokensInText(md, tokens) {
  return md.replace(/{{([A-Z0-9._]+)}}/g, (_, key) => tokens[key] ?? `{{${key}}}`);
}

// List candidate sections (latest P.3 for this process)
router.get('/processes/:id/authoring/targets', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();
  try {
    const { rows: proc } = await client.query(
      `select name, product_id from cmc_processes where process_id=$1`,
      [id]
    );
    if (!proc[0]) return res.status(404).json({ error: 'Process not found' });
    const titleLike = `P.3 Manufacturing Process — ${proc[0].name}`;
    const { rows } = await client.query(
      `select s.section_id, s.title, s.path, d.doc_id, d.title as doc_title, s.created_at
       from cmc_sections s join cmc_documents d on s.doc_id=d.doc_id
       where d.product_id=$1 and s.path like 'Module 3 % 3.2.P.3 %' and d.title=$2
       order by s.created_at desc limit 5`,
      [proc[0].product_id, titleLike]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching authoring targets:', error);
    res.status(500).json({ error: 'Failed to fetch authoring targets' });
  } finally {
    client.release();
  }
});

// Recompute tokens for a given (or latest) section
router.post('/processes/:id/authoring/recompute-tokens', async (req, res) => {
  const id = req.params.id;
  let { sectionId } = req.body || {};
  const client = await pool.connect();
  try {
    if (!sectionId) {
      const list = await client.query(
        `select s.section_id
         from cmc_sections s join cmc_documents d on s.doc_id=d.doc_id
         join cmc_processes p on d.product_id=p.product_id
         where p.process_id=$1 and s.path like 'Module 3 % 3.2.P.3 %'
         order by s.created_at desc limit 1`,
        [id]
      );
      sectionId = list.rows[0]?.section_id;
    }
    if (!sectionId) return res.status(404).json({ error: 'No matching P.3 section found' });
    const sec = await client.query(`select content_md from cmc_sections where section_id=$1`, [
      sectionId,
    ]);
    if (!sec.rows[0]) return res.status(404).json({ error: 'Section not found' });
    const tokens = await buildProcTokenMap(id);
    const updated = fillTokensInText(sec.rows[0].content_md, tokens);
    await client.query(`update cmc_sections set content_md=$1 where section_id=$2`, [
      updated,
      sectionId,
    ]);
    res.json({ ok: true, tokens: Object.keys(tokens).length, sectionId });
  } catch (error) {
    console.error('Error recomputing tokens:', error);
    res.status(500).json({ error: 'Failed to recompute tokens' });
  } finally {
    client.release();
  }
});

// === STEP 5: Canvas edit endpoints (positions + CRUD + SOP links) ===

// Create a unit op
router.post('/processes/:id/units', async (req, res) => {
  const id = req.params.id;
  const { name, type, sequence_no, pos_x, pos_y, sop_title, sop_url } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `insert into cmc_unit_ops (process_id,name,type,sequence_no,pos_x,pos_y,sop_title,sop_url)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [
        id,
        name,
        type,
        sequence_no || 999,
        pos_x || 0,
        pos_y || 0,
        sop_title || null,
        sop_url || null,
      ]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating unit op:', error);
    res.status(500).json({ error: 'Failed to create unit op' });
  } finally {
    client.release();
  }
});

// Update unit op (name/type/SOP)
router.patch('/units/:unitId', async (req, res) => {
  const { unitId } = req.params;
  const { name, type, sop_title, sop_url } = req.body || {};
  const sets = [];
  const vals = [];
  function set(col, val) {
    sets.push(`${col}=$${sets.length + 1}`);
    vals.push(val);
  }
  if (name !== undefined) set('name', name);
  if (type !== undefined) set('type', type);
  if (sop_title !== undefined) set('sop_title', sop_title);
  if (sop_url !== undefined) set('sop_url', sop_url);
  if (!sets.length) return res.json({ ok: true });
  vals.push(unitId);

  const client = await pool.connect();
  try {
    await client.query(
      `update cmc_unit_ops set ${sets.join(',')} where unit_id=$${sets.length + 1}`,
      vals
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating unit op:', error);
    res.status(500).json({ error: 'Failed to update unit op' });
  } finally {
    client.release();
  }
});

// Save positions (batch)
router.post('/processes/:id/units/layout', async (req, res) => {
  const id = req.params.id;
  const { nodes } = req.body || {}; // [{unit_id,pos_x,pos_y},...]
  if (!Array.isArray(nodes)) return res.status(400).json({ error: 'nodes[] required' });

  const client = await pool.connect();
  try {
    for (const n of nodes) {
      await client.query(
        `update cmc_unit_ops set pos_x=$1,pos_y=$2 where process_id=$3 and unit_id=$4`,
        [n.pos_x, n.pos_y, id, n.unit_id]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving layout:', error);
    res.status(500).json({ error: 'Failed to save layout' });
  } finally {
    client.release();
  }
});

// Delete a unit op
router.delete('/units/:unitId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query(`delete from cmc_unit_ops where unit_id=$1`, [req.params.unitId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting unit op:', error);
    res.status(500).json({ error: 'Failed to delete unit op' });
  } finally {
    client.release();
  }
});

// === STEP 5: AI Playbooks: list + run (dry-run or apply) ===

// List playbooks (system + future user-defined)
router.get('/processes/:id/playbooks', async (_req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select playbook_id,name,description,actions_json from cmc_ai_playbooks order by name`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching playbooks:', error);
    res.status(500).json({ error: 'Failed to fetch playbooks' });
  } finally {
    client.release();
  }
});

// Utility: resolve unit by unitName
async function findUnitByName(processId, unitName) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `select unit_id from cmc_unit_ops where process_id=$1 and lower(name)=lower($2) limit 1`,
      [processId, unitName]
    );
    return rows[0]?.unit_id || null;
  } finally {
    client.release();
  }
}

// Reuse your "accept suggestion" logic for each action
async function applyPlaybookAction(processId, action, args, client) {
  // Match Step-2/3 "accept" paths
  if (action === 'promote_cpp') {
    const unit_id =
      args.unitId || (args.unitName ? await findUnitByName(processId, args.unitName) : null);
    const { paramName, range } = args;
    await client.query(
      `update cmc_parameters set kind='CPP', low=$1, high=$2, unit=coalesce(unit,$3)
       where unit_id=$4 and lower(name)=lower($5)`,
      [range.low, range.high, range.unit, unit_id, paramName]
    );
    await client.query(
      `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
       select product_id, 'Process CPP', $1, $2, 'Analytical Lead','Analytical','HIGH','OPEN', now()+interval '7 day', $3
       from cmc_processes where process_id=$4`,
      [
        `Add IPC for CPP: ${paramName}`,
        'CPP promoted; ensure IPC method link',
        `/process/${processId}`,
        processId,
      ]
    );
    await markDocDirty(processId, 'Module 3 > 3.2.P.3 Manufacturing Process', 'CPP change');
    await markDocDirty(
      processId,
      'Module 3 > 3.2.P.3.4 Controls of critical steps',
      'CPP/control change'
    );
  }

  if (action === 'add_ipc') {
    const unit_id =
      args.unitId || (args.unitName ? await findUnitByName(processId, args.unitName) : null);
    const { paramName, ipc } = args;
    await client.query(
      `insert into cmc_control_strategy (process_id, controls_json)
       values ($1,$2)
       on conflict (process_id) do update set controls_json = cmc_control_strategy.controls_json || EXCLUDED.controls_json`,
      [processId, JSON.stringify({ [paramName]: ipc })]
    );
    await markDocDirty(
      processId,
      'Module 3 > 3.2.P.3.4 Controls of critical steps',
      'Control Strategy update'
    );
  }

  if (action === 'propose_ppq_plan') {
    const { lots, acceptance, scale } = args;
    for (let i = 1; i <= Number(lots || 3); i++) {
      await client.query(
        `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
         select product_id, 'PPQ', $1, $2, 'Manufacturing Lead','Manufacturing','HIGH','OPEN', now()+interval '21 day', $3
         from cmc_processes where process_id=$4`,
        [
          `Run PPQ lot ${i} (${scale || 'commercial'})`,
          `Acceptance: ${(acceptance || []).join(', ')}`,
          `/process/${processId}`,
          processId,
        ]
      );
    }
    await markDocDirty(processId, 'Module 3 > 3.2.P.3.5 Process validation', 'PPQ plan update');
  }

  if (action === 'propose_cpv_rules') {
    const { params, rules, chart } = args;
    await client.query(
      `insert into cmc_control_strategy (process_id, controls_json)
       values ($1,$2)
       on conflict (process_id) do update set controls_json = cmc_control_strategy.controls_json || EXCLUDED.controls_json`,
      [processId, JSON.stringify({ CPV: { params, rules, chart } })]
    );
  }

  if (action === 'tighten_range') {
    const unit_id =
      args.unitId || (args.unitName ? await findUnitByName(processId, args.unitName) : null);
    const { paramName, newRange } = args;
    await client.query(
      `update cmc_parameters set low=$1, high=$2, unit=coalesce(unit,$3)
       where unit_id=$4 and lower(name)=lower($5)`,
      [newRange.low, newRange.high, newRange.unit, unit_id, paramName]
    );
    await client.query(
      `insert into cmc_tasks (product_id, section, title, why, owner, role, priority, status, due_date, link)
       select product_id, 'Change Control', $1, $2, 'Reg CMC','Regulatory','HIGH','OPEN', now()+interval '14 day', $3
       from cmc_processes where process_id=$4`,
      [
        `Update docs & specs for tightened ${paramName}`,
        'Range tightened; update P.3.3/P.3.4 + BMR',
        `/process/${processId}`,
        processId,
      ]
    );
    await markDocDirty(
      processId,
      'Module 3 > 3.2.P.3.4 Controls of critical steps',
      'CPP/control change'
    );
  }

  if (action === 'draft_p3_section') {
    // No-op: handled by your Generate Docs + Refresh Tokens flows; keep for compatibility
    await markDocDirty(
      processId,
      'Module 3 > 3.2.P.3.5 Process validation',
      'Draft requested by playbook'
    );
  }
}

// Run a playbook (dryRun previews changes summary)
router.post('/processes/:id/playbooks/:pbId/run', async (req, res) => {
  const processId = req.params.id;
  const pbId = req.params.pbId;
  const dryRun = !!req.query.dryRun || !!req.body?.dryRun;
  const actor = req.header('x-user-name') || 'You';

  const client = await pool.connect();
  try {
    const { rows: pbRows } = await client.query(
      `select * from cmc_ai_playbooks where playbook_id=$1`,
      [pbId]
    );
    if (!pbRows[0]) return res.status(404).json({ error: 'Playbook not found' });

    const actions = pbRows[0].actions_json || [];
    const summary = [];

    if (!dryRun) await client.query('BEGIN');

    for (const a of actions) {
      summary.push({ action: a.action, args: a.args });
      if (!dryRun) await applyPlaybookAction(processId, a.action, a.args || {}, client);
    }

    if (!dryRun) await client.query('COMMIT');

    // record run
    await client.query(
      `insert into cmc_ai_playbook_runs (playbook_id,process_id,actor,dry_run,result_json)
       values ($1,$2,$3,$4,$5)`,
      [pbId, processId, actor, dryRun, JSON.stringify({ summary })]
    );

    res.json({ ok: true, dryRun, summary });
  } catch (e) {
    if (!dryRun) await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Playbook execution failed' });
  } finally {
    client.release();
  }
});

// === STEP 5: Export Pack (P.3 + PPQ → PDF/DOCX, zipped) ===

// Build simple HTML from a Markdown section
async function renderSectionToHTML(md, title) {
  const body = marked(md || '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;padding:24px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px} pre{background:#f7f7f7;padding:8px;overflow:auto}</style>
  </head><body><h1>${title}</h1>${body}</body></html>`;
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
  });
  await browser.close();
  return pdf;
}

function textToDocxBuffer(title, text) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 28 })] }),
          new Paragraph({ children: [new TextRun(text)] }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// POST /api/cmc-process/processes/:id/export-pack?fmt=pdf|docx
// MD to PDF converter using PDFKit (fallback when Puppeteer fails)
async function mdToPdfBufferViaPdfkit(title, md) {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {});

  doc.fontSize(16).text(title, { underline: true });
  doc.moveDown();

  const txt = marked.parse ? marked.parse(md || '') : marked(md || '') || '';
  const plainText = txt.replace(/<[^>]+>/g, ''); // strip HTML tags
  doc.fontSize(11).text(plainText || '(empty)');

  doc.end();

  return new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

router.get('/processes/:id/export-pack', async (req, res) => {
  const processId = req.params.id;
  const client = await pool.connect();

  try {
    // Get process info
    const { rows: proc } = await client.query(
      'SELECT name, product_id FROM cmc_processes WHERE process_id = $1',
      [processId]
    );

    if (!proc[0]) {
      return res.status(404).json({ error: 'Process not found' });
    }

    const pName = proc[0].name;
    const titleLike = `P.3 Manufacturing Process — ${pName}`;

    // Get P.3 documentation if available
    const { rows: p3 } = await client.query(
      `SELECT s.title, s.content_md FROM cmc_sections s 
       JOIN cmc_documents d ON s.doc_id = d.doc_id
       WHERE d.product_id = $1 AND d.title = $2 
       ORDER BY s.created_at DESC LIMIT 1`,
      [proc[0].product_id, titleLike]
    );

    // Get PPQ data
    const { rows: ppq } = await client.query(
      "SELECT lot_no, run_date, result, COALESCE(notes, '') as notes FROM cmc_ppq_lots WHERE process_id = $1 ORDER BY run_date",
      [processId]
    );

    const ppqMd =
      `# PPQ Summary\n\n| Lot | Date | Result | Notes |\n|---|---|---|---|\n` +
      ppq
        .map(
          r =>
            `| ${r.lot_no} | ${new Date(r.run_date).toISOString().slice(0, 10)} | ${r.result} | ${r.notes} |`
        )
        .join('\n');

    // Generate process documentation
    const processDoc = p3[0]
      ? p3[0].content_md
      : `# ${pName} Process Documentation\n\n## Process Details\nProcess ID: ${processId}\nGenerated: ${new Date().toISOString()}\n\n## Generate P.3 docs first via /processes/${processId}/generate-docs`;

    // Create ZIP file with both PDF and DOCX
    const zip = new JSZip();

    // Try Puppeteer first, fallback to PDFKit
    try {
      const p3Html = await renderSectionToHTML(
        processDoc,
        p3[0] ? p3[0].title : `${pName} Process Documentation`
      );
      const ppqHtml = await renderSectionToHTML(ppqMd, 'PPQ Summary');
      const p3Pdf = await htmlToPdfBuffer(p3Html);
      const ppqPdf = await htmlToPdfBuffer(ppqHtml);
      zip.file('P3_Manufacturing_Process.pdf', p3Pdf);
      zip.file('PPQ_Summary.pdf', ppqPdf);
    } catch (puppeteerError) {
      console.warn('Puppeteer failed, using PDFKit fallback:', puppeteerError);
      // Fallback to PDFKit
      const p3Title = p3[0] ? p3[0].title : `${pName} Process Documentation`;
      const processPdf = await mdToPdfBufferViaPdfkit(p3Title, processDoc);
      const ppqPdf = await mdToPdfBufferViaPdfkit('PPQ Summary', ppqMd);
      zip.file('P3_Manufacturing_Process.pdf', processPdf);
      zip.file('PPQ_Summary.pdf', ppqPdf);
    }

    // Add DOCX versions
    const p3Title = p3[0] ? p3[0].title : `${pName} Process Documentation`;
    const p3Docx = await textToDocxBuffer(p3Title, processDoc);
    const ppqDocx = await textToDocxBuffer('PPQ Summary', ppqMd);
    zip.file('P3_Manufacturing_Process.docx', p3Docx);
    zip.file('PPQ_Summary.docx', ppqDocx);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="submission_pack_${pName.replace(/\s+/g, '_')}.zip"`
    );
    return res.end(zipBuffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed', details: error.message });
  } finally {
    client.release();
  }
});

// === STEP 10: Approval endpoints for 21 CFR Part 11 compliance ===

// GET /api/cmc-process/processes/:id/approvals - list approvals for a process
router.get('/processes/:id/approvals', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `SELECT approval_id, process_id, stage, action, signer_name, signer_role, 
              reason, signed_at
       FROM cmc_approvals 
       WHERE process_id = $1 
       ORDER BY signed_at DESC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals' });
  } finally {
    client.release();
  }
});

// POST /api/cmc-process/processes/:id/approvals - record approval for stage changes
router.post('/processes/:id/approvals', async (req, res) => {
  const id = req.params.id;
  const { stage, reason } = req.body || {};
  const client = await pool.connect();

  try {
    if (!['DESIGN', 'QUAL', 'VALIDATED'].includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const role = req.headers['x-user-role'] || 'QA';
    const signer = req.headers['x-user-name'] || req.headers['x-user-email'] || 'Unknown';

    await client.query(
      `INSERT INTO cmc_approvals (process_id, stage, action, signer_name, signer_role, reason) 
       VALUES ($1, $2, 'stage_change', $3, $4, $5)`,
      [id, stage, signer, role, reason || null]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Error recording approval:', error);
    res.status(500).json({ error: 'Failed to record approval' });
  } finally {
    client.release();
  }
});

// === STEP 6: SOP upload per unit op ===

// SOP upload per unit op
router.post('/units/:unitId/sop/upload', upload.single('file'), async (req, res) => {
  const { unitId } = req.params;
  const title = req.body?.title || '';
  if (!req.file) return res.status(400).json({ error: 'file missing' });

  const dir = '/tmp/uploads';
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });

  const fname = `${unitId}_${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
  const fpath = `${dir}/${fname}`;
  require('fs').writeFileSync(fpath, req.file.buffer);
  const url = `/uploads/${fname}`;

  const client = await pool.connect();
  try {
    await client.query(`update cmc_unit_ops set sop_title=$1, sop_url=$2 where unit_id=$3`, [
      title || req.file.originalname,
      url,
      unitId,
    ]);
    res.json({ ok: true, sop_title: title || req.file.originalname, sop_url: url });
  } catch (error) {
    console.error('Error uploading SOP:', error);
    res.status(500).json({ error: 'Failed to upload SOP' });
  } finally {
    client.release();
  }
});

// === STEP 6: Impact graph (nodes + edges for visualization) ===

router.get('/processes/:id/impact/graph', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();

  try {
    const { rows: params } = await client.query(
      `select u.unit_id, u.name as unit_name, p.param_id, p.name, p.kind
       from cmc_parameters p join cmc_unit_ops u on p.unit_id=u.unit_id
       where u.process_id=$1`,
      [id]
    );

    const { rows: cs } = await client.query(
      `select controls_json from cmc_control_strategy where process_id=$1`,
      [id]
    );
    const control = cs[0]?.controls_json || {};

    const nodes = [];
    const edges = [];

    // CPP nodes
    params
      .filter(p => p.kind === 'CPP')
      .forEach((p, idx) => {
        nodes.push({ id: `CPP:${p.param_id}`, label: `CPP • ${p.name}`, type: 'cpp' });
        edges.push({
          id: `e_cpp_${idx}`,
          source: `UNIT:${p.unit_id}`,
          target: `CPP:${p.param_id}`,
        });
      });

    // Unit nodes
    const unitIds = Array.from(new Set(params.map(p => p.unit_id)));
    unitIds.forEach((uid, i) => {
      const name = params.find(p => p.unit_id === uid)?.unit_name || `Unit ${i + 1}`;
      nodes.push({ id: `UNIT:${uid}`, label: `Unit • ${name}`, type: 'unit' });
    });

    // DOC nodes (P.3.3 / P.3.4 / P.3.5)
    ['DOC:3.2.P.3.3', 'DOC:3.2.P.3.4', 'DOC:3.2.P.3.5'].forEach(idoc =>
      nodes.push({ id: idoc, label: idoc.replace('DOC:', 'Doc • '), type: 'doc' })
    );

    // Analytical & Regulatory service nodes
    nodes.push({ id: 'MOD:Analytical', label: 'Analytical', type: 'mod' });
    nodes.push({ id: 'MOD:Regulatory', label: 'Regulatory', type: 'mod' });

    // Link CPPs with or without IPC to modules/docs
    params
      .filter(p => p.kind === 'CPP')
      .forEach((p, i) => {
        const hasControl = !!control[p.name];
        edges.push({
          id: `e_cpp_doc_${i}`,
          source: `CPP:${p.param_id}`,
          target: 'DOC:3.2.P.3.4',
          style: hasControl ? 'ok' : 'warn',
        });
        if (!hasControl) {
          edges.push({
            id: `e_cpp_ana_${i}`,
            source: `CPP:${p.param_id}`,
            target: 'MOD:Analytical',
            style: 'warn',
          });
          edges.push({
            id: `e_cpp_reg_${i}`,
            source: `CPP:${p.param_id}`,
            target: 'MOD:Regulatory',
            style: 'warn',
          });
        }
      });

    res.json({ nodes, edges });
  } catch (error) {
    console.error('Error fetching impact graph:', error);
    res.status(500).json({ error: 'Failed to fetch impact graph' });
  } finally {
    client.release();
  }
});

// === STEP 6: DOE helpers (CSV template + adopt actuals) ===

// DOE template CSV (coded ±1)
router.get('/processes/:id/doe/template', async (req, res) => {
  const factors = (req.query.factors || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!factors.length) return res.status(400).json({ error: 'factors=FactorA,FactorB' });

  const k = factors.length,
    rows = [];
  const n = 1 << k;
  rows.push([...factors, 'y'].join(','));

  for (let i = 0; i < n; i++) {
    const coded = factors.map((_, j) => ((i >> j) & 1 ? 1 : -1));
    rows.push([...coded, ''].join(','));
  }

  const csv = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="doe_template_${Date.now()}.csv"`);
  res.send(csv);
});

// === STEP 6: Single-book Submission Builder (P.3 + PPQ + mini P.5) ===

router.post('/processes/:id/submission/build', async (req, res) => {
  const id = req.params.id;
  const fmt = req.query.fmt || 'pdf';

  const client = await pool.connect();
  try {
    const { rows: proc } = await client.query(
      `select name, product_id from cmc_processes where process_id=$1`,
      [id]
    );
    if (!proc[0]) return res.status(404).json({ error: 'Process not found' });
    const pName = proc[0].name;

    // Latest P.3 section (from your generate-docs)
    const titleLike = `P.3 Manufacturing Process — ${pName}`;
    const { rows: secRows } = await client.query(
      `select s.title, s.content_md from sections s join documents d on s.doc_id=d.doc_id 
       where d.product_id=$1 and d.title=$2 order by s.created_at desc limit 1`,
      [proc[0].product_id, titleLike]
    );
    if (!secRows[0]) return res.status(404).json({ error: 'Generate P.3 docs first' });

    // PPQ table
    const { rows: ppq } = await client.query(
      `select lot_no,run_date,result,coalesce(notes,'') as notes from cmc_ppq_lots where process_id=$1 order by run_date`,
      [id]
    );

    // Mini P.5 (pull validated methods as proxy for release tests)
    const { rows: methods } = await client.query(
      `select name,status from cmc_methods where product_id=$1 order by status desc, name asc`,
      [proc[0].product_id]
    );

    // Build HTML book
    function md2html(md) {
      return marked(md || '');
    }

    const cover = `
    <section>
      <h1>Submission Book</h1>
      <p><strong>Process:</strong> ${pName}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </section>`;

    const toc = `
    <section>
      <h2>Table of Contents</h2>
      <ol>
        <li>P.3 Manufacturing Process</li>
        <li>PPQ Summary</li>
        <li>P.5 Mini (Methods Overview)</li>
      </ol>
    </section>`;

    const p3Html = `<section><h2>P.3 Manufacturing Process</h2>${md2html(secRows[0].content_md)}</section>`;
    const ppqHtml = `<section><h2>PPQ Summary</h2>
      <table><thead><tr><th>Lot</th><th>Date</th><th>Result</th><th>Notes</th></tr></thead><tbody>
        ${ppq.map(r => `<tr><td>${r.lot_no}</td><td>${new Date(r.run_date).toISOString().slice(0, 10)}</td><td>${r.result}</td><td>${r.notes}</td></tr>`).join('')}
      </tbody></table>
    </section>`;

    const p5Html = `<section><h2>P.5 Mini — Methods Overview</h2>
      <table><thead><tr><th>Method</th><th>Status</th></tr></thead><tbody>
        ${methods.map(m => `<tr><td>${m.name}</td><td>${m.status}</td></tr>`).join('')}
      </tbody></table>
    </section>`;

    const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>
    body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;padding:24px}
    h1,h2{margin-top:0.2in}
    table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px}
    section{page-break-inside:avoid;margin-bottom:16px}
    </style></head><body>${cover}${toc}${p3Html}${ppqHtml}${p5Html}</body></html>`;

    if (fmt === 'pdf') {
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      });
      await browser.close();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="submission_book_${Date.now()}.pdf"`
      );
      return res.send(pdf);
    } else {
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const text = dom.window.document.body.textContent || '';
      const { Document, Packer, Paragraph, TextRun } = require('docx');
      const doc = new Document({
        sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }],
      });
      const buf = await Packer.toBuffer(doc);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="submission_book_${Date.now()}.docx"`
      );
      return res.send(buf);
    }
  } catch (error) {
    console.error('Error building submission:', error);
    res.status(500).json({ error: 'Failed to build submission' });
  } finally {
    client.release();
  }
});

// Add validation route
router.get('/processes/:id/validate', async (req, res) => {
  const processId = req.params.id;
  const client = await pool.connect();

  try {
    const issues = [];

    // Get parameters
    const { rows: params } = await client.query(
      `
      select u.name as unit, p.* 
      from cmc_parameters p 
      join cmc_unit_ops u on p.unit_id = u.unit_id
      where u.process_id = $1`,
      [processId]
    );

    // Get control strategy
    const { rows: cs } = await client.query(
      `
      select controls_json 
      from cmc_control_strategy 
      where process_id = $1`,
      [processId]
    );
    const control = cs[0]?.controls_json || {};

    // PROC-001: CPP must have IPC
    params
      .filter(p => p.kind === 'CPP')
      .forEach(p => {
        if (!control[p.name]) {
          issues.push({
            id: 'PROC-001',
            severity: 'ERROR',
            msg: `CPP ${p.name} missing IPC`,
          });
        }
      });

    // PROC-003: Design Space factors present if any CPPs exist
    const { rows: ds } = await client.query(
      `
      select factors_json 
      from cmc_design_space 
      where process_id = $1`,
      [processId]
    );
    if (params.some(p => p.kind === 'CPP') && (!ds[0] || (ds[0].factors_json || []).length === 0)) {
      issues.push({
        id: 'PROC-003',
        severity: 'WARNING',
        msg: 'CPPs exist but Design Space is empty',
      });
    }

    // PROC-004: PPQ ≥3 PASS if stage VALIDATED
    const { rows: s } = await client.query(
      `
      select stage 
      from cmc_processes 
      where process_id = $1`,
      [processId]
    );
    if (s[0]?.stage === 'VALIDATED') {
      const { rows: cnt } = await client.query(
        `
        select count(*)::int c 
        from cmc_ppq_lots 
        where process_id = $1 and result = 'PASS'`,
        [processId]
      );
      if ((cnt[0]?.c || 0) < 3) {
        issues.push({
          id: 'PROC-004',
          severity: 'ERROR',
          msg: 'VALIDATED requires ≥3 PASS PPQ lots',
        });
      }
    }

    res.json(issues);
  } catch (error) {
    console.error('Error validating process:', error);
    res.status(500).json({ error: 'Validation failed' });
  } finally {
    client.release();
  }
});

// ===== Additional AI suggest endpoint (alias for frontend) =====
router.post('/processes/:id/ai-suggest', async (req, res) => {
  const id = req.params.id;

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`select * from cmc_processes where process_id=$1`, [id]);
      if (!rows[0]) {
        return res.status(404).json({ error: 'Process not found' });
      }

      const suggestion = {
        id: `${Date.now()}`,
        type: 'CPP_optimization',
        description: 'AI suggests optimizing blend time based on powder characteristics',
        impact: 'Medium',
        confidence: 0.85,
        details:
          'Based on particle size data, reducing blend time to 12-15 minutes may improve content uniformity while maintaining adequate homogeneity.',
      };

      res.json({ suggestions: [suggestion] });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    res.status(500).json({ error: 'Failed to generate AI suggestions' });
  }
});

// ===== Generate P.3 docs endpoint =====
router.post('/processes/:id/generate-p3', async (req, res) => {
  const id = req.params.id;

  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`select * from cmc_processes where process_id=$1`, [id]);
      if (!rows[0]) {
        return res.status(404).json({ error: 'Process not found' });
      }

      const process = rows[0];

      // Generate P.3 document content based on process data
      const p3Content = {
        title: `P.3 Manufacturing Process and Controls - ${process.name}`,
        sections: {
          manufacturingProcess: `Manufacturing process for ${process.name} (${process.scope})`,
          controlStrategy: 'Critical process parameters and control strategy',
          processValidation: 'Process validation approach and lifecycle',
        },
      };

      res.json({
        success: true,
        content: p3Content,
        processId: id,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating P.3 docs:', error);
    res.status(500).json({ error: 'Failed to generate P.3 documentation' });
  }
});

export default router;
