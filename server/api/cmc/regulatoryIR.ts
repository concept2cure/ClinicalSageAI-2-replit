import type { Request, Response, Router as RouterT } from 'express';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { getPool } from '../../db';

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

import { aiDraftIR } from './regulatory_aiDraft'; // created below
import { buildIRPackageZip } from './regulatory_irPackager'; // created below

const router: RouterT = express.Router();

/* -------- QUESTIONS / IR -------- */

// List
router.get('/submissions/:id/questions', async (req: Request, res: Response) => {
  try {
    const { rows } = await q(
      `select * from reg_questions where sub_id=$1
       order by case status when 'OPEN' then 0 when 'IN_REVIEW' then 1 when 'DRAFTED' then 2 when 'CLOSED' then 9 else 5 end,
                due_date nulls last`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create
router.post('/submissions/:id/questions', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const subId = req.params.id;
    const { rows } = await q(
      `insert into reg_questions (sub_id, sec_code, title, question_text, text, status, due_date, priority)
       values ($1,$2,$3,$4,$4,'OPEN',$5,coalesce($6,'High')) returning *`,
      [
        subId,
        b.sec_code || null,
        b.title || 'IR Question',
        b.question_text || '',
        b.due_date || null,
        b.priority || 'High',
      ]
    );
    await q(
      `insert into reg_question_events (q_id, sub_id, action, by_user, payload_json)
       values ($1,$2,'CREATED',$3,$4)`,
      [rows[0].q_id, subId, (req.headers['x-user-name'] || 'user').toString(), rows[0]]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI Draft
router.post('/questions/:qId/ai-draft', async (req: Request, res: Response) => {
  try {
    const qrow = (await q(`select * from reg_questions where q_id=$1`, [req.params.qId])).rows[0];
    if (!qrow) return res.status(404).json({ error: 'Not found' });
    const md = await aiDraftIR(qrow.sub_id, qrow);
    const { rows } = await q(
      `update reg_questions set ai_draft_md=$2, status='DRAFTED' where q_id=$1 returning *`,
      [req.params.qId, md]
    );
    await q(
      `insert into reg_question_events (q_id, sub_id, action, by_user)
       values ($1,$2,'AI_DRAFTED',$3)`,
      [qrow.q_id, qrow.sub_id, (req.headers['x-user-name'] || 'user').toString()]
    );
    res.json({ ok: true, ai_draft_md: md, question: rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Edit/Save
router.patch('/questions/:qId', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const { rows } = await q(
      `update reg_questions set
         final_md = coalesce($2, final_md),
         sec_code = coalesce($3, sec_code),
         due_date = coalesce($4, due_date),
         priority = coalesce($5, priority),
         status = coalesce($6, status),
         leaf_id = coalesce($7, leaf_id),
         attachments = coalesce($8, attachments),
         updated_at = now()
       where q_id=$1 returning *`,
      [
        req.params.qId,
        b.final_md,
        b.sec_code,
        b.due_date,
        b.priority,
        b.status,
        b.leaf_id,
        b.attachments,
      ]
    );
    await q(
      `insert into reg_question_events (q_id, sub_id, action, by_user, payload_json)
       values ($1,$2,'EDITED',$3,$4)`,
      [
        rows[0].q_id,
        rows[0].sub_id,
        (req.headers['x-user-name'] || 'user').toString(),
        { fields: Object.keys(b) },
      ]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Submit/Close
router.post('/questions/:qId/submit', async (req: Request, res: Response) => {
  try {
    const { rows } = await q(
      `update reg_questions set status='CLOSED', submitted_at=now() where q_id=$1 returning *`,
      [req.params.qId]
    );
    await q(
      `insert into reg_question_events (q_id, sub_id, action, by_user)
       values ($1,$2,'SUBMITTED',$3)`,
      [rows[0].q_id, rows[0].sub_id, (req.headers['x-user-name'] || 'user').toString()]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Events list
router.get('/questions/:qId/events', async (req: Request, res: Response) => {
  try {
    const { rows } = await q(
      `select * from reg_question_events where q_id=$1 order by created_at asc`,
      [req.params.qId]
    );
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Package all IR responses (.zip)
router.post('/submissions/:id/questions/pack', async (req: Request, res: Response) => {
  try {
    const outPath = await buildIRPackageZip(req.params.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outPath)}"`);
    fs.createReadStream(outPath).pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- AUTO-CHECK CLEANUP (restricted) ---
// Deletes a question only when the request includes the magic header.
// This prevents casual deletes while allowing CI to keep the DB clean.
router.delete('/questions/:qId', async (req: Request, res: Response) => {
  if (req.headers['x-auto-check'] !== 'true') {
    return res.status(403).json({ error: 'Forbidden: missing x-auto-check header' });
  }
  await q(`delete from reg_questions where q_id=$1`, [req.params.qId]);
  return res.json({ ok: true, deleted: req.params.qId });
});

export default router;
