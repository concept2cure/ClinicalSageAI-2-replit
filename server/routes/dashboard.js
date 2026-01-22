import { Router } from 'express';
import supabase from '../lib/supabaseClient.js';
import { verifyJwt } from '../middleware/auth.cjs';

const router = Router();

router.get('/', verifyJwt, async (req, res) => {
  const { role, tenantId } = req.user; // role: Regulatory | ClinicalOps | CMC | QA | Executive
  try {
    switch (role) {
      case 'Regulatory':
        const [subs, pending] = await Promise.all([
          supabase.from('submissions').select('id').eq('tenant_id', tenantId),
          supabase.from('documents').select('id').eq('tenant_id', tenantId).eq('status', 'Draft'),
        ]);
        return res.json({
          kpis: {
            totalSubmissions: subs.data?.length || 0,
            docsInDraft: pending.data?.length || 0,
          },
        });
      case 'ClinicalOps':
        const [sites, docs] = await Promise.all([
          supabase.from('sites').select('id').eq('tenant_id', tenantId),
          supabase.from('documents').select('id').eq('tenant_id', tenantId).eq('status', 'Review'),
        ]);
        return res.json({
          kpis: { totalSites: sites.data?.length || 0, docsAwaitingReview: docs.data?.length || 0 },
        });
      case 'CMC':
        const batches = await supabase.from('batch_records').select('id').eq('tenant_id', tenantId);
        return res.json({ kpis: { batchRecords: batches.data?.length || 0 } });
      case 'QA':
        const [caps, deviations] = await Promise.all([
          supabase.from('capas').select('id').eq('tenant_id', tenantId).eq('status', 'Open'),
          supabase.from('deviations').select('id').eq('tenant_id', tenantId).eq('status', 'Open'),
        ]);
        return res.json({
          kpis: { openCAPAs: caps.data?.length || 0, openDeviations: deviations.data?.length || 0 },
        });
      case 'Executive':
      default:
        const [{ data: docsCount }, { data: subsCount }] = await Promise.all([
          supabase
            .from('documents')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
          supabase
            .from('submissions')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId),
        ]);
        return res.json({
          kpis: { allDocs: docsCount?.length || 0, allSubs: subsCount?.length || 0 },
        });
    }
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

export default router;
