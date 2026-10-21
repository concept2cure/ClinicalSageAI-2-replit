/**
 * The IND safety-report card (21 CFR 312.32) — WITHHELD from this release by
 * decision P-32, 2026-10-15 (docs/LAUNCH_DEFINITION_OF_DONE.md, "### P-32").
 *
 * Retained source location: tests/fixtures/withheld/indSafetyReportCard.ts.
 * Runtime and qualification code is preserved; only the test harness imports it.
 *
 * ── Why this file exists and nothing on screen imports it ────────────────────
 * P-32 made the IND lifecycle a feature of the Submission Center launch app
 * and kept 15-day safety reporting and ICSR transmission shut. The routes this
 * card calls (/api/ind-lifecycle/safety-report, its /pdf and /file) are
 * claimed by the `pharmacovigilance` surface, outside the release, so
 * production refuses them 403 LAUNCH_SCOPE. A card that offers them would be a
 * button that is refused every time it is pressed.
 *
 * The decision is "hidden, not deleted": the card, its intake and its honesty
 * rules (P-20, P-21, QA 2026-10-08 j7) are kept here, intact and tested
 * (__tests__/indLifecycleDeliverables.test.tsx, "the withheld safety-report
 * card"), so it returns as it was rather than being rebuilt. It lives OUTSIDE
 * IndLifecycle.tsx because ci:launch-scope-api walks the IND screen's import
 * graph and refuses any path in it that production refuses — keeping the
 * card's route literals there would fail that gate, which is the gate being
 * right. The direction of the import is the point: this file imports from the
 * screen, the screen never imports this file.
 *
 * ── To offer it again (a launch decision, not a session's) ────────────────────
 *   1. Move the three /api/ind-lifecycle safety prefixes from `pharmacovigilance`
 *      (shared/constants/ui-surface-registry.ui-v2.ts) to `ind-checklist`.
 *   2. Clear `withheld` on the safety-report entry of INDL_DELIVERABLES
 *      (fixtures/ind-lifecycle-data.ts).
 *   3. In IndLifecycle.tsx, add `'safety-report': safetyReportDeliverable({ fv, fmt })`
 *      to the `wired` map.
 *   4. Turn the "not offered" tests back into rendered-card tests.
 */
import { NOT_STATED, OPTS, sectionsText, type DelivView, type WiredDeliverable } from '../../../client/src/concept2cure/v2/surfaces/IndLifecycle';

/** The server's expedited verdict, in words (ind-safety-report-service). */
export const SAFETY_VERDICT: Record<string, string> = {
  SEVEN_DAY: '7-calendar-day IND safety report',
  FIFTEEN_DAY: '15-calendar-day IND safety report',
  NOT_REPORTABLE: 'not reportable as an individual expedited report',
  NOT_DETERMINED: 'not determined: expectedness not assessed',
};

/* Field option lists — the server enums, stated once. */
export const EVENT_TYPES = [
  { v: 'SAE', label: 'SAE — serious adverse event' },
  { v: 'SUSAR', label: 'SUSAR' },
  { v: 'AESI', label: 'AESI' },
  { v: 'AE', label: 'AE — non-serious' },
];
export const SERIOUSNESS = OPTS(['death', 'life_threatening', 'hospitalization', 'disability', 'congenital_anomaly', 'medically_important']);
export const CAUSALITY = OPTS(['definite', 'probable', 'possible', 'unlikely', 'unrelated']);
export const OUTCOME = OPTS(['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown']);
export const EXPECTEDNESS = [
  /* P-20 follow-up: an unassessed expectedness leaves the verdict undecided
     only for a serious, suspected event; a non-serious or not-suspected one is
     not expedited on those stated facts (the server's rationale says so). */
  { v: '', label: 'Not assessed — decides the verdict only for a serious, suspected event' },
  { v: 'expected', label: 'Expected (listed in RSI)' },
  { v: 'unexpected', label: 'Unexpected (not listed in RSI)' },
];

/** Safety-report intake: only what the user entered goes up — an absent field
    reaches the server as absent, so classification never runs on invented
    data. The four determinations used to go up through `sel`, which sent each
    select's FIRST option when untouched (SAE / death / definite / recovered),
    and the report asserted them (QA 2026-10-08, j7). They start unstated and
    the server refuses, naming each one, until the person states it. An
    un-assessed expectedness stays absent and the server reports it as not
    recorded — no expedited clock starts. `fv` reads a card field, trimmed. */
