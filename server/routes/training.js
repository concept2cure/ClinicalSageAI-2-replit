import { Router } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.cjs';
const router = Router();

// AUTO‑CREATE training tasks when SOP transitions to Effective
export async function createTrainingTasks(sopDocId, sopTitle, tenantId) {
  // fetch users needing training (simple: all users with role 'User')
  const { data: users } = await supabase.from('users').select('id').eq('tenant_id', tenantId);
  if (!users) return;
  const tasks = users.map(u => ({
    tenant_id: tenantId,
    user_id: u.id,
    doc_id: sopDocId,
    title: sopTitle,
    status: 'Pending',
  }));
  await supabase.from('training_tasks').insert(tasks);
}

// GET /api/training – my tasks
router.get('/', verifyJwt, async (req, res) => {
  const { id: userId, tenantId } = req.user;
  const { data, error } = await supabase
    .from('training_tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at');
  if (error) return res.status(500).json({ message: error.message });
  res.json(data);
});

// POST /api/training/:taskId/complete – mark done ✔️
router.post('/:taskId/complete', verifyJwt, async (req, res) => {
  const { taskId } = req.params;
  const { id: userId, tenantId } = req.user;
  const { error } = await supabase
    .from('training_tasks')
    .update({ status: 'Completed', completed_at: new Date() })
    .eq('id', taskId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  if (error) return res.status(400).json({ message: error.message });
  res.json({ ok: true });
});

export default router;
