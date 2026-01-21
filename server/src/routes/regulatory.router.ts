import { Router } from 'express';
import { getPool } from '../../db/pool';
import { gatherUpstream, computeLinks } from '../services/reg/upstream';
import { aiDraftSection } from '../services/ai/secDraft';
import { aiClassifyChange, aiExtractQuestions, aiDraftResponse } from '../services/ai/regulatory';
import { computeImpacts, buildChecklist } from '../services/reg/impact';
import {
  normalizeEmail,
  extractDueAndRegion,
  naiveSplitQuestions,
} from '../services/reg/emailParse';
import { gatherEvidence } from '../services/reg/evidence';
import { hashApproval } from '../services/reg/sign';
import { evalGatekeeperV2, applySafeFixes } from '../services/reg/gatekeeper';
import { computeRPI } from '../services/reg/rpi';
import { timelineRisk } from '../services/reg/timeline';
import { generateSlackDigest, generateCalendarEvent } from '../services/reg/digest';
import { runPreflight } from '../services/reg/preflight';
import { stageSequenceFiles } from '../services/reg/indexXml';
import { packageSequenceZip } from '../services/reg/packager';
import { loadPolicy, validatePolicy } from '../services/reg/policy';
import { gmailIngestToReg } from '../services/integrations/gmail';
import { pushCalendarForSubmission } from '../services/integrations/gcal';
import {
  generatePlaybook,
  acceptCard,
  snoozeCard,
  rejectCard,
  getPlaybookCards,
  simulateRPIGain,
} from '../services/reg/playbook';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import OpenAI from 'openai';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Database connection
const router = Router();

// Helper function for database queries
const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

