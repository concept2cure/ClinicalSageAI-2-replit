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
import {
  assembleIndAnnualReport,
  parseAnnualReportInput,
  type AnnualReportGap,
  type IndAnnualReportModel,
} from '../../services/ind-lifecycle/ind-annual-report-service';
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
import { getSubmission } from '../../services/submission-service/submission-service';
import { getSponsor } from '../../services/ind-master-data/ind-master-data-service';
import { assembleFormMetadata } from '../../services/ind-forms/form-context-assembler';
import { generateIndForm, FORM_1571 } from '../../services/ind-forms';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, coerceEventDates } from './shared';

const router = Router();

/** True when submissionId is a positive int and sequenceNumber is 4 digits. */
function fileTargetValid(b: any): boolean {
  const submissionId = Number(b.submissionId);
  return Number.isInteger(submissionId) && submissionId > 0 && /^\d{4}$/.test(String(b.sequenceNumber ?? ''));
}


/**
 * Render the Module 1 transmittal form — FDA 1571 — for the m1.1 leaf every IND
 * sequence carries, from the sponsor registry and the submission record.
 *
 * The platform has produced a genuine filled 1571 from the vendored official FDA
 * template for a while (ind-form-fill-service, dynamic-XFA datasets fill), and
 * the filing paths placed an m1.1 leaf with nothing behind it. This closes that:
 * the leaf points at the real form when one can be produced.
 *
 * Fail closed, three ways — a blank or partial official FDA form filed as the
 * transmittal is worse than a leaf that says it has no document yet:
 *   - no sponsorId, or the sponsor/submission cannot be read → no source;
 *   - the fill fell back off the official template → no source;
 *   - the form is missing a required field → no source, naming the fields.
 * The reason travels back on the filing response.
 */
