import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import pdfParse from 'pdf-parse';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  sourceDocuments,
  insertSourceDocumentSchema,
  sourceDataPoints,
  insertSourceDataPointSchema,
} from '@shared/schema';
import { requireTenant } from '../middleware/tenant.js';

type ExtractedDataPoint = ReturnType<typeof insertSourceDataPointSchema.parse>;

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

const ingestUploadsDir = path.join(process.cwd(), 'uploads', 'ingest');

if (!fs.existsSync(ingestUploadsDir)) {
  fs.mkdirSync(ingestUploadsDir, { recursive: true });
}

const SCAN_PATTERNS = [
  {
    label: 'p-value',
    pattern: 'p\\s*(?:=|<|≤|>)\\s*[0-9]*\\.?[0-9]+(?:e-?\\d+)?',
    flags: 'gi',
    dataType: 'statistic',
  },
  {
    label: 'sample_size',
    pattern: 'N\\s*=\\s*\\d+',
    flags: 'gi',
    dataType: 'statistic',
  },
  {
    label: 'confidence_interval',
    pattern: 'CI(?:\\s*\u2264|\\s*\u2265|\\s*[=:])?\\s*[0-9%\.\-–\\s]+',
    flags: 'gi',
    dataType: 'statistic',
  },
];

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ingestUploadsDir);
  },
  filename: (_req, file, cb) => {
    const original = path.basename(file.originalname);
    const uniqueName = `${Date.now()}-${randomUUID()}${path.extname(original)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage: multerStorage });

const createSnippet = (text: string, start: number, length: number, window = 80): string => {
  const snippetStart = Math.max(0, start - window);
  const snippetEnd = Math.min(text.length, start + length + window);
  const snippet = text.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();
  return snippet || text.slice(start, start + length).trim();
};

const extractDataPoints = (
  text: string,
  organizationId: number,
  documentId: string,
): ExtractedDataPoint[] => {
  const points: ExtractedDataPoint[] = [];
  const seen = new Set<string>();

  for (const pattern of SCAN_PATTERNS) {
    const regex = new RegExp(pattern.pattern, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[0]?.trim();
      if (!raw) continue;

      const dedupeKey = `${pattern.label}:${raw.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const snippet = createSnippet(text, match.index ?? 0, raw.length);

      try {
        const payload = insertSourceDataPointSchema.parse({
          organizationId,
          documentId,
          dataPointUid: `srcpoint_${randomUUID()}`,
          label: pattern.label,
          content: snippet || raw,
          value: raw,
          dataType: pattern.dataType,
          metadata: {
            parser: 'basic_regex_v1',
            pattern: pattern.pattern,
            matchIndex: match.index ?? null,
            matchLength: raw.length,
          },
        });
        points.push(payload);
      } catch (validationError) {
        console.warn('Skipping invalid data point payload', validationError);
      }
    }
  }

  return points;
};

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const organizationId = Number((req as any).organizationId);

    const documentUid = `srcdoc_${randomUUID()}`;

    const providedSourceType = typeof req.body.sourceType === 'string' ? req.body.sourceType : undefined;
    const providedOrigin = typeof req.body.origin === 'string' ? req.body.origin : undefined;
    const providedTitle = typeof req.body.title === 'string' ? req.body.title : undefined;
    const providedDescription = typeof req.body.description === 'string' ? req.body.description : undefined;

    const baseDocumentPayload = {
      organizationId,
      documentUid,
      sourceType: providedSourceType || (file.mimetype === 'application/pdf' ? 'pdf' : 'upload'),
      origin: providedOrigin || 'upload',
      ingestionStatus: 'uploaded',
      title: providedTitle || path.parse(file.originalname).name,
      description: providedDescription,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      metadata: {
        storagePath: file.path,
        originalFileName: file.originalname,
      },
    } as const;

    const validatedPayload = insertSourceDocumentSchema.parse(baseDocumentPayload);

    const [created] = await db
      .insert(sourceDocuments)
      .values(validatedPayload)
      .returning();

    let extractedText = '';
    if (file.mimetype === 'application/pdf') {
      try {
        const fileBuffer = await fs.promises.readFile(file.path);
        const parsed = await pdfParse(fileBuffer);
        extractedText = parsed.text || '';
      } catch (parseError) {
        console.warn('PDF parsing failed for uploaded source document', parseError);
      }
    }

    let createdDataPoints: ExtractedDataPoint[] = [];
    if (extractedText.trim()) {
      const candidatePoints = extractDataPoints(extractedText, organizationId, created.id);
      if (candidatePoints.length > 0) {
        createdDataPoints = await db
          .insert(sourceDataPoints)
          .values(candidatePoints)
          .returning();
      }
    }

    return res.status(201).json({
      message: 'Source document stored',
      document: created,
      dataPointsExtracted: createdDataPoints.length,
      dataPointsSample: createdDataPoints.slice(0, 10),
    });
  } catch (error) {
    console.error('Source ingestion error:', error);
    return res.status(500).json({ error: 'Failed to ingest source document' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database connection unavailable' });
    }

    const organizationId = Number((req as any).organizationId);

    const limitParam = Number(req.query.limit) || 100;
    const limit = Math.min(Math.max(limitParam, 1), 500);

    const results = await db
      .select({
        id: sourceDataPoints.id,
        label: sourceDataPoints.label,
        value: sourceDataPoints.value,
        content: sourceDataPoints.content,
        dataType: sourceDataPoints.dataType,
        createdAt: sourceDataPoints.createdAt,
        documentId: sourceDataPoints.documentId,
        documentUid: sourceDocuments.documentUid,
        documentTitle: sourceDocuments.title,
        documentFileName: sourceDocuments.fileName,
      })
      .from(sourceDataPoints)
      .leftJoin(sourceDocuments, eq(sourceDataPoints.documentId, sourceDocuments.id))
      .where(eq(sourceDataPoints.organizationId, organizationId))
      .orderBy(desc(sourceDataPoints.createdAt))
      .limit(limit);

    return res.json(results);
  } catch (error) {
    console.error('Source data fetch error:', error);
    return res.status(500).json({ error: 'Failed to load source data' });
  }
});

export default router;
