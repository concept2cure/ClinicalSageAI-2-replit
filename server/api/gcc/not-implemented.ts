/**
 * The router a GCC module gets when there is no implementation behind it.
 *
 * Returns 501 Not Implemented, not 200 with a cheerful body. A monitor, a
 * status page or a customer integration reading a 200 concludes the feature is
 * live; that is what the previous stubs caused, and 501 is the status code that
 * exists to say "this endpoint is routed but does nothing yet".
 *
 * Built from the declaration in ./modules.ts so the refusal, and the entry in
 * /api/gcc/health, cannot disagree about what is running.
 */
import { Router } from 'express';
import { gccModule } from './modules.js';

export function notImplementedRouter(key: string): Router {
  const declared = gccModule(key);
  const router = Router();

  router.get('/status', (_req, res) => {
    res.status(501).json({
      status: 'not_implemented',
      module: declared.key,
      summary: declared.summary,
      ...(declared.servedInsteadBy ? { servedInsteadBy: declared.servedInsteadBy } : {}),
    });
  });

  return router;
}
