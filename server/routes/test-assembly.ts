import { Router, Request, Response } from 'express';
import { AssemblyLine } from '../services/AssemblyLine';
import logger from '../utils/logger';
import { generateDocxBuffer, saveGeneratedDocx } from '../services/docxGenerator';
import { tenantAuthMiddleware } from '../middleware/tenantAuth';

export function testAssemblyRoutes(db: any): Router {
  const router = Router();
  const assembly = new AssemblyLine(db);
  let ensureTablesPromise: Promise<void> | null = null;

  const ensureAssemblyTables = async () => {
    if (ensureTablesPromise) {
      await ensureTablesPromise;
      return;
    }

    ensureTablesPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS assembly_docs (
          id TEXT PRIMARY KEY,
          request TEXT,
          content TEXT,
          status TEXT DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS assembly_audit_logs (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          provider TEXT,
          model TEXT,
          request_text TEXT,
          response_text TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    })();

    await ensureTablesPromise;
  };

  // Gate the test routes in production unless explicitly enabled
  router.use((req, res, next) => {
    const disabledInProd =
      process.env.NODE_ENV === 'production' && !process.env.FORCE_TEST_ASSEMBLY;
    if (disabledInProd) {
      logger.warn('Attempt to access test routes in production blocked');
      return res.status(403).json({ success: false, error: 'test_routes_disabled_in_production' });
    }
    return next();
  });

  // Tenant-level gating for test routes when configured through ALLOWED_TEST_ASSEMBLY_TENANTS
  if (process.env.ALLOWED_TEST_ASSEMBLY_TENANTS) {
    router.use(tenantAuthMiddleware);
  }

  // Health check for this route group
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'test-assembly' });
  });

  // POST /api/test-assembly/start
  router.post('/start', async (req: Request, res: Response) => {
    try {
      await ensureAssemblyTables();
      const { request } = req.body || {};
      if (!request || typeof request !== 'string') {
        return res
          .status(400)
          .json({ success: false, error: 'request must be a non-empty string' });
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
      await ensureAssemblyTables();
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
      await ensureAssemblyTables();
      const { docId, instruction } = req.body || {};
      if (!docId || !instruction) {
        return res
          .status(400)
          .json({ success: false, error: 'docId and instruction are required' });
      }
      logger.info('polish called', { docId });
      const result = await assembly.polish(docId, instruction);
      res.json({ success: true, data: result });
    } catch (err: any) {
      logger.error('/polish error', { error: err?.message || err });
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  });

  // POST /api/test-assembly/export-docx
  // Request: { docId: string, projectId?: string, filename?: string }
  router.post('/export-docx', async (req: Request, res: Response) => {
    try {
      await ensureAssemblyTables();
      const { docId, projectId, filename } = req.body || {};
      if (!docId || typeof docId !== 'string') {
        return res.status(400).json({ success: false, error: 'docId is required' });
      }

      // fetch document from db
      const r = await db.query('SELECT content, request FROM assembly_docs WHERE id = $1 LIMIT 1', [
        docId,
      ]);
      const rows = r.rows || [];
      if (!rows.length) return res.status(404).json({ success: false, error: 'not_found' });

      const doc = rows[0];
      const title = filename || `assembly-${docId}.docx`;

      const buffer: Buffer = await generateDocxBuffer(
        title.replace(/\.docx$/, ''),
        doc.content || ''
      );

      if (projectId) {
        // attach to project knowledge (lightweight)
        try {
          const numericId = parseInt((projectId as string).replace('proj_', ''), 10);
          if (!isNaN(numericId)) {
            const safeName = (filename && String(filename)) || `${title}`;
            const pathSaved = await saveGeneratedDocx(buffer, safeName);

            // mimic upload behavior: create UploadedDocument object and persist into project.settings
            const tokenCount = Math.ceil(buffer.length * 0.25);
            // we don't re-run the full project update flow here; instead return file path and metadata
            return res
              .status(201)
              .json({
                success: true,
                data: {
                  path: pathSaved,
                  document: {
                    id: `doc_gen_${Date.now()}`,
                    name: safeName,
                    type: 'docx',
                    size: buffer.length,
                    tokenCount,
                  },
                },
              });
          }
        } catch (e) {
          logger.error('Failed to attach generated doc to project', { error: (e as any)?.message || e });
        }
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${title}"`);
      return res.send(buffer);
    } catch (err: any) {
      logger.error('/export-docx error', { error: err?.message || err });
      res.status(500).json({ success: false, error: 'internal_error' });
    }
  });

  return router;
}
