/**
 * GAMP 5 validation-kit — self-serve catalog + download.
 *
 *   GET /api/validation-kit          → catalog of the platform's CSV artifacts
 *   GET /api/validation-kit/:docId   → download one document (raw markdown)
 *
 * Backed by the real validation documents committed under docs/validation/
 * (VMP, IQ, OQ, PQ, ISO 14971 risk analysis, Part 11 traceability matrix,
 * cloud vendor qualification, validation summary report, HIPAA/FDA security
 * assessment). Metadata — id, title, version, status, classification — is
 * parsed from each document's own header, so the catalog reports each
 * artifact's TRUE state (these ship as `1.0.0-DRAFT`, review pending) rather
 * than a fabricated "completed/approved" status. Nothing here is invented;
 * if docs/validation/ is absent at runtime the catalog is honestly empty.
 *
 * Mounted at /api/validation-kit via register-inline-routes.ts (auth-gated).
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const VALIDATION_DIR = path.join(process.cwd(), 'docs', 'validation');

/** Filename prefix → validation artifact type. */
const TYPE_BY_PREFIX: Record<string, string> = {
  VMP: 'Validation Master Plan',
  IQ: 'Installation Qualification',
  OQ: 'Operational Qualification',
  PQ: 'Performance Qualification',
  RA: 'ISO 14971 Risk Analysis',
  TM: 'Part 11 Traceability Matrix',
  VQ: 'Cloud Vendor Qualification',
  VSR: 'Validation Summary Report',
  CSRA: 'Security Assessment (HIPAA/FDA)',
};

interface ValidationArtifact {
  docId: string;
  file: string;
  type: string;
  title: string;
  version: string | null;
  status: string | null;
  classification: string | null;
  sizeBytes: number;
}

/** Pull one `**Label:** value` field out of a markdown header block. */
function field(md: string, label: string): string | null {
  const m = md.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
  return m ? m[1].replace(/\s+$/, '').trim() : null;
}

/** Discover + parse the validation documents. Never throws. */
function readCatalog(): ValidationArtifact[] {
  let files: string[];
  try {
    files = fs.readdirSync(VALIDATION_DIR).filter(f => f.toLowerCase().endsWith('.md'));
  } catch {
    return []; // docs/validation not present at runtime — honest empty catalog.
  }

  const artifacts: ValidationArtifact[] = [];
  for (const file of files) {
    const full = path.join(VALIDATION_DIR, file);
    let head = '';
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(full).size;
      // Only the header block is needed for metadata — read the first 2 KB.
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(2048);
      const read = fs.readSync(fd, buf, 0, 2048, 0);
      fs.closeSync(fd);
      head = buf.toString('utf8', 0, read);
    } catch {
      continue;
    }

    const prefix = (file.split('-')[0] || '').toUpperCase();
    const titleLine = head.match(/^#\s+(.+)$/m);
    const docId = field(head, 'Document ID') ?? file.replace(/\.md$/i, '');
    artifacts.push({
      docId,
      file,
      type: TYPE_BY_PREFIX[prefix] ?? 'Validation Document',
      title: titleLine ? titleLine[1].trim() : docId,
      version: field(head, 'Version'),
      status: field(head, 'Status'),
      classification: field(head, 'Classification'),
      sizeBytes,
    });
  }
  // Stable ordering: master plan first, then the qualification protocols.
  const order = ['VMP', 'IQ', 'OQ', 'PQ', 'RA', 'TM', 'VQ', 'VSR', 'CSRA'];
  artifacts.sort(
    (a, b) =>
      order.indexOf((a.file.split('-')[0] || '').toUpperCase()) -
      order.indexOf((b.file.split('-')[0] || '').toUpperCase()),
  );
  return artifacts;
}

/** GET /api/validation-kit — the catalog. */
router.get('/', (_req: Request, res: Response) => {
  const artifacts = readCatalog();
  res.json({
    artifacts,
    count: artifacts.length,
    // Honest framing for the UI: draft protocols are downloadable now; executed
    // and approved records are still provisioned through QA at contract.
    note:
      artifacts.length > 0
        ? 'Draft validation protocols are available for download. Executed and approved records are provided through QA at contract.'
        : 'Validation documents are not available on this deployment. They are provided through QA at contract.',
  });
});

/** GET /api/validation-kit/:docId — download one document by its parsed id. */
router.get('/:docId', (req: Request, res: Response) => {
  const artifact = readCatalog().find(a => a.docId === req.params.docId);
  if (!artifact) {
    return void res.status(404).json({ error: 'Validation document not found' });
  }
  // Serve only a file we discovered inside VALIDATION_DIR — never a
  // client-supplied path (no traversal).
  const full = path.join(VALIDATION_DIR, artifact.file);
  if (path.dirname(full) !== VALIDATION_DIR) {
    return void res.status(400).json({ error: 'Invalid document path' });
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${artifact.file}"`);
  fs.createReadStream(full)
    .on('error', () => res.status(500).json({ error: 'Failed to read document' }))
    .pipe(res);
});

export default router;
