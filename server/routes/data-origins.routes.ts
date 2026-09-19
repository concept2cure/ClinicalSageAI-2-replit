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
import { pool } from '../db';
import {
  getSelectionOrigins,
  summarizeDocumentAttribution,
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

/* ── Document-level attribution ────────────────────────────────────────────────
 *
 *   GET /api/data-origins/document → how much of this document is attributed,
 *                                    and to what
 *
 * GET, unlike the two above: no document text travels here, only ids, so there
 * is nothing that must be kept out of a URL.
 *
 * THE DENOMINATOR IS READ SERVER-SIDE, ON PURPOSE. A coverage percentage is
 * attributed characters over total characters, so whoever supplies the total
 * controls the percentage — a caller passing a short length would report a
 * well-attributed document by arithmetic alone. The text length therefore comes
 * from the server's own read of the governed row, in the same spirit as the
 * tenant scope above never being taken from the request.
 */

/**
 * Where each governed document's text lives. A whitelist, so the table and
 * column below can be interpolated: only these keys can ever reach the query,
 * and an unknown table is refused rather than guessed at.
 *
 * `labeling_pi_sections` is deliberately absent. Its content is JSONB and the
 * lineage was recorded against the DERIVED heading+body string, so the length of
 * the JSON is not the length the spans describe — and a denominator that is
 * merely close would make every figure here quietly wrong.
 */
const CONTENT_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  concept2cure_artifacts: 'content',
  protocol_sections: 'content',
  protocol_documents: 'synopsis',
  biosketch_sections: 'content',
  cerv2_510k_sections: 'content',
  dms_plan_elements: 'content',
  consent_form_elements: 'content',
  coauthor_documents: 'content',
  q_sub_section_bodies: 'content',
});

/** null = no such document for this organization (or it holds no text yet). */
async function resolveContentLength(
  orgId: number,
  documentTable: string,
  documentId: string,
): Promise<number | null> {
  const column = CONTENT_COLUMNS[documentTable];
  if (!column) return null;
  const { rows } = await pool.query(
    `SELECT COALESCE(char_length(${column}), 0)::int AS len
       FROM ${documentTable}
      WHERE id::text = $1 AND organization_id = $2
      LIMIT 1`,
    [documentId, orgId],
  );
  return rows.length === 0 ? null : Number(rows[0].len);
}

router.get('/document', async (req: Request, res: Response) => {
  const orgId = authedOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Organization context required' } });
  }

  const documentTable = typeof req.query.documentTable === 'string' ? req.query.documentTable.trim() : '';
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId.trim() : '';
  if (!documentTable || !documentId) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'documentTable and documentId are required' } });
  }
  if (!CONTENT_COLUMNS[documentTable]) {
    // Refusing beats answering about a table whose text this route cannot
    // locate: a percentage over the wrong denominator is worse than no answer.
    return res.status(400).json({
      error: {
        code: 'UNSUPPORTED_DOCUMENT_TABLE',
        message: `Attribution coverage is not available for "${documentTable}".`,
      },
    });
  }

  try {
    const contentLength = await resolveContentLength(orgId, documentTable, documentId);
    if (contentLength === null) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No such document in this organization.' },
      });
    }

    const summary = await summarizeDocumentAttribution(
      orgId,
      { documentTable, documentId },
      contentLength,
    );
    res.json({ success: true, summary });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
