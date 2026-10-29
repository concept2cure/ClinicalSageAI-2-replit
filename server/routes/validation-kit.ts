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
 * Mounted at /api/validation-kit via register-inline-routes.ts (auth-gated),
 * and reached on administration's Settings (decision P-67,
 * client/src/concept2cure/v2/surfaces/ValidationKitCard.tsx).
 *
 * What it offers is the launch package, and only that (P-67, 2026-10-29): the
 * validation master plan VMP-001, the documents that name it as their parent
 * (URS, RA, IQ, OQ, VSR) and TM-001, which VMP-001 §5 names as generated from
 * their records. The route used to list every markdown file in the folder, so
 * beside the package a customer was handed a second validation master plan
 * (the CORTEX series, for the AI engines VMP-001 §3 puts out of scope), an
 * internal CI work order and a generated evidence pack. And the package
 * records its header as a `| Field | Value |` table, which `field` did not
 * read, so every one of its documents was listed with no version and no
 * status. docs/evidence/D4/2026-10-29/validation-kit-settings/.
 *
 * A download is recorded before it is delivered (D5, 2026-10-23): it used to
 * stream the file with no record of who took which version of which
 * validation document. It now goes through sendAuditedDownload, the one
 * recorded-download implementation (services/export/governedExportConsequence.ts):
 * EXPORT_GENERATED with the SHA-256 of these bytes, and nothing delivered when
 * that row does not persist (services/export/__tests__/recorded-downloads.contract.test.ts).
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { governedActorId } from '../middleware/orgMembership';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';

const router = Router();

const VALIDATION_DIR = path.join(process.cwd(), 'docs', 'validation');

/** Filename prefix → validation artifact type. */
const TYPE_BY_PREFIX: Record<string, string> = {
  VMP: 'Validation Master Plan',
  URS: 'User Requirements Specification',
  RA: 'Risk Assessment',
  IQ: 'Installation Qualification',
  OQ: 'Operational Qualification',
  TM: 'Traceability Matrix',
  VSR: 'Validation Summary Report',
};

/** The package's document ids, in the plan's order (VMP-001 §5). Nothing else is offered. */
const PACKAGE_ORDER = ['VMP', 'URS', 'RA', 'IQ', 'OQ', 'TM', 'VSR'];
const PACKAGE_DOCUMENT_ID = /^(VMP|URS|RA|IQ|OQ|TM|VSR)-\d{3}$/;

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

/**
 * One field of a document's header, as written: a `| Label | value |` row of
 * its header table, or a `**Label:** value` line. Emphasis is dropped, so a
 * status reads as the document states it ("DRAFT — UNSIGNED").
 */
function field(md: string, label: string): string | null {
  const m = md.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*$`, 'm'))
    ?? md.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
  const value = m ? m[1].replace(/\*\*/g, '').trim() : '';
  return value === '' ? null : value;
}

/** Discover + parse the package's documents. Never throws. */
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

    const docId = field(head, 'Document ID');
    if (!docId || !PACKAGE_DOCUMENT_ID.test(docId)) continue; // not a document of the package
    const prefix = docId.split('-')[0];
    const titleLine = head.match(/^#\s+(.+)$/m);
    artifacts.push({
      docId,
      file,
      type: TYPE_BY_PREFIX[prefix],
      title: titleLine ? titleLine[1].trim() : docId,
      version: field(head, 'Version'),
      status: field(head, 'Status'),
      classification: field(head, 'Classification'),
      sizeBytes,
    });
  }
  // The plan's order: the master plan, requirements, risk, qualification, trace, summary.
  artifacts.sort(
    (a, b) =>
      PACKAGE_ORDER.indexOf(a.docId.split('-')[0]) - PACKAGE_ORDER.indexOf(b.docId.split('-')[0]) ||
      a.docId.localeCompare(b.docId),
  );
  return artifacts;
}

/** GET /api/validation-kit — the catalog. */
router.get('/', (_req: Request, res: Response) => {
  const artifacts = readCatalog();
  res.json({
    artifacts,
    count: artifacts.length,
    // Only what the package is. It used to promise "executed and approved
    // records … through QA at contract", which nothing here provides.
    note:
      artifacts.length > 0
        ? "These are the vendor's validation documents as they stand. Each one's status is the one its own header records."
        : 'Validation documents are not available on this deployment.',
  });
});

/** GET /api/validation-kit/:docId — download one document by its parsed id. */
router.get('/:docId', async (req: Request, res: Response) => {
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
  const organizationId = usableOrgId(authedOrgId(req));
  const userId = governedActorId(req);
  if (!organizationId || !userId) {
    return void res.status(401).json({
      error: { code: 'AUTH_REQUIRED', message: 'A signed-in member of an organisation is required; nothing was delivered.' },
    });
  }
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(full);
  } catch {
    return void res.status(500).json({ error: 'Failed to read document' });
  }
  try {
    await sendAuditedDownload(res, {
      organizationId,
      userId,
      sourceType: 'export_stored_file',
      backendRoute: '/api/validation-kit/:docId',
      resourceType: 'validation_kit_document',
      resourceId: artifact.docId,
      programUuid: null,
      filename: artifact.file,
      mimeType: 'text/markdown; charset=utf-8',
      buffer,
      metadata: { version: artifact.version, status: artifact.status, type: artifact.type },
    });
  } catch (err) {
    if (isUnauditedExportRefusal(err)) {
      return void res.status(503).json({
        error: {
          code: 'UNAUDITED_EXPORT_REFUSED',
          message: 'The document was not delivered because its download could not be recorded. Try again.',
        },
      });
    }
    return void res.status(500).json({ error: 'Failed to deliver document' });
  }
});

export default router;