export function safetyEventPayload(fv: (key: string) => string): Record<string, unknown> {
  const ev: Record<string, unknown> = {};
  if (fv('sr.eventType')) ev.eventType = fv('sr.eventType');
  if (fv('sr.seriousness')) ev.seriousnessCriteria = fv('sr.seriousness');
  if (fv('sr.causality')) ev.causality = fv('sr.causality');
  if (fv('sr.outcome')) ev.outcome = fv('sr.outcome');
  if (fv('sr.patientId')) ev.patientId = fv('sr.patientId');
  if (fv('sr.description')) ev.eventDescription = fv('sr.description');
  if (fv('sr.country')) ev.countryOfOccurrence = fv('sr.country');
  if (fv('sr.expectedness')) ev.expectedness = fv('sr.expectedness');
  // P-20: the onset is a date or stated explicitly as unknown. Both at once
  // go up as both, and the server refuses rather than choosing for them.
  if (fv('sr.onsetUnknown')) {
    if (fv('sr.onset')) {
      ev.onsetDate = fv('sr.onset');
      ev.onsetDateUnknown = true;
    } else {
      ev.onsetDate = 'unknown';
    }
  } else if (fv('sr.onset')) {
    ev.onsetDate = fv('sr.onset');
  }
  if (fv('sr.aware')) ev.reportDate = fv('sr.aware');
  return { event: ev };
}

/** The server's classification and document, as the card shows them. */
export function safetyReportView(json: unknown, fmt: (d: Date | null) => string): DelivView | null {
  const j = json as { classification?: any; document?: any; amendmentIntent?: unknown } | null;
  const cls = j?.classification;
  const doc = j?.document;
  if (!cls || !doc) return null;
  const deadline = cls.deadline ? new Date(cls.deadline) : null;
  const notDetermined = cls.obligation === 'NOT_DETERMINED';
  const head = [
    `Expedited verdict: ${SAFETY_VERDICT[String(cls.obligation)] ?? String(cls.obligation)}`,
    deadline && !Number.isNaN(deadline.getTime()) ? `Deadline: ${fmt(deadline)}` : '',
    String(cls.rationale ?? ''),
  ].filter(Boolean).join('\n');
  const nothingToFile = j?.amendmentIntent == null;
  return {
    text: head + '\n\n' + sectionsText(doc.sections),
    gaps: [],
    canFile: !nothingToFile,
    // P-20: no verdict is not "not reportable" — each says what it is.
    fileNote: !nothingToFile
      ? undefined
      : notDetermined
        ? 'No expedited-reporting verdict: expectedness has not been assessed against the IB / Reference Safety Information. Record it to obtain one — there is nothing to file until then.'
        : 'The server classified this event as not reportable as an individual expedited IND safety report — there is nothing to file.',
  };
}

/** The card, in the shape IndLifecycle.tsx's generic runner drives. */
export function safetyReportDeliverable(deps: {
  fv: (key: string) => string;
  fmt: (d: Date | null) => string;
}): WiredDeliverable {
  return {
    assemblePath: '/api/ind-lifecycle/safety-report',
    pdf: { path: '/api/ind-lifecycle/safety-report/pdf', filename: 'ind-safety-report.pdf' },
    file: { path: '/api/ind-lifecycle/safety-report/file' },
    fields: [
      { key: 'sr.patientId', label: 'De-identified patient id', kind: 'text' },
      { key: 'sr.description', label: 'Event description', kind: 'textarea' },
      { key: 'sr.eventType', label: 'Event type', kind: 'select', options: EVENT_TYPES, placeholder: NOT_STATED },
      { key: 'sr.seriousness', label: 'Seriousness criterion (ICH E2A)', kind: 'select', options: SERIOUSNESS, placeholder: NOT_STATED },
      { key: 'sr.causality', label: 'Causality (WHO-UMC)', kind: 'select', options: CAUSALITY, placeholder: NOT_STATED },
      { key: 'sr.outcome', label: 'Outcome', kind: 'select', options: OUTCOME, placeholder: NOT_STATED },
      { key: 'sr.expectedness', label: 'Expectedness vs RSI', kind: 'select', options: EXPECTEDNESS },
      { key: 'sr.onset', label: 'Onset date', kind: 'date' },
      { key: 'sr.onsetUnknown', label: 'Onset date unknown', kind: 'checkbox' },
      { key: 'sr.aware', label: 'Sponsor awareness date (clock start)', kind: 'date' },
      { key: 'sr.country', label: 'Country of occurrence (ISO-2)', kind: 'text', placeholder: 'e.g. US' },
    ],
    payload: () => safetyEventPayload(deps.fv),
    toView: (json: unknown) => safetyReportView(json, deps.fmt),
  };
}
