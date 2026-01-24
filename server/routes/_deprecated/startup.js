import { Router } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.js';

const router = Router();

// Library of required docs per country (simplified)
const COUNTRY_REQUIREMENTS = {
  US: ['IRB Approval', '1572', 'CV', 'Budget & Contract'],
  DE: ['Ethics Approval', 'Insurance Certificate', 'Investigator CV'],
  IN: ['DCGI Approval', 'IEC Approval', 'Form CT‑1', 'Budget & Contract'],
};

// POST /api/startup/site – create site + auto checklist
router.post('/site', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const { siteName, country, trialId } = req.body;
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .insert({
      tenant_id: tenantId,
      trial_id: trialId,
      name: siteName,
      country,
      status: 'Startup',
    })
    .select('*')
    .single();
  if (siteErr) return res.status(500).json({ message: siteErr.message });

  // generate checklist rows
  const reqs = COUNTRY_REQUIREMENTS[country] || [];
  const rows = reqs.map(label => ({
    tenant_id: tenantId,
    site_id: site.id,
    label,
    status: 'Pending',
  }));
  await supabase.from('site_checklists').insert(rows);

  res.json(site);
});

// GET /api/startup/site/:id – fetch site + checklist
router.get('/site/:id', verifyJwt, async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;
  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();
  const { data: items } = await supabase.from('site_checklists').select('*').eq('site_id', id);
  res.json({ site, items });
});

// POST /api/startup/item/:itemId/complete – mark checklist item done
router.post('/item/:itemId/complete', verifyJwt, async (req, res) => {
  const { itemId } = req.params;
  const { tenantId } = req.user;
  const { error } = await supabase
    .from('site_checklists')
    .update({ status: 'Done', completed_at: new Date() })
    .eq('id', itemId)
    .eq('tenant_id', tenantId);
  if (error) return res.status(400).json({ message: error.message });
  res.json({ ok: true });
});

export default router;
