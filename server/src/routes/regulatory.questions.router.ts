import { Router } from 'express';
import { getPool } from '../../db/pool';
import { aiIRDraft, aiNextActions } from '../services/ai/regulatory';

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
const r = Router();

r.get('/:programId/questions', async (req, res) => {
  const pid = req.params.programId;
  const questions = (
    await q(`select * from reg_questions where program_id=$1 order by created_at desc`, [pid])
  ).rows;
  res.json({ questions });
});

r.post('/:programId/questions', async (req, res) => {
  const pid = req.params.programId;
  const { question, agency, type } = req.body;
  const result = await q(
    `insert into reg_questions (program_id, question, agency, type, status) 
     values ($1, $2, $3, $4, 'RECEIVED') returning *`,
    [pid, question, agency, type]
  );
  res.json({ question: result.rows[0] });
});

r.post('/:programId/questions/:qid/draft', async (req, res) => {
  const pid = req.params.programId;
  const qid = req.params.qid;
  const question = (
    await q(`select * from reg_questions where id=$1 and program_id=$2`, [qid, pid])
  ).rows[0];
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const context = { programId: pid };
  const ai = await aiIRDraft(question.question, context);

  await q(`update reg_questions set draft_response=$1, status='DRAFTED' where id=$2`, [
    ai.answer_md,
    qid,
  ]);
  res.json({ question: { ...question, draft_response: ai.answer_md, status: 'DRAFTED' }, ai });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'questions', programId: req.params.programId });
  res.json(out);
});

export default r;
