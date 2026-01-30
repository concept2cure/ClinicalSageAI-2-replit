import { Router, Request, Response } from 'express';
import { AssemblyLine } from '../services/AssemblyLine';
import logger from '../utils/logger';

export function testAssemblyRoutes(db: any): Router {
  const router = Router();
  const assembly = new AssemblyLine(db);

  // Gate the test routes in production unless explicitly enabled
  router.use((req, res, next) => {
    const disabledInProd = process.env.NODE_ENV === 'production' && !process.env.FORCE_TEST_ASSEMBLY;
    if (disabledInProd) {
      logger.warn('Attempt to access test routes in production blocked');
      return res.status(403).json({ success: false, error: 'test_routes_disabled_in_production' });
    }
    return next();
  });

  // Health check for this route group
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'test-assembly' });
  });

  // POST /api/test-assembly/start
  router.post('/start', async (req: Request, res: Response) => {
    try {
      const { request } = req.body || {};
      if (!request || typeof request !== 'string') {
        return res.status(400).json({ success: false, error: 'request must be a non-empty string' });
      }
      logger.info('start called');
      const result = await assembly.start(request);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('/start error', { error: err?.message || err });
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  });

  // POST /api/test-assembly/edit
  router.post('/edit', async (req: Request, res: Response) => {
    try {
      const { docId, content } = req.body || {};
      if (!docId || !content) {
        return res.status(400).json({ success: false, error: 'docId and content are required' });
      }
      logger.info('edit called', { docId });
      const result = await assembly.humanEdit(docId, content);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('/edit error', { error: err?.message || err });
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  });

  // POST /api/test-assembly/polish
  router.post('/polish', async (req: Request, res: Response) => {
    try {
      const { docId, instruction } = req.body || {};
      if (!docId || !instruction) {
        return res.status(400).json({ success: false, error: 'docId and instruction are required' });
      }
      logger.info('polish called', { docId });
      const result = await assembly.polish(docId, instruction);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('/polish error', { error: err?.message || err });
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  });

  return router;
}
