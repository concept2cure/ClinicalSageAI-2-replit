import express from 'express';
import pg from 'pg';

const router = express.Router();
const PROD = 'DP-001'; // replace if dynamic product selection exists

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const q = async (text, params = []) => {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

// ===== create draft =====
router.post('/drafts', async (req, res) => {
  const { name, scope } = req.body || {};
  if (!name || !['DS', 'DP'].includes(scope)) {
    return res.status(400).json({ error: 'name and scope (DS/DP) required' });
  }

  const maker = req.headers['x-user-id'] || null;
  const owner = req.headers['x-user-id'] || null;

  try {
    const { rows } = await q(
      `insert into cmc_process_drafts (product_id,name,scope,status,created_by,owner_user_id)
       values ($1,$2,$3,'DRAFT',$4,$5) returning draft_id`,
      [PROD, name.trim(), scope, maker, owner]
    );
    res.json(rows[0]); // { draft_id }
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// ===== save step (autosave friendly) =====
router.post('/drafts/save', async (req, res) => {
  const { draft_id, step, state } = req.body || {};

  if (!draft_id || !step || state === undefined) {
    return res.status(400).json({ error: 'draft_id, step, and state required' });
  }

  const columnMap = {
    OVERVIEW: 'overview_json',
    CQAS: 'cqas_json',
    FLOW: 'units_json',
    CONTROL: 'control_strategy_json',
    DESIGN_SPACE: 'design_space_json',
    VALIDATION: 'validation_plan_json',
    TEAM: 'team_json',
  };

  const col = columnMap[step];
  if (!col) {
    return res.status(400).json({ error: 'invalid step' });
  }

  try {
    await q(
      `update cmc_process_drafts set ${col}=$2, status='IN_PROGRESS', updated_at=now() where draft_id=$1`,
      [draft_id, state]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving step:', error);
    res.status(500).json({ error: 'Failed to save step' });
  }
});

// List drafts (created-by / owned-by / assigned-to me)
// Works with either UUID user ids or string ids passed in x-user-id.
// If no x-user-id is present, returns my own plus ones I can see (or all, if you prefer).
router.get('/drafts', async (req, res) => {
  // Accept any header value and treat it as TEXT for comparisons
  // (created_by / owner_user_id / assignments.user_id are UUID in DB)
  const me = (req.headers['x-user-id'] || '').toString(); // e.g., "test-user-123" or UUID

  try {
    const sql = `
      select
        d.draft_id, d.name, d.scope, d.status, d.updated_at,
        coalesce(
          json_agg(a.*) filter (where a.assignment_id is not null),
          '[]'::json
        ) as assignments
      from cmc_process_drafts d
      left join cmc_assignments a
        on a.draft_id = d.draft_id
      where d.product_id = $1
        and (
          $2 = '' -- no user filter provided: show all drafts for this product (or change to 'false' to hide)
          or d.created_by::text     = $2
          or d.owner_user_id::text  = $2
          or exists (
               select 1
               from cmc_assignments ax
               where ax.draft_id = d.draft_id
                 and ax.user_id::text = $2
             )
        )
      group by d.draft_id
      order by d.updated_at desc
    `;

    const { rows } = await q(sql, [PROD, me]); // $1 = product, $2 = user id as TEXT
    res.json(rows);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// ===== get single draft =====
router.get('/drafts/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const { rows } = await q(`select * from cmc_process_drafts where draft_id=$1`, [id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

// ===== assign people to draft =====
router.post('/drafts/assign', async (req, res) => {
  const { draft_id, assignments } = req.body || {};

  if (!draft_id || !Array.isArray(assignments)) {
    return res.status(400).json({ error: 'draft_id and assignments array required' });
  }

  try {
    for (const a of assignments) {
      await q(`insert into cmc_assignments (draft_id,user_id,role,due_date) values ($1,$2,$3,$4)`, [
        draft_id,
        a.user_id,
        a.role,
        a.due_date || null,
      ]);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error assigning:', error);
    res.status(500).json({ error: 'Failed to assign' });
  }
});

// ===== AI bootstrap: suggest initial flow/CPP/IPC from overview + CQAs =====
router.post('/drafts/:id/ai/bootstrap', async (req, res) => {
  const id = req.params.id;

  try {
    // gather context
    const { rows: d } = await q(
      `select overview_json, cqas_json from cmc_process_drafts where draft_id=$1`,
      [id]
    );
    if (!d[0]) return res.status(404).json({ error: 'not found' });

    const input = { overview: d[0].overview_json, cqas: d[0].cqas_json };

    // try real OpenAI if configured, else deterministic stub
    let sugg = null;
    try {
      if (process.env.OPENAI_API_KEY) {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const prompt = `Given overview and CQAs, propose an initial DP process flow, unit ops, and any CPP/IPC pairs. Return JSON { units:[{name,type,parameters:[{name,kind,target,low,high,unit}]}], control:{paramName:{test,limit,methodHint}} }`;
        const out = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify(input) },
          ],
        });
        const text = out.choices[0]?.message?.content || '{}';
        sugg = JSON.parse(text);
      }
    } catch (aiError) {
      console.log('AI bootstrap failed, using fallback:', aiError.message);
    }

    if (!sugg) {
      // fallback stub
      sugg = {
        units: [
          {
            name: 'Blend',
            type: 'Blender',
            parameters: [
              { name: 'Blend Time', kind: 'KPP', target: '15', low: '12', high: '18', unit: 'min' },
            ],
          },
          {
            name: 'Granulate',
            type: 'HighShearGran',
            parameters: [{ name: 'Granulation Endpoint', kind: 'KPP', target: 'xxx' }],
          },
          {
            name: 'Dry',
            type: 'FluidBedDryer',
            parameters: [
              { name: 'Inlet Temp', kind: 'CPP', target: '55', low: '50', high: '60', unit: '°C' },
            ],
          },
        ],
        control: {
          'Inlet Temp': { test: 'Loss on Drying', limit: '≤ 3.0%', methodHint: 'AM-001' },
        },
      };
    }

    // write into draft & lineage
    await q(
      `update cmc_process_drafts set units_json=$2, control_strategy_json=$3, updated_at=now()
             where draft_id=$1`,
      [id, JSON.stringify(sugg.units), JSON.stringify(sugg.control)]
    );
    await q(
      `insert into cmc_lineage (src_type,src_id,dst_type,dst_id,action,payload_json)
             values ('AI',$1,'DRAFT',$1,'accepted_ai',$2)`,
      [id, JSON.stringify(sugg)]
    );

    res.json({ ok: true, suggestion: sugg });
  } catch (error) {
    console.error('Error in AI bootstrap:', error);
    res.status(500).json({ error: 'AI bootstrap failed' });
  }
});

// ===== finalize: convert draft -> real process =====
router.post('/drafts/:id/finalize', async (req, res) => {
  const id = req.params.id;

  try {
    // fetch draft
    const { rows: d } = await q(`select * from cmc_process_drafts where draft_id=$1`, [id]);
    if (!d[0]) return res.status(404).json({ error: 'not found' });
    const dr = d[0];

    // create process
    const { rows: p } = await q(
      `insert into cmc_processes (product_id,name,scope,stage,owner)
       values ($1,$2,$3,'DESIGN','Process Eng') returning process_id`,
      [dr.product_id, dr.name, dr.scope]
    );
    const pid = p[0].process_id;

    // copy units & parameters
    const units = dr.units_json || [];
    for (const u of units) {
      const { rows: nu } = await q(
        `insert into cmc_unit_ops (process_id,name,type,sequence_no,pos_x,pos_y)
         values ($1,$2,$3,$4,$5,$6) returning unit_id`,
        [pid, u.name, u.type, u.sequence_no || 1, u.pos?.x || null, u.pos?.y || null]
      );
      const uid = nu[0].unit_id;

      for (const par of u.parameters || []) {
        await q(
          `insert into cmc_parameters (unit_id,name,kind,target,low,high,unit,rationale)
                 values ($1,$2,$3,$4,$5,$6,$7,$8)
                 on conflict (unit_id,lower(name)) do nothing`,
          [
            uid,
            par.name,
            par.kind || 'KPP',
            par.target || null,
            par.low || null,
            par.high || null,
            par.unit || null,
            par.rationale || null,
          ]
        );
        await q(
          `insert into cmc_lineage (src_type,src_id,dst_type,dst_id,action,payload_json)
                 values ('DRAFT',$1,'PARAM',$2,'created',jsonb_build_object('name',$3))`,
          [id, uid, par.name]
        );
      }
    }

    // control strategy
    await q(
      `insert into cmc_control_strategy (process_id,controls_json)
       values ($1,$2) on conflict (process_id) do update set controls_json=$2`,
      [pid, dr.control_strategy_json || {}]
    );

    // mark draft ready
    await q(`update cmc_process_drafts set status='READY' where draft_id=$1`, [id]);

    res.json({ process_id: pid });
  } catch (error) {
    console.error('Error finalizing draft:', error);
    res.status(500).json({ error: 'Failed to finalize draft' });
  }
});

export default router;
