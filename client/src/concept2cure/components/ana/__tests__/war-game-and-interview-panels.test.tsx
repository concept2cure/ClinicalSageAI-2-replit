// @vitest-environment jsdom
/**
 * What the war-game report and the finished interview say on screen
 * (2026-11-11, R1).
 *
 * The engine has emitted `war_game_report` since the war game landed, and
 * `intelligence_flow_complete` since the interviews did. Nothing drew either:
 * WarGameReport.tsx was deleted on 2026-08-04 with the rail's dead code, and
 * the completion never had a view. The honest half matters most: a check the
 * interview could not feed is "not assessed", never a pass.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { WarGameReport } from '@shared/types/intelligence-questions';

import { InterviewCompletePanel } from '../InterviewCompletePanel';
import { WarGameReportPanel } from '../WarGameReportPanel';
import { interviewCompleteFixture, warGameReportFixture } from './war-game-and-interview-panels.fixture';

afterEach(cleanup);
const panel = () => screen.getByRole('region', { name: 'War game report' }).textContent ?? '';

describe('WarGameReportPanel', () => {
  it('draws the assessment, each finding with its basis, and how much was assessed', () => {
    render(<WarGameReportPanel report={warGameReportFixture()} />);
    expect(panel()).toContain('Significant gaps');
    expect(panel()).toContain('18 of 32 checks assessed');
    expect(panel()).toContain('Integrated Summary of Effectiveness (ISE) Missing');
    expect(panel()).toContain('21 CFR 314.50(d)(5)');
    expect(panel()).toContain('Prepare the ISE.');
  });

  it('keeps criticals open and folds the rest under one disclosure', () => {
    const { container } = render(<WarGameReportPanel report={warGameReportFixture()} />);
    const folded = Array.from(container.querySelectorAll('details')).find((d) => d.textContent?.includes('No Pharmacovigilance Plan'));
    expect(folded?.querySelector('summary')?.textContent).toMatch(/Show 1 more finding/);
    expect(folded?.textContent).not.toContain('Integrated Summary of Effectiveness');
  });

  it('names the checks it could not assess, and never reads them as passed', () => {
    render(<WarGameReportPanel report={warGameReportFixture({ findings: [], overallAssessment: 'needs_work' })} />);
    expect(panel()).toContain('Refuse-to-file assessment not performed');
    expect(panel()).toMatch(/14 checks could not be assessed/);
    expect(panel()).not.toMatch(/audit[- ]ready/i);
    expect(panel()).toMatch(/No finding from the 18 checks assessed/);
  });

  it('a war game that assessed nothing says so, whatever assessment word it carries', () => {
    render(<WarGameReportPanel report={warGameReportFixture({ findings: [], rulesAssessed: 0, notAssessed: [], overallAssessment: 'audit_ready' })} />);
    expect(panel()).toMatch(/Nothing was assessed/);
    expect(panel()).toContain('Not assessed');
    expect(panel()).not.toMatch(/Audit-ready/);
  });

  /* "Nothing found" is a clearance claim, so it needs the report's own record
     that checks ran (v2/assessmentState.ts). An empty findings list alone is
     the same in a war game that ran and found nothing, one that could run no
     check, and one whose report does not say. Only the first may reassure. */
  it('says nothing was found only when the report records that checks ran', () => {
    const NOTHING_FOUND = /No finding from the/;

    render(<WarGameReportPanel report={warGameReportFixture({ findings: [], rulesAssessed: 18 })} />);
    expect(panel()).toMatch(/No finding from the 18 checks assessed/);
    cleanup();

    render(<WarGameReportPanel report={warGameReportFixture({ findings: [], rulesAssessed: 0, notAssessed: [] })} />);
    expect(panel()).toContain('No findings, because no check could run.');
    expect(panel()).not.toMatch(NOTHING_FOUND);
    cleanup();

    /* A report that does not record how many checks ran is not one where none
       ran, and not one that came back clean. */
    const unrecorded = warGameReportFixture({ findings: [], notAssessed: [] }) as Partial<WarGameReport>;
    delete unrecorded.rulesAssessed;
    delete unrecorded.rulesTotal;
    render(<WarGameReportPanel report={unrecorded as WarGameReport} />);
    expect(panel()).toMatch(/does not record how many checks/);
    expect(panel()).not.toMatch(NOTHING_FOUND);
    expect(panel()).not.toMatch(/no check could run|Nothing was assessed/);
    expect(panel()).not.toMatch(/Significant gaps/);
    cleanup();

    /* Findings that cannot be read are never drawn as none. */
    const unreadable = { ...warGameReportFixture(), findings: undefined } as unknown as WarGameReport;
    render(<WarGameReportPanel report={unreadable} />);
    expect(panel()).toMatch(/findings could not be read/);
    expect(panel()).not.toMatch(NOTHING_FOUND);
  });
});

describe('InterviewCompletePanel', () => {
  it('draws the summary and each issue with its basis', () => {
    render(<InterviewCompletePanel completion={interviewCompleteFixture()} />);
    const text = screen.getByRole('region', { name: 'Interview complete' }).textContent ?? '';
    expect(text).toContain('NDA Submission');
    expect(text).toContain('Completed 24 questions');
    expect(text).toContain('User fee not paid');
    expect(text).toContain('FD&C Act section 736');
  });

  it('with no issues it adds no empty issues heading', () => {
    render(<InterviewCompletePanel completion={{ ...interviewCompleteFixture(), issues: [] }} />);
    expect(screen.getByRole('region', { name: 'Interview complete' }).textContent).not.toContain('Issues the interview found');
  });
});
