/**
 * GCC Platform API Routes Index
 *
 * Mounts the GCC modules. What each one actually is — available, prototype or
 * not implemented — is declared once in ./modules.ts, and both this file's
 * /health endpoint and each module's own /status are derived from it. See that
 * file for why: /health used to assert five 'operational' services from a
 * hardcoded literal while three of them had no code at all.
 *
 * The Evidence Vault is served by the governed mdx-vault surface
 * (concept2cure_artifacts), which is organization-scoped. The earlier
 * gcc/vault prototype was removed: its schema and route columns had
 * diverged (uploads failed), it had no tenant scoping and no consumers,
 * and it duplicated the canonical vault.
 */
import { Router } from 'express';
import ectdRoutes from './ectd/routes.js';
import signingRoutes from './signing/routes.js';
import siteIntelRoutes from './site-intel/routes.js';
import labelingRoutes from './labeling/routes.js';
import draftingRoutes from '../drafting/routes.js';
import { GCC_MODULES } from './modules.js';

const router = Router();

// Mount all GCC platform routes
router.use('/ectd', ectdRoutes);
router.use('/signing', signingRoutes);
router.use('/site-intel', siteIntelRoutes);
router.use('/labeling', labelingRoutes);
router.use('/drafting', draftingRoutes);

/**
 * Platform health.
 *
 * `status` describes the platform as a whole and is computed, not asserted:
 * 'available' only when every declared module is available, otherwise
 * 'partial'. Callers that need one module's state should read `services` — a
 * green top-level light next to three unimplemented modules is what made the
 * previous version misleading.
 *
 * No try/catch: the body is built from a module-scope constant and a timestamp,
 * so there is nothing here that can throw. The previous catch could never run,
 * and echoed `error.message` to the client if it somehow had.
 */
router.get('/health', (_req, res) => {
  const services = Object.fromEntries(GCC_MODULES.map(m => [m.key, m.state]));
  const allAvailable = GCC_MODULES.every(m => m.state === 'available');

  res.json({
    status: allAvailable ? 'available' : 'partial',
    platform: 'GCC Enterprise',
    services,
    timestamp: new Date().toISOString(),
  });
});

export default router;
