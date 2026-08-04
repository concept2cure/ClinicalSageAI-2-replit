/**
 * Data Origins — "where did this text come from" for a selected range.
 *
 * Backs the select-text → right-click → Data Origins interaction. Two
 * representations of one answer:
 *
 *   POST /api/data-origins/selection      → JSON report (the panel)
 *   POST /api/data-origins/selection.pdf  → the same report as a PDF
 *
 * POST rather than GET for both, because the selected text travels in the body:
 * a passage of a regulated document has no business in a URL, where it lands in
 * access logs, proxy caches and browser history.
 *
 * Tenant scope comes from the authenticated context and is never taken from the
 * body — a caller may name any document id, and the org they get is their own.
 *
 * @module server/routes/data-origins.routes
 */

import { Router, type Request, type Response } from 'express';

import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger.js';
import {
  getSelectionOrigins,
  SpanLineageError,
} from '../services/clinical-regulatory-evidence/span-lineage.service';
import { renderDataOriginsPdf } from '../services/clinical-regulatory-evidence/data-origins-pdf';

const logger = createScopedLogger('data-origins-routes');
const router = Router();

/** Selected text is echoed into the report; cap it so a paste cannot be unbounded. */
const MAX_SELECTION_TEXT = 20_000;

interface SelectionBody {
  documentTable?: unknown;
  documentId?: unknown;
  charStart?: unknown;
  charEnd?: unknown;
  selectionText?: unknown;
  documentTitle?: unknown;
}

function parseSelection(body: SelectionBody):
  | { ok: true; value: { documentTable: string; documentId: string; charStart: number; charEnd: number; selectionText?: string; documentTitle?: string } }
  | { ok: false; message: string } {
  const documentTable = typeof body.documentTable === 'string' ? body.documentTable.trim() : '';
  const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
  const charStart = Number(body.charStart);
  const charEnd = Number(body.charEnd);

  if (!documentTable || !documentId) {
    return { ok: false, message: 'documentTable and documentId are required' };
  }
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) {
    return { ok: false, message: 'charStart and charEnd must be integers' };
  }
  if (charStart < 0 || charEnd <= charStart) {
    return { ok: false, message: 'charEnd must be greater than charStart, and charStart >= 0' };
  }

  const selectionText =
    typeof body.selectionText === 'string'
      ? body.selectionText.slice(0, MAX_SELECTION_TEXT)
      : undefined;
  const documentTitle =
    typeof body.documentTitle === 'string' ? body.documentTitle.slice(0, 300) : undefined;

  return {
    ok: true,
    value: { documentTable, documentId, charStart, charEnd, selectionText, documentTitle },
  };
}

function fail(res: Response, err: unknown): void {
  if (err instanceof SpanLineageError) {
    return void res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
  }
  logger.error('data-origins route error', {
    err: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to resolve data origins.' } });
}

/** The report behind the panel. */
router.post('/selection', async (req: Request, res: Response) => {
  const orgId = authedOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Organization context required' } });
  }

  const parsed = parseSelection((req.body ?? {}) as SelectionBody);
  if (!parsed.ok) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.message } });
  }

  try {
    const report = await getSelectionOrigins(
      orgId,
      { documentTable: parsed.value.documentTable, documentId: parsed.value.documentId },
      parsed.value.charStart,
      parsed.value.charEnd,
      parsed.value.selectionText,
    );
    res.json({ success: true, report });
  } catch (err) {
    fail(res, err);
  }
});

/** The same report, as something a reviewer can be handed. */
router.post('/selection.pdf', async (req: Request, res: Response) => {
  const orgId = authedOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Organization context required' } });
  }

  const parsed = parseSelection((req.body ?? {}) as SelectionBody);
  if (!parsed.ok) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.message } });
  }

  try {
    const report = await getSelectionOrigins(
      orgId,
      { documentTable: parsed.value.documentTable, documentId: parsed.value.documentId },
      parsed.value.charStart,
      parsed.value.charEnd,
      parsed.value.selectionText,
    );

    const pdf = await renderDataOriginsPdf(report, {
      documentTitle: parsed.value.documentTitle ?? null,
      requestedBy: (req as { user?: { email?: string } }).user?.email ?? null,
    });

    // Filename carries the range so two exports from one document do not
    // overwrite each other in a downloads folder.
    const name = `data-origins-${parsed.value.documentId}-${parsed.value.charStart}-${parsed.value.charEnd}.pdf`
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
