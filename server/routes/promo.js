import { Router } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.cjs';
import { checkClaimsAI } from '../services/ai.js';

const router = Router();

// POST /api/promo/upload – upload promotional piece + AI claims check
router.post('/upload', verifyJwt, async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const { fileName, fileUrl, channels } = req.body; // assume file already uploaded via existing upload endpoint -> returns URL

  // AI claim analysis (returns array of claim objects {text, supported:boolean, referenceSuggestion})
  const claims = await checkClaimsAI(fileUrl);

  const { data: promo, error } = await supabase
    .from('promo_materials')
    .insert({
      tenant_id: tenantId,
      file_url: fileUrl,
      file_name: fileName,
      uploader_id: userId,
      status: 'In Review',
      channels,
      claims,
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ message: error.message });

  // Create MLR review tasks (Med, Legal, Reg)
  const roles = ['Medical', 'Legal', 'Regulatory'];
  await supabase
    .from('promo_tasks')
    .insert(
      roles.map(role => ({ tenant_id: tenantId, promo_id: promo.id, role, status: 'Pending' }))
    );

  res.json(promo);
});

// GET /api/promo/:id – details + tasks
router.get('/:id', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const { data: promo } = await supabase
    .from('promo_materials')
    .select('*')
    .eq('id', req.params.id)
    .eq('tenant_id', tenantId)
    .single();
  const { data: tasks } = await supabase.from('promo_tasks').select('*').eq('promo_id', promo.id);
  res.json({ promo, tasks });
});

// POST /api/promo/task/:taskId/approve – reviewer approves
router.post('/task/:taskId/approve', verifyJwt, async (req, res) => {
  const { taskId } = req.params;
  const { tenantId } = req.user;
  await supabase
    .from('promo_tasks')
    .update({ status: 'Approved', approved_at: new Date() })
    .eq('id', taskId)
    .eq('tenant_id', tenantId);
  // if all tasks approved, set promo status
  const { data: task } = await supabase
    .from('promo_tasks')
    .select('promo_id')
    .eq('id', taskId)
    .single();
  const { data: remaining } = await supabase
    .from('promo_tasks')
    .select('*')
    .eq('promo_id', task.promo_id)
    .eq('status', 'Pending');
  if (remaining.length === 0) {
    await supabase.from('promo_materials').update({ status: 'Approved' }).eq('id', task.promo_id);
  }
  res.json({ ok: true });
});

export default router;