// GET /api/reg/submissions/:id/m3 -> return sections & leaves for this submission
router.get('/submissions/:subId/m3', async (req, res) => {
  try {
    const subId = req.params.subId;
    const [sections, leaves] = await Promise.all([
      q<any>(`select * from reg_m3_sections where sub_id = $1 order by code`, [subId]),
      q<any>(
        `select l.*, s.code as section_code from reg_m3_leaves l 
              join reg_m3_sections s on s.sec_id = l.sec_id 
              where s.sub_id = $1 order by s.code, l.created_at`,
        [subId]
      ),
    ]);
    res.json({ sections: sections.rows, leaves: leaves.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/submissions/:id/seed-m3 -> create standard M3 sections
router.post('/submissions/:subId/seed-m3', async (req, res) => {
  try {
    const subId = req.params.subId;

    const standardSections = [
      {
        code: '3.2.P.3',
        title: 'Manufacture',
        guidance: 'Manufacturing process description and controls',
      },
      {
        code: '3.2.P.5',
        title: 'Control of Drug Product',
        guidance: 'Specifications and analytical procedures',
      },
      {
        code: '3.2.P.8',
        title: 'Stability',
        guidance: 'Stability data and shelf life justification',
      },
      {
        code: '3.2.S.4',
        title: 'Control of Drug Substance',
        guidance: 'Drug substance specifications',
      },
      {
        code: '3.2.S.7',
        title: 'Stability of Drug Substance',
        guidance: 'Drug substance stability data',
      },
    ];

    const created = [];
    for (const section of standardSections) {
      const existing = await q<any>(
        `select sec_id from reg_m3_sections where sub_id = $1 and code = $2`,
        [subId, section.code]
      );
      if (existing.rows.length === 0) {
        const result = await q<any>(
          `insert into reg_m3_sections (sub_id, code, title, guidance) values ($1, $2, $3, $4) returning *`,
          [subId, section.code, section.title, section.guidance]
        );
        created.push(result.rows[0]);
      }
    }

    res.json({ created: created.length, sections: created });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/sections/:secId/automap  -> creates reg_m3_links from upstream data
router.post('/sections/:secId/automap', async (req, res) => {
  try {
    const sid = req.params.secId;
    const sec = (
      await q<any>(
        `select s.*, sub.product_id from reg_m3_sections s join reg_submissions sub on sub.sub_id = s.sub_id where sec_id=$1`,
        [sid]
      )
    ).rows[0];

    if (!sec) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const up = await gatherUpstream(sec.product_id);
    const links = computeLinks(sec.code, up);

    for (const l of links) {
      await q(
        `insert into reg_m3_links (sec_id, kind, ref_id, meta_json) values ($1,$2,$3,$4) on conflict do nothing`,
        [sid, l.kind, l.ref_id, l.meta || {}]
      ).catch(() => {});
    }

    await q(
      `update reg_m3_sections set upstream_json=$2, status=case when status='MISSING' then 'DRAFT' else status end where sec_id=$1`,
      [sid, up]
    );

    await q(
      `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
             select sub_id, 'SECTION', $1, 'UPDATE', 'AI', $2, $3 from reg_m3_sections where sec_id=$1`,
      [sid, { automap: true, links }, (req.headers['x-user-name'] || 'user').toString()]
    );

    res.json({ created: links.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/sections/:secId/draft -> create AI suggestion (reg_m3_suggestions)
router.post('/sections/:secId/draft', async (req, res) => {
  try {
    const sid = req.params.secId;
    const sec = (
      await q<any>(
        `select s.*, sub.product_id from reg_m3_sections s join reg_submissions sub on sub.sub_id = s.sub_id where sec_id=$1`,
        [sid]
      )
    ).rows[0];

    if (!sec) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const up =
      sec.upstream_json && JSON.stringify(sec.upstream_json) !== '{}'
        ? sec.upstream_json
        : await gatherUpstream(sec.product_id);
    const sug = await aiDraftSection({ code: sec.code, title: sec.title }, up);

    const { rows } = await q<any>(
      `insert into reg_m3_suggestions (sec_id, title, draft_md, evidence) values ($1,$2,$3,$4) returning *`,
      [sid, sug.title, sug.draft_md, JSON.stringify(sug.evidence || [])]
    );

    await q(
      `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
             select sub_id, 'SECTION', $1, 'AI_RECOMMEND', 'AI', $2, $3 from reg_m3_sections where sec_id=$1`,
      [sid, { suggestion_id: rows[0].sug_id }, (req.headers['x-user-name'] || 'user').toString()]
    );

    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/suggestions/:sugId/accept  -> writes to leaf & tasks
router.post('/suggestions/:sugId/accept', async (req, res) => {
  try {
    const sg = req.params.sugId;
    const sug = (
      await q<any>(
        `select s.*, sec.sec_id, sec.sub_id, sec.code from reg_m3_suggestions s join reg_m3_sections sec on sec.sec_id=s.sec_id where s.sug_id=$1`,
        [sg]
      )
    ).rows[0];

    if (!sug) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    const { rows: leaf } = await q<any>(
      `insert into reg_m3_leaves (sec_id, title, href, source_type, tokens_json, status, evidence)
                                          values ($1, $2, null, 'AUTHORING', '{}','READY', $3) returning *`,
      [sug.sec_id, sug.title, sug.evidence || '[]']
    );

    await q(`update reg_m3_suggestions set status='APPLIED', applied_at=now() where sug_id=$1`, [
      sg,
    ]);
    await q(`update reg_m3_sections set status='READY' where sec_id=$1`, [sug.sec_id]);
    await q(
      `insert into reg_tasks (sub_id, entity, entity_id, title, priority, status)
             values ($1,'LEAF',$2,$3,'Medium','OPEN')`,
      [sug.sub_id, leaf[0].leaf_id, `Review ${sug.code} draft`]
    );

    await q(
      `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
             values ($1,'LEAF',$2,'CREATE','AI',$3,$4)`,
      [
        sug.sub_id,
        leaf[0].leaf_id,
        { from_suggestion: sg },
        (req.headers['x-user-name'] || 'user').toString(),
      ]
    );

    res.json({ leaf: leaf[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/suggestions/:sugId/reject
router.post('/suggestions/:sugId/reject', async (req, res) => {
  try {
    const sg = req.params.sugId;
    await q(`update reg_m3_suggestions set status='DISMISSED' where sug_id=$1`, [sg]);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reg/sections/:secId/suggestions
router.get('/sections/:secId/suggestions', async (req, res) => {
  try {
    const sid = req.params.secId;
    const { rows } = await q<any>(
      `select * from reg_m3_suggestions where sec_id=$1 order by created_at desc`,
      [sid]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reg/submissions/:id/tasks
router.get('/submissions/:subId/tasks', async (req, res) => {
  try {
    const subId = req.params.subId;
    const { rows } = await q<any>(
      `select * from reg_tasks where sub_id=$1 order by created_at desc`,
      [subId]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reg/tasks -> create new task
router.post('/tasks', async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await q<any>(
      `insert into reg_tasks (sub_id, entity, entity_id, title, description, assigned_to, due_date, priority, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN') returning *`,
      [
        b.sub_id || null,
        b.entity || 'GENERAL',
        b.entity_id || null,
        b.title,
        b.description || '',
        b.assigned_to || null,
        b.due_date || null,
        b.priority || 'Medium'
      ]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------- CHANGE CONTROL (Q12) ---------- */

// Create change
router.post('/changes', async (req, res) => {
  const b = req.body || {};
  const { rows } = await q<any>(
    `insert into reg_changes (product_id, title, change_json, status)
                                  values ($1,$2,$3,'DRAFT') returning *`,
    [b.product_id, b.title, b.change_json || {}]
  );
  await q(
    `insert into reg_change_events (change_id, event, by_user, payload_json) values ($1,'CREATED',$2,$3)`,
    [rows[0].change_id, (req.headers['x-user-name'] || 'user').toString(), rows[0]]
  );
  res.json(rows[0]);
});

// Classify change (AI)
router.post('/changes/:id/classify', async (req, res) => {
  const id = req.params.id;
  const ch = (await q<any>(`select * from reg_changes where change_id=$1`, [id])).rows[0];
  const regions = await aiClassifyChange({
    product_id: ch.product_id,
    change_json: ch.change_json,
  });
  const checklist = buildChecklist(regions);
  const { rows } = await q<any>(
    `update reg_changes set regions_json=$2, eta_weeks=$3, risk_score=$4, checklist_json=$5
                                  where change_id=$1 returning *`,
    [id, regions, checklist.eta_weeks, checklist.risk_score, checklist.items]
  );
  await q(
    `insert into reg_change_events (change_id, event, by_user, payload_json) values ($1,'CLASSIFIED',$2,$3)`,
    [id, (req.headers['x-user-name'] || 'user').toString(), regions]
  );
  res.json(rows[0]);
});

// Compute impacts
router.post('/changes/:id/impact', async (req, res) => {
  const id = req.params.id;
  const ch = (await q<any>(`select * from reg_changes where change_id=$1`, [id])).rows[0];
  const impacts = await computeImpacts(ch);
  await q(`delete from reg_change_impacts where change_id=$1`, [id]);
  for (const im of impacts) {
    await q(
      `insert into reg_change_impacts (change_id, sub_id, entity, entity_id, code, meta_json)
             values ($1,$2,$3,$4,$5,$6)`,
      [id, im.sub_id || null, im.entity, im.entity_id, im.code || null, im.meta || {}]
    ).catch(() => {});
  }
  const { rows } = await q<any>(
    `update reg_changes set impacted_json=$2 where change_id=$1 returning *`,
    [id, impacts]
  );
  await q(
    `insert into reg_change_events (change_id, event, by_user, payload_json) values ($1,'IMPACTED',$2,$3)`,
    [id, (req.headers['x-user-name'] || 'user').toString(), impacts]
  );
  res.json(rows[0]);
});

// Open tasks from checklist
router.post('/changes/:id/tasks', async (req, res) => {
  const id = req.params.id;
  const ch = (await q<any>(`select * from reg_changes where change_id=$1`, [id])).rows[0];
  const subs = (
    await q<any>(`select sub_id from reg_submissions where product_id=$1`, [ch.product_id])
  ).rows;
  const subId = subs[0]?.sub_id || null;
  let created = 0;
  for (const item of ch.checklist_json || []) {
    await q(
      `insert into reg_tasks (sub_id, entity, entity_id, title, priority, status, due_date)
             values ($1,'CHANGE',$2,$3,'High','OPEN', (now() + ($4 || 7) * interval '1 day')::date)`,
      [subId, ch.change_id, item.title, item.dueOffsetDays || 7]
    ).catch(() => {});
    created++;
  }
  await q(
    `insert into reg_change_events (change_id, event, by_user, payload_json) values ($1,'TASKS_OPENED',$2,$3)`,
    [id, (req.headers['x-user-name'] || 'user').toString(), { created }]
  );
  res.json({ created });
});

// List changes
router.get('/changes', async (req, res) => {
  const pid = req.query.productId as string | undefined;
  const sql = pid
    ? `select * from reg_changes where product_id=$1 order by created_at desc`
    : `select * from reg_changes order by created_at desc`;
  const { rows } = await q<any>(sql, pid ? [pid] : []);
  res.json(rows);
});

// Get change impacts
router.get('/changes/:id/impacts', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await q<any>(
      `select * from reg_change_impacts where change_id=$1 order by created_at`,
      [id]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get change events (timeline)
router.get('/changes/:id/events', async (req, res) => {
  try {
    const id = req.params.id;
    const { rows } = await q<any>(
      `select * from reg_change_events where change_id=$1 order by created_at`,
      [id]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Alias for POST /changes/:id/impact as /changes/:id/assess
router.post('/changes/:id/assess', async (req, res) => {
  const id = req.params.id;
  const ch = (await q<any>(`select * from reg_changes where change_id=$1`, [id])).rows[0];
  const impacts = await computeImpacts(ch);
  await q(`delete from reg_change_impacts where change_id=$1`, [id]);
  for (const im of impacts) {
    await q(
      `insert into reg_change_impacts (change_id, sub_id, entity, entity_id, code, meta_json)
             values ($1,$2,$3,$4,$5,$6)`,
      [id, im.sub_id || null, im.entity, im.entity_id, im.code || null, im.meta || {}]
    ).catch(() => {});
  }
  const { rows } = await q<any>(
    `update reg_changes set impacted_json=$2 where change_id=$1 returning *`,
    [id, impacts]
  );
  await q(
    `insert into reg_change_events (change_id, event, by_user, payload_json) values ($1,'IMPACTED',$2,$3)`,
    [id, (req.headers['x-user-name'] || 'user').toString(), impacts]
  );
  res.json(rows[0]);
});

/* ---------- QUESTIONS HUB (IR/DEFICIENCY) ---------- */

// POST /api/reg/submissions/:id/questions/ingest
// body: { subject, from, to, body, region? }  OR multipart with `file` (text/.eml/.txt)
router.post('/submissions/:id/questions/ingest', upload.single('file'), async (req, res) => {
  const subId = req.params.id;
  let subject = (req.body?.subject || '').toString();
  let from = (req.body?.from || '').toString();
  let to = (req.body?.to || '').toString();
  let raw = (req.body?.body || '').toString();

  if (req.file) {
    const text = req.file.buffer.toString('utf-8');
    raw = text;
    if (!subject) subject = (text.match(/^Subject:\s*(.*)$/im) || [])[1] || 'Agency Request';
    if (!from) from = (text.match(/^From:\s*(.*)$/im) || [])[1] || '';
    if (!to) to = (text.match(/^To:\s*(.*)$/im) || [])[1] || '';
  }

  const normalized = normalizeEmail(raw);
  const meta = extractDueAndRegion(normalized);
  const { rows: msg } = await q<any>(
    `insert into reg_messages (sub_id, subject, from_addr, to_addrs, raw_text, headers_json)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [subId, subject, from, to, normalized, { region: meta.region }]
  );

  // naive split + AI refine
  const naive = naiveSplitQuestions(normalized).map(t => ({ text: t }));
  const ai = await aiExtractQuestions(normalized, { region: meta.region, due: meta.due });

  let created = 0;
  for (const item of ai || naive) {
    await q(
      `insert into reg_questions (sub_id, source, source_msg_id, sec_code, text, due_date, severity, status, region, priority, section_suggest, extracted_due_src, created_by)
             values ($1,'AGENCY',$2,$3,$4,$5,coalesce($6,'MAJOR'),'OPEN',$7,'High',$3,$8,$9)`,
      [
        subId,
        msg[0].msg_id,
        item.section_suggest || null,
        item.text || '',
        item.due_date || null,
        item.severity || 'MAJOR',
        meta.region || null,
        meta.due || null,
        (req.headers['x-user-name'] || 'user').toString(),
      ]
    ).catch(() => {});
    created++;
  }

  await q(
    `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
           values ($1,'MESSAGE',$2,'CREATE','GMAIL',$3,$4)`,
    [
      subId,
      msg[0].msg_id,
      { subject, from, count: created },
      (req.headers['x-user-name'] || 'user').toString(),
    ]
  );

  res.json({ message: msg[0], created });
});

// GET /api/reg/submissions/:id/questions
router.get('/submissions/:id/questions', async (req, res) => {
  const id = req.params.id;
  const { rows } = await q<any>(
    `select q.*, m.subject as src_subject from reg_questions q 
                                 left join reg_messages m on m.msg_id=q.source_msg_id
                                 where q.sub_id=$1 order by q.created_at desc`,
    [id]
  );
  res.json(rows);
});

// POST /api/reg/questions/:id/draft -> AI response draft with evidence
router.post('/questions/:id/draft', async (req, res) => {
  const qid = req.params.id;
  const q_row = (await q<any>(`select * from reg_questions where q_id=$1`, [qid])).rows[0];
  if (!q_row) return res.status(404).json({ error: 'Question not found' });

  const evidence = await gatherEvidence(q_row.product_id || 'PROD-001', q_row.section_suggest);
  const tone = (req.body?.tone as 'FDA' | 'EMA' | 'Neutral') || 'Neutral';
  const draft = await aiDraftResponse(q_row.text, evidence, tone);

  const { rows } = await q<any>(
    `insert into reg_responses (q_id, content, status, style, region) 
                                 values ($1,$2,'DRAFT',$3,$4) returning *`,
    [qid, draft.md, tone, q_row.region]
  );
  res.json({ response: rows[0], evidence_used: draft.used });
});

// POST /api/reg/responses/:id/approve -> sign-off workflow
router.post('/responses/:id/approve', async (req, res) => {
  const rid = req.params.id;
  const approver = (req.headers['x-user-name'] || 'user').toString();
  const role = req.body?.role || 'Reg Lead';
  const resp_row = (await q<any>(`select * from reg_responses where resp_id=$1`, [rid])).rows[0];

  const hash = hashApproval({
    response_id: rid,
    content: resp_row.content,
    approver,
    timestamp: new Date(),
  });
  await q(
    `update reg_responses set approver=$2, approved_at=now(), sign_hash=$3, status='APPROVED' where resp_id=$1`,
    [rid, approver, hash]
  );
  await q(
    `insert into reg_signoffs (entity, entity_id, signer, role, hash) values ('RESPONSE',$1,$2,$3,$4)`,
    [rid, approver, role, hash]
  );

  res.json({ approved: true, hash });
});

/* ---------- GATEKEEPER V2 + RPI DASHBOARD ---------- */

// POST /api/reg/submissions/:id/gatekeeper/run -> evaluate submission readiness
router.post('/submissions/:id/gatekeeper/run', async (req, res) => {
  const subId = req.params.id;
  const actor = (req.headers['x-user-name'] || 'user').toString();

  const result = await evalGatekeeperV2(subId);

  // Save run to database
  await q(
    `insert into reg_gatekeeper_runs (sub_id, status, blockers, flags, inputs, created_by)
           values ($1,$2,$3,$4,$5,$6)`,
    [subId, result.status, result.blockers, result.flags, result.inputs, actor]
  );

  res.json(result);
});

// POST /api/reg/submissions/:id/gatekeeper/autofix -> apply safe fixes
router.post('/submissions/:id/gatekeeper/autofix', async (req, res) => {
  const subId = req.params.id;
  const actor = (req.headers['x-user-name'] || 'user').toString();
  const blockers = req.body?.blockers || [];

  const fixes = await applySafeFixes(subId, blockers, actor);
  res.json(fixes);
});

// GET /api/reg/submissions/:id/gatekeeper/history -> recent runs
router.get('/submissions/:id/gatekeeper/history', async (req, res) => {
  const subId = req.params.id;
  const { rows } = await q<any>(
    `select * from reg_gatekeeper_runs where sub_id=$1 order by created_at desc limit 10`,
    [subId]
  );
  res.json(rows);
});

// GET /api/reg/submissions/:id/rpi -> current RPI with components
router.get('/submissions/:id/rpi', async (req, res) => {
  const subId = req.params.id;
  const result = await computeRPI(subId);

  // Cache the result
  await q(
    `insert into reg_rpi_cache (sub_id, rpi, components) 
           values ($1,$2,$3)
           on conflict (sub_id, as_of_date) do update set rpi=$2, components=$3`,
    [subId, result.rpi, result.components]
  );

  res.json(result);
});

// GET /api/reg/submissions/:id/rpi/trend -> historical RPI trend
router.get('/submissions/:id/rpi/trend', async (req, res) => {
  const subId = req.params.id;
  const { rows } = await q<any>(
    `select as_of_date, rpi, components from reg_rpi_cache 
                                 where sub_id=$1 order by as_of_date desc limit 30`,
    [subId]
  );
  res.json(rows);
});

// GET /api/reg/submissions/:id/timeline-risk -> Monte Carlo timeline analysis
router.get('/submissions/:id/timeline-risk', async (req, res) => {
  const subId = req.params.id;
  const result = await timelineRisk(subId);
  res.json(result);
});

// POST /api/reg/submissions/:id/digest/slack -> generate Slack digest
router.post('/submissions/:id/digest/slack', async (req, res) => {
  const subId = req.params.id;
  const digest = await generateSlackDigest(subId);
  res.json(digest);
});

// GET /api/reg/submissions/:id/calendar -> generate calendar event ICS
router.get('/submissions/:id/calendar', async (req, res) => {
  const subId = req.params.id;
  const event = await generateCalendarEvent(subId);

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="regulatory-review-${subId}.ics"`);
  res.send(event.ics);
});

// GET /api/reg/submissions/:id/calendar/preview -> preview calendar event
router.get('/submissions/:id/calendar/preview', async (req, res) => {
  const subId = req.params.id;
  const event = await generateCalendarEvent(subId);
  res.json({ title: event.title, description: event.description });
});

/* ---------- eCTD PACKAGER (MODULE 3) ---------- */

// GET next sequence number for a submission
router.get('/submissions/:id/sequence/next', async (req, res) => {
  const id = req.params.id;
  const { rows } = await q<any>(
    `select coalesce(max(seq_no),0)+1 as next from reg_sequences where sub_id=(select sub_id from reg_submissions where sub_id=$1)`,
    [id]
  );
  res.json({ next: rows[0]?.next || 1 });
});

// POST create new sequence
router.post('/submissions/:id/sequences', async (req, res) => {
  const subId = req.params.id;
  const b = req.body || {};
  const nextNo =
    (
      await q<any>(`select coalesce(max(seq_no),0)+1 as next from reg_sequences where sub_id=$1`, [
        subId,
      ])
    ).rows[0]?.next || 1;

  const { rows } = await q<any>(
    `insert into reg_sequences (sub_id, seq_no, region, app_type, note)
                                 values ($1,$2,$3,$4,$5) returning *`,
    [subId, nextNo, b.region || 'FDA', b.app_type || 'NDA', b.note || '']
  );

  // Auto-stage files from current ready leaves
  await stageSequenceFiles(subId, rows[0].seq_id, b.region || 'FDA');

  await q(
    `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
           values ($1,'SEQUENCE',$2,'CREATE','USER',$3,$4)`,
    [
      subId,
      rows[0].seq_id,
      { seq_no: nextNo, region: b.region },
      (req.headers['x-user-name'] || 'user').toString(),
    ]
  );

  res.json(rows[0]);
});

// GET /api/reg/submissions/:id/sequences -> list sequences
router.get('/submissions/:id/sequences', async (req, res) => {
  const id = req.params.id;
  const { rows } = await q<any>(
    `select s.*, count(f.file_id) as file_count
                                 from reg_sequences s
                                 left join reg_sequence_files f on f.seq_id=s.seq_id
                                 where s.sub_id=$1
                                 group by s.seq_id order by s.seq_no desc`,
    [id]
  );
  res.json(rows);
});

// GET /api/reg/sequences/:id/files -> files in sequence
router.get('/sequences/:id/files', async (req, res) => {
  const id = req.params.id;
  const { rows } = await q<any>(
    `select f.*, l.title as leaf_title from reg_sequence_files f
                                 left join reg_m3_leaves l on l.leaf_id=f.leaf_id
                                 where f.seq_id=$1 order by f.path`,
    [id]
  );
  res.json(rows);
});

// POST /api/reg/sequences/:id/preflight -> run preflight checks
router.post('/sequences/:id/preflight', async (req, res) => {
  const seqId = req.params.id;
  const seq = (await q<any>(`select sub_id from reg_sequences where seq_id=$1`, [seqId])).rows[0];
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  const result = await runPreflight(seq.sub_id);

  // Save issues to database
  await q(`delete from reg_preflight_issues where seq_id=$1`, [seqId]);
  for (const issue of result.issues) {
    await q(
      `insert into reg_preflight_issues (seq_id, severity, code, message, meta_json)
             values ($1,$2,$3,$4,$5)`,
      [seqId, issue.severity, issue.code, issue.message, issue.meta || {}]
    );
  }

  res.json(result);
});

// POST /api/reg/sequences/:id/package -> build ZIP
router.post('/sequences/:id/package', async (req, res) => {
  const seqId = req.params.id;
  const seq = (await q<any>(`select * from reg_sequences where seq_id=$1`, [seqId])).rows[0];
  if (!seq) return res.status(404).json({ error: 'Sequence not found' });

  try {
    const zipPath = await packageSequenceZip(seqId, seq.region || 'FDA');
    const stats = fs.statSync(zipPath);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');

    await q(
      `update reg_sequences set package_path=$2, package_sha256=$3, built_at=now(), built_by=$4
             where seq_id=$1`,
      [seqId, zipPath, hash, (req.headers['x-user-name'] || 'user').toString()]
    );

    await q(
      `insert into reg_lineage (sub_id, entity, entity_id, action, source, payload_json, actor)
             values ($1,'SEQUENCE',$2,'PACKAGE','USER',$3,$4)`,
      [
        seq.sub_id,
        seqId,
        { path: zipPath, size: stats.size, hash },
        (req.headers['x-user-name'] || 'user').toString(),
      ]
    );

    res.json({
      zipPath: zipPath.replace(process.cwd(), ''),
      size: stats.size,
      hash,
      seq_no: String(seq.seq_no).padStart(4, '0'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reg/sequences/:id/download -> download ZIP
router.get('/sequences/:id/download', async (req, res) => {
  const seqId = req.params.id;
  const seq = (await q<any>(`select * from reg_sequences where seq_id=$1`, [seqId])).rows[0];
  if (!seq?.package_path) return res.status(404).json({ error: 'Package not found' });

  if (!fs.existsSync(seq.package_path)) {
    return res.status(404).json({ error: 'ZIP file not found on disk' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="seq-${String(seq.seq_no).padStart(4, '0')}.zip"`
  );

  const stream = fs.createReadStream(seq.package_path);
  stream.pipe(res);
});

// POST /api/reg/sequences/:id/acks -> record ACK
router.post('/sequences/:id/acks', async (req, res) => {
  const seqId = req.params.id;
  const b = req.body || {};

  const { rows } = await q<any>(
    `insert into reg_sequence_acks (seq_id, kind, status, payload_json)
                                 values ($1,$2,$3,$4) returning *`,
    [seqId, b.kind || 'ACK1', b.status || 'RECEIVED', b.payload || {}]
  );
  res.json(rows[0]);
});

// GET /api/reg/sequences/:id/acks -> list ACKs
router.get('/sequences/:id/acks', async (req, res) => {
  const seqId = req.params.id;
  const { rows } = await q<any>(
    `select * from reg_sequence_acks where seq_id=$1 order by created_at desc`,
    [seqId]
  );
  res.json(rows);
});

/* ---------- POLICY ENGINE (Regional Rule Packs) - STEP 10 ---------- */

// GET active rules for region
router.get('/policy/:region', async (req, res) => {
  try {
    const policy = await loadPolicy(req.params.region);
    res.json(policy);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST draft ruleset (validate then store, inactive)
router.post('/policy/:region/draft', async (req, res) => {
  try {
    const region = (req.params.region || 'FDA').toUpperCase();
    const body = req.body || {};
    const v = await validatePolicy(body);
    if (!v.ok) return res.status(400).json({ error: 'Validation failed', details: v.errors });
    const version = (body?.meta?.version || new Date().toISOString().slice(0, 10)).toString();
    const { rows } = await q<any>(
      `insert into reg_rulesets (region, version, rules_json, is_active, notes, created_by)
                                    values ($1,$2,$3,false,$4,$5) returning *`,
      [
        region,
        version,
        body,
        body?.meta?.source || 'UI',
        (req.headers['x-user-name'] || 'user').toString(),
      ]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST activate a version (deactivate previous)
router.post('/policy/:region/activate', async (req, res) => {
  try {
    const region = (req.params.region || 'FDA').toUpperCase();
    const version = (req.body?.version || '').toString();
    const one = (
      await q<any>(`select * from reg_rulesets where region=$1 and version=$2`, [region, version])
    ).rows[0];
    if (!one) return res.status(404).json({ error: 'Version not found' });
    await q(`update reg_rulesets set is_active=false where region=$1`, [region]);
    await q(`update reg_rulesets set is_active=true where ruleset_id=$1`, [one.ruleset_id]);
    res.json({ ok: true, active: one.version });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET list versions for a region
router.get('/policy/:region/versions', async (req, res) => {
  try {
    const { rows } = await q<any>(
      `select region, version, is_active, created_at, notes from reg_rulesets where region=$1 order by created_at desc`,
      [(req.params.region || 'FDA').toUpperCase()]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET policy system health for a region
router.get('/policy/health', async (req, res) => {
  try {
    const region = (req.query.region || 'FDA').toString().toUpperCase();
    const policy = await loadPolicy(region);
    const { rows } = await q<any>(
      `select version, created_at from reg_rulesets where region=$1 and is_active=true order by created_at desc limit 1`,
      [region]
    );
    const active = rows[0] || null;
    const lastSync = active?.created_at ? new Date(active.created_at).toISOString() : null;
    const daysOld = active?.created_at
      ? Math.max(0, (Date.now() - new Date(active.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const status = !active ? 'error' : daysOld > 180 ? 'error' : daysOld > 90 ? 'warning' : 'healthy';
    const issues = status === 'error' ? 2 : status === 'warning' ? 1 : 0;
    const aiHealthScore = !active ? 0 : Math.max(60, Math.round(100 - (daysOld || 0) * 0.4));

    const systems = [
      'Gatekeeper v2',
      'M3 Builder',
      'Q12 Changes',
      'Questions Hub',
      'eCTD Packager',
      'RPI Dashboard',
    ].map(system => ({
      system,
      status,
      policy_version: policy?.meta?.version || active?.version || 'unknown',
      last_sync: lastSync,
      issues,
      ai_health_score: aiHealthScore,
    }));

    res.json({ region, systems });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load policy health' });
  }
});

// GET policy metrics for a region
router.get('/policy/metrics', async (req, res) => {
  try {
    const region = (req.query.region || 'FDA').toString().toUpperCase();
    const policy = await loadPolicy(region);

    const totalSubsResult = await q<any>(
      `select count(*)::int as total from reg_submissions where region=$1`,
      [region]
    );
    const totalSubs = totalSubsResult.rows[0]?.total || 0;

    const activeSubsResult = await q<any>(
      `select count(*)::int as total from reg_submissions where region=$1 and status not in ('COMPLETED','ARCHIVED','CANCELLED')`,
      [region]
    );
    const activeSubs = activeSubsResult.rows[0]?.total || 0;

    const pendingReviewsResult = await q<any>(
      `select count(*)::int as total from reg_submissions where region=$1 and status in ('IN_REVIEW','PENDING_REVIEW','REVIEW')`,
      [region]
    );
    const pendingReviews = pendingReviewsResult.rows[0]?.total || 0;

    const criticalIssuesResult = await q<any>(
      `select count(distinct s.sub_id)::int as total
       from reg_sequences s
       join reg_preflight_issues i on i.seq_id = s.seq_id
       join reg_submissions sub on sub.sub_id = s.sub_id
       where sub.region=$1 and i.severity='CRITICAL'`,
      [region]
    );
    const criticalSubs = criticalIssuesResult.rows[0]?.total || 0;
    const complianceScore = totalSubs
      ? Math.round(((totalSubs - criticalSubs) / totalSubs) * 1000) / 10
      : null;

    let coveragePercentage: number | null = null;
    const requiredSections = policy?.module3?.requiredSections || [];
    if (totalSubs > 0 && requiredSections.length > 0) {
      const sectionsResult = await q<any>(
        `select s.sub_id, sec.code
         from reg_m3_sections sec
         join reg_submissions s on s.sub_id = sec.sub_id
         where s.region=$1`,
        [region]
      );

      const bySub = new Map<string, Set<string>>();
      for (const row of sectionsResult.rows) {
        if (!bySub.has(row.sub_id)) bySub.set(row.sub_id, new Set());
        bySub.get(row.sub_id)?.add(row.code);
      }

      let totalCoverage = 0;
      for (const [subId, codes] of bySub.entries()) {
        const present = requiredSections.filter((req: string) =>
          Array.from(codes).some(code => code.startsWith(req))
        );
        totalCoverage += present.length / requiredSections.length;
      }

      coveragePercentage = bySub.size
        ? Math.round((totalCoverage / bySub.size) * 1000) / 10
        : null;
    }

    const { rows } = await q<any>(
      `select version, created_at from reg_rulesets where region=$1 and is_active=true order by created_at desc limit 1`,
      [region]
    );

    res.json({
      region,
      compliance_score: complianceScore,
      coverage_percentage: coveragePercentage,
      last_updated: rows[0]?.created_at || null,
      active_submissions: activeSubs,
      pending_reviews: pendingReviews,
      ai_optimization_score: null,
      predictive_accuracy: null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load policy metrics' });
  }
});

// GET AI policy recommendations for a region
router.get('/policy/recommendations', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI provider not configured' });
    }

    const region = (req.query.region || 'FDA').toString().toUpperCase();
    const policy = await loadPolicy(region);

    const prompt = `You are a regulatory policy expert. Review the following policy JSON and propose up to 5 concrete recommendations to improve compliance, efficiency, and clarity. Return JSON with array "recommendations" of objects with fields: id, type (optimization|compliance|risk|efficiency), title, description, impact (high|medium|low), confidence (0-100), action, estimated_savings. Policy JSON:\n${JSON.stringify(policy)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a senior regulatory policy advisor.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    res.json({ region, recommendations: parsed.recommendations || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate recommendations' });
  }
});

// POST AI policy assistant query
router.post('/policy/assistant', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI provider not configured' });
    }
    const region = (req.body?.region || 'FDA').toString().toUpperCase();
    const query = (req.body?.query || '').toString().trim();
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const policy = await loadPolicy(region);
    const prompt = `You are a regulatory policy advisor. Use the policy JSON below to answer the question precisely and cite relevant sections of the policy when possible.\n\nPolicy JSON:\n${JSON.stringify(policy)}\n\nQuestion: ${query}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Answer clearly and concisely with regulatory rigor.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    });

    res.json({
      region,
      response: completion.choices[0]?.message?.content || 'No response generated.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process policy query' });
  }
});

// POST validate active policy integrity
router.post('/policy/validate', async (req, res) => {
  try {
    const region = (req.body?.region || 'FDA').toString().toUpperCase();
    const policy = await loadPolicy(region);
    const result = await validatePolicy(policy);
    res.json({ region, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Policy validation failed' });
  }
});

// POST simulate policy impact for a region
router.post('/policy/simulate', async (req, res) => {
  try {
    const region = (req.body?.region || 'FDA').toString().toUpperCase();
    const policy = await loadPolicy(region);

    const totalSubsResult = await q<any>(
      `select count(*)::int as total from reg_submissions where region=$1`,
      [region]
    );
    const totalSubs = totalSubsResult.rows[0]?.total || 0;

    const criticalIssuesResult = await q<any>(
      `select count(distinct s.sub_id)::int as total
       from reg_sequences s
       join reg_preflight_issues i on i.seq_id = s.seq_id
       join reg_submissions sub on sub.sub_id = s.sub_id
       where sub.region=$1 and i.severity='CRITICAL'`,
      [region]
    );
    const criticalSubs = criticalIssuesResult.rows[0]?.total || 0;
    const complianceScore = totalSubs
      ? Math.round(((totalSubs - criticalSubs) / totalSubs) * 1000) / 10
      : null;

    res.json({
      region,
      affected_submissions: totalSubs,
      compliance_improvement: null,
      estimated_time_savings: null,
      risk_reduction: policy?.module3?.stability?.requireAccelerated ? 'Medium' : 'Low',
      systems_impacted: ['Gatekeeper v2', 'M3 Builder', 'Q12 Changes'],
      recommendations: complianceScore === null
        ? ['Insufficient submission data to simulate impact.']
        : [`Current compliance score is ${complianceScore}%. Review critical preflight issues to improve.`],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Policy simulation failed' });
  }
});

// POST apply AI recommendation (auditable change request)
router.post('/policy/recommendations/apply', async (req, res) => {
  try {
    const region = (req.body?.region || 'FDA').toString().toUpperCase();
    const recommendation = req.body?.recommendation;
    if (!recommendation) return res.status(400).json({ error: 'Recommendation is required' });

    await q(`
      CREATE TABLE IF NOT EXISTS reg_policy_actions (
        action_id SERIAL PRIMARY KEY,
        region TEXT NOT NULL,
        action_type TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const actor = (req.headers['x-user-name'] || req.headers['x-user'] || 'user').toString();
    const { rows } = await q<any>(
      `insert into reg_policy_actions (region, action_type, payload_json, created_by)
       values ($1, $2, $3, $4) returning action_id, created_at`,
      [region, 'AI_RECOMMENDATION_APPLY', recommendation, actor]
    );

    res.json({ success: true, action: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to apply recommendation' });
  }
});

// POST evaluate policy impact for a submission (returns derived thresholds & checks)
router.post('/policy/evaluate', async (req, res) => {
  try {
    const { subId } = req.body || {};
    const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    const policy = await loadPolicy(sub.region || 'FDA');

    // Derive thresholds
    const stabTarget = policy.module3?.stability?.minCoverageMonths || 12;
    const requireAcc = !!policy.module3?.stability?.requireAccelerated;
    const reqSections = policy.module3?.requiredSections || [];

    // Current facts
    const secs = (
      await q<any>(`select code,status,upstream_json from reg_m3_sections where sub_id=$1`, [subId])
    ).rows;
    const missing = reqSections.filter((c: string) => !secs.some((s: any) => s.code.startsWith(c)));
    const p8 = secs.find((s: any) => s.code.startsWith('3.2.P.8'));
    const cov = p8?.upstream_json?.stability?.coverage_months || 0;
    const acc = p8?.upstream_json?.stability?.has_accelerated || false;

    const checks = [];
    if (missing.length)
      checks.push({
        severity: 'CRITICAL',
        code: 'REQ_SECTIONS_MISSING',
        message: `Missing required sections: ${missing.join(', ')}`,
      });
    if (cov < stabTarget)
      checks.push({
        severity: 'WARN',
        code: 'STABILITY_COVERAGE',
        message: `Coverage ${cov}m < target ${stabTarget}m`,
      });
    if (requireAcc && !acc)
      checks.push({
        severity: 'WARN',
        code: 'ACCEL_REQUIRED',
        message: `Accelerated data required by policy but not detected`,
      });

    res.json({ policy, derived: { stabTarget, requireAcc, reqSections }, checks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/* ---------- INTEGRATIONS: Gmail / GCal ---------- */

// POST: Run Gmail ingest now
router.post('/integrations/gmail/ingest', async (req, res) => {
  try {
    const out = await gmailIngestToReg();
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gmail ingest failed' });
  }
});

// GET: Ingest ledger (recent)
router.get('/integrations/gmail/ingest/recent', async (req, res) => {
  const { rows } = await q<any>(`SELECT * FROM reg_mail_ingest ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
});

// POST: Push calendar for a submission
// body: { subId }
router.post('/integrations/gcal/push', async (req, res) => {
  try {
    const subId = (req.body?.subId || '').toString();
    if (!subId) return res.status(400).json({ error: 'subId required' });
    const out = await pushCalendarForSubmission(subId);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Calendar push failed' });
  }
});

/* ---------- EXECUTIVE PLAYBOOK: AI-powered Top 5 Moves ---------- */

// GET: Generate playbook cards for submission
router.get('/playbook/:subId/generate', async (req, res) => {
  try {
    const subId = req.params.subId;
    const actor = (req.headers['x-user'] as string) || 'system';
    const cards = await generatePlaybook(subId, actor);
    res.json({ cards, generated: cards.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Playbook generation failed' });
  }
});

// GET: Get playbook cards for submission
router.get('/playbook/:subId/cards', async (req, res) => {
  try {
    const subId = req.params.subId;
    const includeExpired = req.query.includeExpired === 'true';
    const cards = await getPlaybookCards(subId, includeExpired);
    res.json(cards);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load playbook cards' });
  }
});

// POST: Accept a playbook card
router.post('/playbook/cards/:cardId/accept', async (req, res) => {
  try {
    const cardId = req.params.cardId;
    const actor = (req.headers['x-user'] as string) || req.body.actor || 'user';
    const result = await acceptCard(cardId, actor);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to accept card' });
  }
});

// POST: Snooze a playbook card
router.post('/playbook/cards/:cardId/snooze', async (req, res) => {
  try {
    const cardId = req.params.cardId;
    const { until, reason } = req.body;
    const actor = (req.headers['x-user'] as string) || req.body.actor || 'user';

    if (!until) return res.status(400).json({ error: 'snooze_until date required' });

    const result = await snoozeCard(cardId, until, actor, reason);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to snooze card' });
  }
});

// POST: Reject a playbook card
router.post('/playbook/cards/:cardId/reject', async (req, res) => {
  try {
    const cardId = req.params.cardId;
    const { reason } = req.body;
    const actor = (req.headers['x-user'] as string) || req.body.actor || 'user';

    const result = await rejectCard(cardId, actor, reason);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to reject card' });
  }
});

// POST: Simulate RPI gain from accepting cards
router.post('/playbook/simulate', async (req, res) => {
  try {
    const { subId, cardIds } = req.body;

    if (!subId || !Array.isArray(cardIds)) {
      return res.status(400).json({ error: 'subId and cardIds array required' });
    }

    const simulation = await simulateRPIGain(subId, cardIds);
    res.json(simulation);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'RPI simulation failed' });
  }
});

// POST /api/reg/submissions -> create new submission
router.post('/submissions', async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await q<any>(
      `insert into reg_submissions (product_id, sub_type, region, status, title, description, target_date)
       values ($1, $2, $3, 'DRAFT', $4, $5, $6) returning *`,
      [
        b.product_id,
        b.sub_type || 'IND',
        b.region || 'FDA',
        b.title || `${b.sub_type || 'IND'} Submission`,
        b.description || '',
        b.target_date || null
      ]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reg/submissions -> return all submissions
router.get('/submissions', async (req, res) => {
  try {
    const submissions = await q<any>(`
      SELECT sub_id, product_id, sub_type, region, status, title, 
             description, target_date, created_at, updated_at
      FROM reg_submissions 
      ORDER BY created_at DESC
    `);
    res.json(submissions.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CMC PORTFOLIO ENDPOINTS ====================

// GET /api/cmc/blueprint/portfolio/overview -> return portfolio overview data
router.get('/cmc/blueprint/portfolio/overview', async (req, res) => {
  try {
    const submissions = await q<any>(`
      SELECT 
        s.sub_id,
        s.product_id,
        s.region,
        COALESCE(rpi.rpi, 0) as rpi,
        0 as ir_open,
        0 as ir_overdue,
        0 as obligations_open,
        0 as obligations_overdue,
        0 as stability_cov_m,
        0 as m3_missing,
        0 as preflight_critical,
        0 as qc_alerts,
        0 as playbook_open
      FROM reg_submissions s
      LEFT JOIN reg_rpi_cache rpi ON rpi.sub_id = s.sub_id
      ORDER BY s.created_at DESC
    `);
    res.json(submissions.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/cmc/blueprint/portfolio/snapshot/save -> save RPI snapshots
router.post('/cmc/blueprint/portfolio/snapshot/save', async (req, res) => {
  try {
    const submissions = await q<any>(`SELECT sub_id FROM reg_submissions`);

    for (const sub of submissions.rows) {
      // Get current RPI for this submission
      const rpiResult = await computeRPI(sub.sub_id);

      // Save snapshot
      await q(
        `
        INSERT INTO reg_rpi_snapshots (sub_id, rpi, components, created_at)
        VALUES ($1, $2, $3, NOW())
      `,
        [sub.sub_id, rpiResult.rpi, rpiResult.components]
      );
    }

    res.json({ success: true, snapshots: submissions.rows.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/cmc/blueprint/portfolio/export.csv -> export portfolio as CSV
router.get('/cmc/blueprint/portfolio/export.csv', async (req, res) => {
  try {
    const data = await q<any>(`
      SELECT 
        s.product_id,
        s.region,
        s.status,
        COALESCE(rpi.rpi, 0) as rpi,
        s.created_at
      FROM reg_submissions s
      LEFT JOIN reg_rpi_cache rpi ON rpi.sub_id = s.sub_id
      ORDER BY s.created_at DESC
    `);

    const csv = [
      'Product ID,Region,Status,RPI,Created At',
      ...data.rows.map(
        row => `${row.product_id},${row.region},${row.status},${row.rpi},${row.created_at}`
      ),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio-export.csv"');
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
