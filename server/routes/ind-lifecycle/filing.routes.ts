/**
 * IND lifecycle — filing routes that persist a rendered document as an audited
 * eCTD sequence + leaves (with the rendered PDF's md5 as the leaf checksum).
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { assembleIndSafetyReport } from '../../services/ind-lifecycle/ind-safety-report-service';
import { composeE2bR3Icsr } from '../../services/ind-lifecycle/e2b-icsr-composer';
import { markSafetyReportFiled, getSafetyReport, SafetyReportError } from '../../services/ind-lifecycle/ind-safety-report-persistence';
import { markAnnualReportFiled, getAnnualReport, AnnualReportError } from '../../services/ind-lifecycle/ind-annual-report-persistence';
import { markAmendmentFiled, getAmendment, AmendmentError } from '../../services/ind-lifecycle/ind-amendment-persistence';
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
 * A tracked draft named on a file call is the draft being filed. The register
 * row is the reviewed record; marking it filed with a sequence whose content
 * came from a different event, IND or submission was possible because the
 * routes only checked the draft's tenant. Refusals: 404 when the draft is not
 * this tenant's, 409 when it is not this filing's, or is already filed.
 */
type DraftRefusal = { status: number; code: string; message: string };
async function loadDraft<T>(
  load: () => Promise<T>,
  isNotFound: (e: unknown) => boolean,
): Promise<{ draft: T } | { refusal: DraftRefusal }> {
  try {
    return { draft: await load() };
  } catch (e) {
    if (isNotFound(e)) return { refusal: { status: 404, code: 'DRAFT_NOT_FOUND', message: 'The named draft does not exist in this organization.' } };
    throw e;
  }
}
function draftRefusal(res: import('express').Response, r: DraftRefusal) {
  return res.status(r.status).json({ error: { code: r.code, message: r.message } });
}
function mismatch(what: string): DraftRefusal {
  return { status: 409, code: 'DRAFT_MISMATCH', message: `The named draft is for a different ${what}; it is not the draft this filing would file.` };
}
const ALREADY_FILED: DraftRefusal = { status: 409, code: 'ALREADY_FILED', message: 'The named draft has already been filed.' };

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
    if (b.draftId) {
      const loaded = await loadDraft(() => getSafetyReport(String(b.draftId), ctx), (e) => e instanceof SafetyReportError && e.code === 'NOT_FOUND');
      if ('refusal' in loaded) return draftRefusal(res, loaded.refusal);
      if (loaded.draft.status === 'filed') return draftRefusal(res, ALREADY_FILED);
      if (Number(loaded.draft.submissionId) !== Number(b.submissionId)) return draftRefusal(res, mismatch('submission'));
      if (String(loaded.draft.adverseEventId) !== String(event.id)) return draftRefusal(res, mismatch('adverse event'));
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
    if (b.draftId) {
      const loaded = await loadDraft(() => getAnnualReport(String(b.draftId), ctx), (e) => e instanceof AnnualReportError && e.code === 'NOT_FOUND');
      if ('refusal' in loaded) return draftRefusal(res, loaded.refusal);
      if (loaded.draft.status === 'filed') return draftRefusal(res, ALREADY_FILED);
      if (Number(loaded.draft.submissionId) !== Number(b.submissionId)) return draftRefusal(res, mismatch('submission'));
      if (b.indNumber && String(loaded.draft.indNumber) !== String(b.indNumber)) return draftRefusal(res, mismatch('IND'));
      // A draft whose required 312.33 sections are still open is not filed
      // silently. The caller may file it anyway by acknowledging the gaps,
      // and the response records that it did.
      if (Number(loaded.draft.gapCount) > 0 && b.acknowledgeGaps !== true) {
        return res.status(409).json({ error: { code: 'DRAFT_INCOMPLETE', message: `The named draft has ${loaded.draft.gapCount} open 312.33 section(s). Complete them, or file with acknowledgeGaps: true to record that they were filed open.`, gapCount: loaded.draft.gapCount } });
      }
    }
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
    // Filing a draft with open 312.33 sections is recorded on the response.
    const filedWithOpenGaps = draft && Number(draft.gapCount) > 0 ? Number(draft.gapCount) : undefined;
    res.status(201).json({ ...filed, ...(draft ? { draft } : {}), ...(filedWithOpenGaps ? { filedWithOpenGaps } : {}) });
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
    if (b.draftId) {
      const loaded = await loadDraft(() => getAmendment(String(b.draftId), ctx), (e) => e instanceof AmendmentError && e.code === 'NOT_FOUND');
      if ('refusal' in loaded) return draftRefusal(res, loaded.refusal);
      if (loaded.draft.status === 'filed') return draftRefusal(res, ALREADY_FILED);
      if (Number(loaded.draft.submissionId) !== Number(b.submissionId)) return draftRefusal(res, mismatch('submission'));
      if (b.indNumber && String(loaded.draft.indNumber) !== String(b.indNumber)) return draftRefusal(res, mismatch('IND'));
    }
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
