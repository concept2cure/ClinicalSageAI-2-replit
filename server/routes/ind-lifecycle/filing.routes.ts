/**
 * IND lifecycle — filing routes that persist a rendered document as an audited
 * eCTD sequence + leaves (with the rendered PDF's md5 as the leaf checksum).
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { assembleIndSafetyReport } from '../../services/ind-lifecycle/ind-safety-report-service';
import { composeE2bR3Icsr } from '../../services/ind-lifecycle/e2b-icsr-composer';
import { markSafetyReportFiled, SafetyReportError } from '../../services/ind-lifecycle/ind-safety-report-persistence';
import { markAnnualReportFiled, AnnualReportError } from '../../services/ind-lifecycle/ind-annual-report-persistence';
import { markAmendmentFiled, AmendmentError } from '../../services/ind-lifecycle/ind-amendment-persistence';
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
  type LeafSourceBySection,
} from '../../services/ind-lifecycle/ind-lifecycle-persistence';
import { storeRenderedLeafFile, leafSourceFor, type RenderedLeafSource } from '../../services/ectd/rendered-leaf-files';
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
    // Render the safety-report PDF and RETAIN the bytes, so the leaf points at
    // the document that was filed. Keeping only an md5 (what this did before)
    // left every filed lifecycle sequence assembling with zero leaf files and
    // permanently dispatch-blocked.
    const pdf = await renderIndSafetyReportPdf(document);
    const sources: LeafSourceBySection = {
      'm1.12.4': leafSourceFor(
        await storeRenderedLeafFile({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          bytes: pdf,
          mime: 'application/pdf',
          fileName: 'ind-safety-report.pdf',
          renderedFrom: 'ind_safety_report',
          sectionCode: 'm1.12.4',
        }),
      ),
    };
    // When an ICSR backs the case the intent also carries an m5.3.5 leaf. The
    // E2B(R3) projection is XML and is transmitted through the ICSR gateway, so
    // it is retained as the filed record but NOT claimed as an eCTD leaf: the
    // resolver refuses a non-PDF, and the leaf reads unresolved with that
    // reason rather than shipping a non-conformant file.
    if (b.icsr) {
      const { xml } = composeE2bR3Icsr(event, {
        icsr: b.icsr,
        expedited: true,
        now: b.now ? new Date(b.now) : undefined,
      });
      sources['m5.3.5'] = leafSourceFor(
        await storeRenderedLeafFile({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          bytes: Buffer.from(xml, 'utf8'),
          mime: 'application/xml',
          fileName: 'e2b-r3-icsr.xml',
          renderedFrom: 'e2b_r3_icsr',
          sectionCode: 'm5.3.5',
        }),
      );
    }
    const filed = await persistSafetyReportIntent(Number(b.submissionId), amendmentIntent, String(b.sequenceNumber), ctx, sources);
    // When filing a tracked draft, mark it filed + link the sequence.
    let draft;
    if (b.draftId) {
      try {
        draft = await markSafetyReportFiled(String(b.draftId), filed.sequence.id, ctx);
      } catch (e) {
        if (!(e instanceof SafetyReportError)) throw e; // unknown/foreign draft id is non-fatal to the filing
      }
    }
    res.status(201).json({ ...filed, ...(draft ? { draft } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * File a 312.33 IND Annual Report as an `annual` eCTD sequence + m1.13 leaf.
 * Body: { submissionId, sequenceNumber }. When the report content is supplied,
 * the PDF is rendered, retained, and referenced by the leaf.
 */
router.post('/annual-report/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  if (!fileTargetValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  try {
    let source: RenderedLeafSource | undefined;
    if (b.productName && b.indNumber) {
      const pdf = await renderIndAnnualReportPdf(assembleIndAnnualReport(b));
      source = leafSourceFor(
        await storeRenderedLeafFile({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          bytes: pdf,
          mime: 'application/pdf',
          fileName: 'ind-annual-report.pdf',
          renderedFrom: 'ind_annual_report',
          sectionCode: 'm1.13',
        }),
      );
    }
    const filed = await persistAnnualReport(Number(b.submissionId), String(b.sequenceNumber), ctx, source);
    // When filing a tracked draft, mark it filed + link the sequence.
    let draft;
    if (b.draftId) {
      try {
        draft = await markAnnualReportFiled(String(b.draftId), filed.sequence.id, ctx);
      } catch (e) {
        if (!(e instanceof AnnualReportError)) throw e; // unknown/foreign draft id is non-fatal
      }
    }
    res.status(201).json({ ...filed, ...(draft ? { draft } : {}) });
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
    const filed = await persistAmendmentPlan(Number(b.submissionId), plan, String(b.sequenceNumber), ctx);
    // When filing a tracked draft, mark it filed + link the sequence.
    let draft;
    if (b.draftId) {
      try {
        draft = await markAmendmentFiled(String(b.draftId), filed.sequence.id, ctx);
      } catch (e) {
        if (!(e instanceof AmendmentError)) throw e; // unknown/foreign draft id is non-fatal
      }
    }
    res.status(201).json({ ...filed, ...(draft ? { draft } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
