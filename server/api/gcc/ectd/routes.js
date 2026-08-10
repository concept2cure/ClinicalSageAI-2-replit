/**
 * eCTD module structure — a prototype.
 *
 * `/modules` answers from a constant. It is not read from the rule packs, the
 * project or the database, so it is the same five strings for every caller and
 * every submission. Do not build against it; the governed eCTD tree comes from
 * c2c_rule_packs via the authoring surfaces.
 *
 * `/status` reports the state declared in ../modules.ts rather than a hardcoded
 * 'operational', so it cannot drift from what /api/gcc/health says about it.
 */
import { Router } from 'express';
import { gccModule } from '../modules.js';

const router = Router();
const declared = gccModule('ectd');

router.get('/modules', (_req, res) => {
  res.json({
    modules: ['m1', 'm2', 'm3', 'm4', 'm5'],
    note: 'Static CTD module list. Not derived from any project or rule pack.',
  });
});

router.get('/status', (_req, res) => {
  res.json({ status: declared.state, module: declared.key, summary: declared.summary });
});

export default router;
