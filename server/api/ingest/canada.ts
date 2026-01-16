import { Router } from 'express';
import multer from 'multer';
import { extractTextFromPdf } from '../../utils/pdf-extractor';
import { db } from '../../../lib/database.js';
import { logEvent } from '../system.js';
import { HealthCanadaConnector } from '../../services/health-canada.js';
import { LLMStructuredExtractor } from '../../services/deep-miner/llm-extractor.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/csr', upload.single('report'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  try {
    const text = await extractTextFromPdf(req.file.buffer);
    const filename = req.file.originalname;

    const extractor = new LLMStructuredExtractor();
    const deepData = await extractor.extractFullPayload(text, `CSR: ${filename}`);

    const result = await db.query(
      `
      INSERT INTO csr_deep_vault (
        regulatory_agency,
        submission_id,
        study_id,
        drug_name,
        deep_data,
        extraction_method,
        extraction_confidence_score,
        pdf_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING csr_id
    `,
      [
        'Health Canada',
        deepData?.regulatory?.submission_id || 'UNKNOWN',
        deepData?.regulatory?.study_id || 'UNKNOWN',
        null,
        JSON.stringify(deepData || {}),
        'gpt-4-structured',
        deepData?._extractionMetadata?.confidenceScore || null,
        `internal://vault/${filename}`,
      ]
    );

    await logEvent(
      'SYSTEM_INGEST',
      'CSR_PROCESSED',
      filename,
      { id: result.rows[0].csr_id },
      { resourceType: 'csr' }
    );

    res.json({ status: 'SUCCESS', id: result.rows[0].csr_id, insight: deepData?._extractionMetadata });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ingestion Failed' });
  }
});

router.post('/sync', async (req, res) => {
  const { therapeuticArea } = req.body || {};

  try {
    const count = await HealthCanadaConnector.syncCatalog(therapeuticArea);

    res.json({
      status: 'SUCCESS',
      imported: count,
      message: `Harvest complete. ${count} new CSRs analyzed and indexed.`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Open Data Sync Failed' });
  }
});

export default router;
