/**
 * IND lifecycle — filing routes that persist a rendered document as an audited
 * eCTD sequence + leaves (with the rendered PDF's md5 as the leaf checksum).
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { createHash } from 'crypto';
import { requireRole } from '../../middleware/auth';
import { assembleIndSafetyReport } from '../../services/ind-lifecycle/ind-safety-report-service';
import { composeE2bR3Icsr } from '../../services/ind-lifecycle/e2b-icsr-composer';
import { assembleIndAnnualReport } from '../../services/ind-lifecycle/ind-annual-report-service';
import { planIndAmendment } from '../../services/ind-lifecycle/ind-amendment-service';
import {
  renderIndSafetyReportPdf,
  renderIndAnnualReportPdf,
} from '../../services/ind-lifecycle/ind-document-renderer';
import {
  persistSafetyReportIntent,
  persistAmendmentPlan,
  persistAnnualReport,
} from '../../services/ind-lifecycle/ind-lifecycle-persistence';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, coerceEventDates } from './shared';

const router = Router();

/** True when submissionId is a positive int and sequenceNumber is 4 digits. */
function fileTargetValid(b: any): boolean {
  const submissionId = Number(b.submissionId);
  return Number.isInteger(submissionId) && submissionId > 0 && /^\d{4}$/.test(String(b.sequenceNumber ?? ''));
}

/**
 * File a 312.32 IND Safety Report as an eCTD amendment sequence + leaves.
 * Body: { submissionId, sequenceNumber, event, icsr?, aggregateContext?, now? }.
 */
router.post('/safety-report/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  if (!fileTargetValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const event = coerceEventDates(b.event);
    const { document, amendmentIntent } = assembleIndSafetyReport(event, {
      icsr: b.icsr ?? null,
      aggregateContext: b.aggregateContext,
      now: b.now ? new Date(b.now) : undefined,
    });
    if (!amendmentIntent) {
      return res.status(422).json({ error: { code: 'NOT_REPORTABLE', message: 'Event is not an expedited IND safety report; nothing to file.' } });
    }
    // Render the safety-report PDF and attach its md5 to the m1.12.4 leaf so the
    // eCTD index-md5 matches the filed bytes.
    const pdf = await renderIndSafetyReportPdf(document);
    const checksums: Record<string, string> = { 'm1.12.4': createHash('md5').update(pdf).digest('hex') };
    // When an ICSR backs the case, the intent also carries an m5.3.5 leaf; file
    // the deterministic E2B(R3) XML projection and checksum it likewise.
    if (b.icsr) {
      const { xml } = composeE2bR3Icsr(event, {
        icsr: b.icsr,
        expedited: true,
        now: b.now ? new Date(b.now) : undefined,
      });
      checksums['m5.3.5'] = createHash('md5').update(xml).digest('hex');
    }
    res.status(201).json(
      await persistSafetyReportIntent(Number(b.submissionId), amendmentIntent, String(b.sequenceNumber), ctx, checksums),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * File a 312.33 IND Annual Report as an `annual` eCTD sequence + m1.13 leaf.
 * Body: { submissionId, sequenceNumber }. When the report content is supplied,
 * the PDF is rendered and its md5 attached to the leaf.
 */
router.post('/annual-report/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  if (!fileTargetValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  try {
    let checksum: string | undefined;
    if (b.productName && b.indNumber) {
      const pdf = await renderIndAnnualReportPdf(assembleIndAnnualReport(b));
      checksum = createHash('md5').update(pdf).digest('hex');
    }
    res.status(201).json(await persistAnnualReport(Number(b.submissionId), String(b.sequenceNumber), ctx, checksum));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * File a 312.30 / 312.31 amendment as an eCTD amendment sequence + leaves.
 * Body: { submissionId, sequenceNumber, projectId, indNumber, changedDocuments }.
 */
router.post('/amendment/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  if (!fileTargetValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  try {
    const plan = planIndAmendment(b);
    res.status(201).json(await persistAmendmentPlan(Number(b.submissionId), plan, String(b.sequenceNumber), ctx));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
