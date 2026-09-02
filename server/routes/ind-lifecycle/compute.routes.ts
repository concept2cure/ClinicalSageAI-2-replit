/**
 * IND lifecycle — pure compute routes (no DB): readiness, timeline, clock,
 * action items, and stateless sequence validation.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { evaluateIndReadiness } from '../../services/ind-lifecycle/ind-readiness-service';
import { evaluateRegulatoryClock } from '../../services/ind-lifecycle/ind-regulatory-clock';
import { buildIndTimeline } from '../../services/ind-lifecycle/ind-timeline-service';
import { validateSequenceLeaves, isSequenceFilingType } from '../../services/ind-lifecycle/ind-sequence-validation';
import { deriveIndActionItems } from '../../services/ind-lifecycle/ind-action-items';
import { validateSequenceTypeTransition, auditSequenceHistory } from '../../services/ind-lifecycle/ind-sequence-lifecycle-validator';
import { AUTHOR, limiter, body, fail, readinessFrom, validationFrom, FILING_TYPE_VALUES } from './shared';

const router = Router();

/**
 * IND filing readiness — deterministic verdict over the 108-section blueprint +
 * Module 1 forms + safety clock. Body is IndReadinessInput.
 */
router.post('/readiness', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (b.filingType !== 'initial' && b.filingType !== 'amendment') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: "filingType must be 'initial' or 'amendment'." } });
  }
  try {
    res.json(
      evaluateIndReadiness({
        filingType: b.filingType,
        sectionStatus: b.sectionStatus ?? {},
        completedForms: b.completedForms,
        overdueSafetyReports: b.overdueSafetyReports,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Project the IND regulatory timeline — 30-day safe-to-proceed + annual-report
 * due-date milestones (21 CFR 312.40 / 312.33). Body: { receiptDate, ... }.
 */
router.post('/timeline', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.receiptDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'receiptDate (ISO) is required.' } });
  }
  try {
    res.json(buildIndTimeline(b));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Evaluate the IND regulatory clock — 30-day safe-to-proceed + clinical-hold
 * state (21 CFR 312.40 / 312.42). Body: { receiptDate, events?, asOf? }.
 */
router.post('/clock', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.receiptDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'receiptDate (ISO) is required.' } });
  }
  try {
    res.json(evaluateRegulatoryClock({ receiptDate: b.receiptDate, events: b.events, asOf: b.asOf }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Prioritized next-actions for an IND, computed from the supplied analysis
 * inputs. Body: { readinessInput?, clockInput?, timelineInput?,
 * sequenceValidationInput?, overdueSafetyReports? }.
 */
router.post('/action-items', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  try {
    const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
    const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;
    res.json(
      deriveIndActionItems({
        readiness: readinessFrom(b.readinessInput),
        clock,
        timeline,
        sequenceValidation: validationFrom(b.sequenceValidationInput),
        overdueSafetyReports: b.overdueSafetyReports,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Validate a set of leaves against the required IND section map (pure).
 * Body: { filingType: 'initial'|'amendment'|'safety_report'|'annual'|'response'|'withdrawal', leaves: [{ sectionCode }] }.
 * (There is no stored sequence to default the filing type from here; the
 * sequence-scoped GET /sequence/:seqId/validate derives it when omitted.)
 */
router.post('/sequence/validate', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!isSequenceFilingType(b.filingType) || !Array.isArray(b.leaves)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `filingType (${FILING_TYPE_VALUES}) and leaves[] are required.` } });
  }
  try {
    res.json(validateSequenceLeaves({ filingType: b.filingType, leaves: b.leaves }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Validate a proposed eCTD sequence TYPE against the submission's history (pure):
 * the first sequence must be an original; amendment/response/variation/annual/
 * withdrawal require a prior original; no second original; withdrawal is terminal.
 * Body: { existingSequenceTypes: string[], proposedType }.
 */
router.post('/sequence/lifecycle-validate', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!Array.isArray(b.existingSequenceTypes) || !b.proposedType) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'existingSequenceTypes[] and proposedType are required.' } });
  }
  try {
    res.json(validateSequenceTypeTransition({ existingSequenceTypes: b.existingSequenceTypes, proposedType: b.proposedType }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Audit a submission's entire sequence-type history (pure): replay it in order
 * and flag any sequence that was an illegal transition (amendment before an
 * original, a second original, anything after a withdrawal).
 * Body: { sequenceTypes: string[] }.
 */
router.post('/sequence/history-audit', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!Array.isArray(b.sequenceTypes)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sequenceTypes[] is required.' } });
  }
  try {
    res.json(auditSequenceHistory(b.sequenceTypes));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
