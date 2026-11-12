/**
 * Fixtures for the war-game report and the finished interview, shared by the
 * panel tests here and the conversation's mounting test
 * (v2/__tests__/conversationRailTwins.test.tsx).
 */
import type { IntelligenceFlowCompleteEvent, WarGameReport } from '@shared/types/intelligence-questions';

export const warGameReportFixture = (over: Partial<WarGameReport> = {}): WarGameReport => ({
  id: 'wg_1', category: 'nda', sourceFlowId: 'nda-submission-v1', timestamp: '2026-11-11T00:00:00Z',
  overallScore: 82, overallAssessment: 'significant_gaps', regulatoryRiskLevel: 'high',
  findings: [
    {
      id: 'nda_no_ise', dimension: 'completeness', severity: 'critical',
      title: 'Integrated Summary of Effectiveness (ISE) Missing',
      question: 'Where is the integrated summary of effectiveness?',
      observation: 'The applicant states no ISE has been prepared.',
      requirement: 'An NDA includes an integrated summary of effectiveness.',
      reference: '21 CFR 314.50(d)(5)', recommendation: 'Prepare the ISE.', relatedFields: ['integrated_summary_effectiveness'],
    },
    {
      id: 'nda_no_pv_plan', dimension: 'risk_identification', severity: 'warning',
      title: 'No Pharmacovigilance Plan', question: 'q', observation: 'No plan is described.',
      requirement: 'A plan is expected.', reference: 'ICH E2E', recommendation: 'Describe the plan.', relatedFields: [],
    },
  ],
  dimensionScores: {} as WarGameReport['dimensionScores'],
  executiveSummary: 'War Game assessment: Significant Gaps Identified.', topPriorities: [],
  rulesTotal: 32, rulesAssessed: 18,
  notAssessed: [{ ruleId: 'nda_rtf', title: 'Refuse-to-file assessment not performed', unaskedFields: ['rtf_assessment'] }],
  ...over,
});

export const interviewCompleteFixture = (): IntelligenceFlowCompleteEvent => ({
  flowId: 'nda-submission-v1', flowName: 'NDA Submission', flowCategory: 'nda_submission',
  answers: {}, summary: 'Completed 24 questions for "NDA Submission". 1 critical issue(s) detected that need resolution.',
  issues: [{ checkId: 'c1', severity: 'critical', title: 'User fee not paid', message: 'FDA will not file the application.', reference: 'FD&C Act section 736', questionId: 'q1', triggerValues: {} }],
  suggestedActions: [{ label: 'Run FDA War Game', actionType: 'start_war_game', description: 'Pressure-test this interview.' }],
});
