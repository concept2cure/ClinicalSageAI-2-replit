/**
 * Literature Review Routes
 * Literature review and analysis service
 */
import { Router } from 'express';
import multer from 'multer';
import { tikaIngestionService } from '../services/ingestion/tikaIngestionService';
import { grobidLiteratureService } from '../services/literature/grobidLiteratureService';
import { opensearchAdapter } from '../services/search/opensearchAdapter';
import { authMiddleware } from '../auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(tenantContextMiddleware);

router.get('/reviews', (_req, res) => {
  res.json({
    reviews: [],
    message: 'Literature review service ready',
  });
});

router.post('/analyze', async (req, res) => {
  const text = String(req.body?.text || '');
  const filename = String(req.body?.filename || 'literature.txt');
  const mimeType = String(req.body?.mimeType || 'text/plain');

  const scholarly = await grobidLiteratureService.extractStructuredLiterature({
    filename,
    mimeType,
    text,
  });

  return res.json({ success: true, analysis: scholarly });
});

router.post('/ingest', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file required' });
    }

    const extraction = await tikaIngestionService.extractFromBuffer({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    const scholarly = await grobidLiteratureService.extractStructuredLiterature({
      filename: req.file.originalname,
      mimeType: extraction.normalizedMimeType,
      text: extraction.extractedText,
    });

    const organizationId = Number((req as any).tenantContext?.organizationId || req.body?.organizationId || 0);
    if (organizationId > 0) {
      await opensearchAdapter.indexDocument({
        id: `lit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        organizationId,
        projectId: req.body?.projectId ? Number(req.body.projectId) : null,
        artifactId: null,
        docType: 'scientific_literature',
        module: 'literature-review',
        section: 'fulltext',
        title: scholarly.title || req.file.originalname,
        source: 'upload',
        lifecycleState: 'draft',
        tags: ['literature', 'scientific'],
        text: extraction.extractedText.slice(0, 120000),
        metadata: {
          parserProvider: extraction.parserProvider,
          grobidProvider: scholarly.provider,
          referencesCount: scholarly.references.length,
        },
      });
    }

    return res.json({
      success: true,
      extraction,
      scholarly,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'ingest failed' });
  }
});

export default router;
