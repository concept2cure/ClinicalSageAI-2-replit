/**
 * A rendered body says when its counts are the organization's (D2, 2026-10-29;
 * docs/evidence/D2-REPORT-SCOPE-HONESTY/).
 *
 * Under an open project the domain types run at `project` scope, and their
 * engines count the organization's records (`computedScope: 'organization'`).
 * The register body says so: "Counts are the organisation's records of this
 * kind; they are not limited to one program." The lifecycle obligation
 * calendar did not, although it lists every accessible project's obligations
 * under the open project's name. These cases hold that the calendar's body
 * carries the register's own sentence, read from the carried `computedScope`
 * only, and that the sentence reaches the exported PDF.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db', () => ({ pool: {}, db: {}, getPool: () => ({}) }));

import { renderReport, type RenderInput } from '../render';
import type { RenderedReport, ReportSection } from '../types';
import { calculateLifecycleCalendar, LIFECYCLE_CALENDAR_LIMIT, LIFECYCLE_CALENDAR_TYPE } from '../../lifecycle-calendar';
import { buildRunPdf } from '../../pdf/run-pdf';

const AT = '2026-10-29T00:00:00.000Z';
/* The PDF writer refuses without its Noto fonts (writer.ts, REPORT_PDF_FONTS_UNAVAILABLE).
   Where they are not installed, the PDF case cannot run and says so as a skip. */
const PDF_FONTS = fs.existsSync(path.join(process.env.REPORT_PDF_NOTO_CORE_DIR ?? '/usr/share/fonts/truetype/noto', 'NotoSans-Regular.ttf'));
const REGISTER_SENTENCE = "Counts are the organisation's records of this kind; they are not limited to one program.";

const calendar = calculateLifecycleCalendar({ observed_at: AT, obligation_count: 2, event_count: 0, events: [],
  obligations: [
    { id: 1, product_id: null, product_name: null, submission_id: null, project_id: null, region: 'other', obligation_type: 'annual_report', classification: null, title: 'Unlinked obligation', status: 'planned', due_date: '2026-12-01', submitted_date: null, recurrence_months: null },
    { id: 2, product_id: null, product_name: null, submission_id: 7, project_id: 31, region: 'fda', obligation_type: 'periodic_report', classification: 'DSUR', title: 'Another project’s obligation', status: 'in_preparation', due_date: '2026-11-20', submitted_date: null, recurrence_months: 12 },
  ],
});

/** The calendar run as an open project's report: project scope, organization computation. */
function calendarInput(summary: Record<string, unknown>): RenderInput {
  return {
    reportTypeId: LIFECYCLE_CALENDAR_TYPE, reportTypeLabel: 'Lifecycle Obligation Calendar', scopeType: 'project', scopeId: '12',
    providers: [{ provider: 'lifecycle_obligation_calendar', status: 'partial', observedAt: AT }],
    blockers: [LIFECYCLE_CALENDAR_LIMIT], status: 'partial', generatedAt: AT,
    summary: { domain: { lifecycleCalendar: calendar }, scopeLabel: 'ABC-101', ...summary },
  };
}
const summaries = (section: ReportSection | undefined) =>
  (section?.blocks ?? []).flatMap((block) => (block.kind === 'summary' ? [block.text] : []));
const section = (report: RenderedReport, id: string) => report.sections.find((s) => s.id === id);

describe('the organization statement in the rendered body', () => {
  it('the register states it (the sentence the calendar reuses)', () => {
    const report = renderReport({
      reportTypeId: 'ha.commitment_register', reportTypeLabel: 'HA Interaction & Commitment Register', scopeType: 'project', scopeId: '12',
      providers: [{ provider: 'ha_commitments', status: 'ready', observedAt: AT }], blockers: [], status: 'partial', generatedAt: AT,
      summary: { domain: { commitments: 3, byStatus: { open: 3 }, overdue: 1 }, computedScope: 'organization', scopeLabel: 'ABC-101' },
    });
    expect(summaries(section(report, 'register'))).toContain(REGISTER_SENTENCE);
  });

  it('the lifecycle calendar under an open project states the register’s sentence above its obligations', () => {
    const report = renderReport(calendarInput({ computedScope: 'organization' }));
    expect(report.computedScope).toBe('organization');
    const obligations = section(report, 'lifecycle-obligations');
    expect(summaries(obligations)).toContain(REGISTER_SENTENCE);
    // Before the tables, so it is read before the rows from other projects.
    const first = obligations!.blocks.findIndex((b) => b.kind === 'table');
    expect(obligations!.blocks.findIndex((b) => b.kind === 'summary' && b.text === REGISTER_SENTENCE)).toBeLessThan(first);
    // The register and the calendar say it in one sentence, not two.
    expect(JSON.stringify(report).split(REGISTER_SENTENCE).length - 1).toBe(1);
  });

  it('is read from the carried computedScope, not the type: a calendar computed over the project does not say it', () => {
    const report = renderReport(calendarInput({ computedScope: 'project' }));
    expect(JSON.stringify(report)).not.toContain(REGISTER_SENTENCE);
  });

  it.skipIf(!PDF_FONTS)('reaches the exported PDF body', async () => {
    const report = renderReport(calendarInput({ computedScope: 'organization' }));
    const { bytes } = await buildRunPdf({
      run: { id: 17, runUuid: null, reportTypeId: LIFECYCLE_CALENDAR_TYPE, scopeType: 'project', scopeId: '12', status: 'partial', confidence: null, createdAt: AT },
      report, typeLabel: 'Lifecycle Obligation Calendar', seal: null, runBy: 'Synthetic local actor', exportId: 'scope-honesty', exportedAt: AT,
    });
    const { PDFParse } = (await import('pdf-parse')) as unknown as { PDFParse: new (o: { data: Uint8Array }) => { getText(): Promise<{ text: string }>; destroy(): Promise<void> } };
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const text = (await parser.getText()).text.replace(/\s+/g, ' ');
      expect(text).toContain('Scope: ABC-101');
      expect(text).toContain('Data scope: organization');
      expect(text).toContain(REGISTER_SENTENCE);
    } finally {
      await parser.destroy();
    }
  });
});
