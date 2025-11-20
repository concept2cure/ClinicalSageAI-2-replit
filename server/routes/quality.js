import { Router } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.js';

const router = Router();

// POST /api/quality/deviation – log new deviation
router.post('/deviation', verifyJwt, async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const { title, description, docIds } = req.body; // docIds optional array
  const { data: dev, error } = await supabase
    .from('deviations')
    .insert({
      tenant_id: tenantId,
      title,
      description,
      status: 'Open',
      owner_id: userId,
      doc_ids: docIds || [],
    })
    .select('*')
    .single();
  if (error) return res.status(500).json({ message: error.message });
  res.json(dev);
});

// POST /api/quality/deviation/:id/close – close deviation (optionally escalate)
router.post('/deviation/:id/close', verifyJwt, async (req, res) => {
  const { tenantId, id: userId } = req.user;
  const { escalate, capaTitle } = req.body; // escalate boolean
  const { error } = await supabase
    .from('deviations')
    .update({ status: 'Closed', closed_at: new Date(), closer_id: userId })
    .eq('id', req.params.id)
    .eq('tenant_id', tenantId);
  if (error) return res.status(400).json({ message: error.message });
  let capa = null;
  if (escalate) {
    const { data, error: cErr } = await supabase
      .from('capas')
      .insert({
        tenant_id: tenantId,
        deviation_id: req.params.id,
        title: capaTitle || 'CAPA from deviation',
        status: 'Open',
        owner_id: userId,
      })
      .select('*')
      .single();
    if (cErr) return res.status(500).json({ message: cErr.message });
    capa = data;
  }
  res.json({ ok: true, capa });
});

// POST /api/quality/capa/:id/action – add action / mark complete
router.post('/capa/:id/action', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const { action, completed } = req.body;
  if (action)
    await supabase
      .from('capa_actions')
      .insert({
        tenant_id: tenantId,
        capa_id: req.params.id,
        description: action,
        status: 'Pending',
      });
  if (completed)
    await supabase
      .from('capa_actions')
      .update({ status: 'Done', completed_at: new Date() })
      .eq('id', completed);
  res.json({ ok: true });
});

router.get('/dashboard', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const [{ data: devOpen }, { data: capOpen }] = await Promise.all([
    supabase
      .from('deviations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'Open'),
    supabase
      .from('capas')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'Open'),
  ]);
  res.json({ deviationsOpen: devOpen?.length || 0, capasOpen: capOpen?.length || 0 });
});

export default router;