async function form1571LeafSource(
  b: Record<string, unknown>,
  ctx: { organizationId: number; userId: number },
): Promise<{ source?: RenderedLeafSource; attached: boolean; reason?: string }> {
  const sponsorId = typeof b.sponsorId === 'string' ? b.sponsorId.trim() : '';
  if (!sponsorId) {
    return { attached: false, reason: 'No sponsorId was supplied, so Form FDA 1571 was not produced; the m1.1 leaf has no document yet.' };
  }
  try {
    const [sponsor, submission] = await Promise.all([
      getSponsor(sponsorId, ctx),
      getSubmission(Number(b.submissionId), ctx),
    ]);
    const overrides = (b.form1571 && typeof b.form1571 === 'object' ? b.form1571 : {}) as Record<string, unknown>;
    const meta = assembleFormMetadata({
      sponsor,
      overrides: {
        drugName: submission.productName ?? submission.title,
        serialNumber: String(b.sequenceNumber ?? ''),
        ...(typeof b.indNumber === 'string' && b.indNumber ? { indNumber: b.indNumber } : {}),
        ...overrides,
      },
    });
    const form = await generateIndForm(FORM_1571, meta);
    if (!form.usedOfficialTemplate) {
      return { attached: false, reason: 'Form FDA 1571 did not fill on the official FDA template, so it was not attached to the m1.1 leaf.' };
    }
    if (form.missingRequired.length > 0) {
      return {
        attached: false,
        reason: `Form FDA 1571 is missing required field(s): ${form.missingRequired.join(', ')}. It was not attached to the m1.1 leaf.`,
      };
    }
    const stored = await storeRenderedLeafFile({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      bytes: Buffer.from(form.pdfBytes),
      mime: 'application/pdf',
      fileName: 'form-fda-1571.pdf',
      renderedFrom: 'ind_form_1571',
      sectionCode: 'm1.1',
    });
    /* Attached — and the response names the REQUIRED boxes still blank on the
       PDF just filed.

       The refusal above gates on `missingRequired`, which is a statement about
       the DATA the caller supplied. `requiredFieldsLeftBlank` is the other
       fact: what the rendered form actually carries. On the 1571 they differ by
       design — `ind_type` and `phase_of_study` are deliberately unmapped
       because they are the sponsor's own attestations — so a data-complete 1571
       still renders with two required boxes empty, and those bytes become the
       m1.1 leaf of a real amendment sequence.

       Not a refusal: they are the sponsor's boxes to tick, and refusing would
       block every 1571 amendment. But `{ attached: true }` with no reason told
       the filer the transmittal form was done. Both facts, or neither. */
    const blank = Array.isArray(form.requiredFieldsLeftBlank) ? form.requiredFieldsLeftBlank : [];
    return {
      source: leafSourceFor(stored),
      attached: true,
      ...(blank.length > 0
        ? {
            reason:
              `Form FDA 1571 was attached to the m1.1 leaf, and ${blank.length} required ` +
              `box(es) are blank on it for the sponsor to complete and sign: ${blank.join(', ')}.`,
          }
        : {}),
    };
  } catch (err) {
    return {
      attached: false,
      reason: `Form FDA 1571 could not be produced (${err instanceof Error ? err.message : String(err)}); the m1.1 leaf has no document yet.`,
    };
  }
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
      // P-20: no verdict is not "not reportable" — say which one this is.
      return document.obligation === 'NOT_DETERMINED'
        ? res.status(422).json({ error: { code: 'NOT_DETERMINED', message: 'The expedited-reporting verdict is not determined: expectedness not assessed. Record expectedness against the IB / Reference Safety Information first; nothing was filed.' } })
        : res.status(422).json({ error: { code: 'NOT_REPORTABLE', message: 'Event is not an expedited IND safety report; nothing to file.' } });
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
    // The m1.1 transmittal form, from the sponsor registry when one is named.
    const form1571 = await form1571LeafSource(b, ctx);
    if (form1571.source) sources['m1.1'] = form1571.source;
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
    res.status(201).json({ ...filed, form1571, ...(draft ? { draft, meta: { auditTrail: draft.auditTrail } } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

/** The open 312.33 sections of a report the filer has not acknowledged by section key (`acknowledgedGaps`). */
function unacknowledgedGaps(gaps: AnnualReportGap[], acknowledged: unknown): AnnualReportGap[] {
  const ack = new Set(Array.isArray(acknowledged) ? acknowledged.map(String) : []);
  return gaps.filter((g) => !ack.has(g.sectionKey));
}

/**
 * File a 312.33 IND Annual Report as an `annual` eCTD sequence + m1.13 leaf.
 * Body: { submissionId, sequenceNumber } and EITHER draftId (the tracked draft;
 * its stored report is what is filed) OR the report itself (productName,
 * indNumber, reporting period, …). An open 312.33 section is filed only when
 * acknowledged: by its section key in acknowledgedGaps (or, for a draft,
 * acknowledgeGaps: true), and the response names the sections filed open.
 *
 * 2026-10-15: without a draft the body's report was filed with its open
 * sections unacknowledged — or, lacking productName / indNumber, an annual
 * sequence with no report at all; with a draft, the PDF was rendered from the
 * body rather than from the draft that had been gated.
 */
router.post('/annual-report/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  if (!fileTargetValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  try {
    let report: IndAnnualReportModel;
    if (b.draftId) {
      const loaded = await loadDraft(() => getAnnualReport(String(b.draftId), ctx), (e) => e instanceof AnnualReportError && e.code === 'NOT_FOUND');
      if ('refusal' in loaded) return draftRefusal(res, loaded.refusal);
      if (loaded.draft.status === 'filed') return draftRefusal(res, ALREADY_FILED);
      if (Number(loaded.draft.submissionId) !== Number(b.submissionId)) return draftRefusal(res, mismatch('submission'));
      if (b.indNumber && String(loaded.draft.indNumber) !== String(b.indNumber)) return draftRefusal(res, mismatch('IND'));
      report = loaded.draft.model as unknown as IndAnnualReportModel;
      if (!Array.isArray(report?.sections) || !Array.isArray(report?.gaps)) {
        throw new Error('The named annual-report draft holds no readable 312.33 section model.');
      }
      // A draft whose required 312.33 sections are still open is not filed
      // silently. The caller may file it anyway by acknowledging the gaps,
      // and the response records that it did.
      if (report.gaps.length > 0 && b.acknowledgeGaps !== true && unacknowledgedGaps(report.gaps, b.acknowledgedGaps).length > 0) {
        return res.status(409).json({ error: { code: 'DRAFT_INCOMPLETE', message: `The named draft has ${report.gaps.length} open 312.33 section(s). Complete them, or acknowledge each one (acknowledgedGaps, by section key) to record that they were filed open.`, gapCount: report.gaps.length } });
      }
    } else {
      if (!b.productName || !b.indNumber) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Name the tracked draft (draftId), or supply the report to file: productName, indNumber and the reporting period are required. Nothing was filed.' } });
      }
      report = assembleIndAnnualReport(parseAnnualReportInput(b));
      const open = unacknowledgedGaps(report.gaps, b.acknowledgedGaps);
      if (open.length > 0) {
        return res.status(409).json({
          error: {
            code: 'GAPS_NOT_ACKNOWLEDGED',
            message:
              `${open.length} open 312.33 section(s) of this report are not acknowledged: ` +
              `${open.map((g) => `${g.heading} (${g.cfrRef})`).join('; ')}. Complete them, or acknowledge each one ` +
              '(acknowledgedGaps, by section key) to record that it is filed open. Nothing was filed.',
            openGaps: open.map(({ sectionKey, heading, cfrRef }) => ({ sectionKey, heading, cfrRef })),
          },
        });
      }
    }
    const sources: LeafSourceBySection = {
      'm1.13': leafSourceFor(
        await storeRenderedLeafFile({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          bytes: await renderIndAnnualReportPdf(report),
          mime: 'application/pdf',
          fileName: 'ind-annual-report.pdf',
          renderedFrom: 'ind_annual_report',
          sectionCode: 'm1.13',
        }),
      ),
    };
    const form1571 = await form1571LeafSource(b, ctx);
    if (form1571.source) sources['m1.1'] = form1571.source;
    const filed = await persistAnnualReport(Number(b.submissionId), String(b.sequenceNumber), ctx, sources);
    // When filing a tracked draft, mark it filed + link the sequence.
    let draft;
    if (b.draftId) {
      try {
        draft = await markAnnualReportFiled(String(b.draftId), filed.sequence.id, ctx);
      } catch (e) {
        if (!(e instanceof AnnualReportError)) throw e; // unknown/foreign draft id is non-fatal
      }
    }
    // The open 312.33 sections filed (acknowledged above) are recorded on the response.
    const openSectionsFiled = report.gaps.map((g) => g.sectionKey);
    res.status(201).json({
      ...filed,
      form1571,
      ...(draft ? { draft, meta: { auditTrail: draft.auditTrail } } : {}),
      ...(openSectionsFiled.length > 0 ? { filedWithOpenGaps: openSectionsFiled.length, openSectionsFiled } : {}),
    });
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
    const form1571 = await form1571LeafSource(b, ctx);
    const filed = await persistAmendmentPlan(
      Number(b.submissionId),
      plan,
      String(b.sequenceNumber),
      ctx,
      form1571.source ? { 'm1.1': form1571.source } : undefined,
    );
    // When filing a tracked draft, mark it filed + link the sequence.
    let draft;
    if (b.draftId) {
      try {
        draft = await markAmendmentFiled(String(b.draftId), filed.sequence.id, ctx);
      } catch (e) {
        if (!(e instanceof AmendmentError)) throw e; // unknown/foreign draft id is non-fatal
      }
    }
    res.status(201).json({ ...filed, form1571, ...(draft ? { draft, meta: { auditTrail: draft.auditTrail } } : {}) });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
