/**
 * Test input for the change-control log: example rows that exist only for tests.
 * They used to live in changeData.ts as FIXTURE_CHANGES / FIXTURE_SUMMARY, where
 * the production screen could show them under sample mode; nothing outside
 * __tests__ imports this module.
 *
 * `nextStates` is what GET /api/mdx/qms/changes sends as `next_states`
 * (changeControl.service CHANGE_TRANSITIONS for each row's status).
 */
import type { ChangeControl, ChangeSummary } from '../changeData';

export const CHANGE_ROWS: ChangeControl[] = [
  {
    id: 1, changeNumber: 'CC-2026-014', title: 'Sterile filter supplier change (0.22 µm)',
    description: 'Qualify a second-source 0.22 µm sterilising-grade filter for the aseptic fill line.',
    changeType: 'supplier', classification: 'critical', riskLevel: 'high', status: 'under_assessment', nextStates: ['approved', 'rejected', 'cancelled'],
    reason: 'Single-source supply risk on the primary sterilising filter.',
    targetImplementationDate: '2026-09-15', createdAt: '2026-06-28', updatedAt: '2026-07-10',
    links: [
      { id: 11, changeId: 1, linkType: 'deviation', linkedRef: 'DEV-2026-041', linkedLabel: 'Filter integrity test excursion', relationship: 'triggered_by', note: null },
      { id: 12, changeId: 1, linkType: 'validation', linkedRef: 'VP-7', linkedLabel: 'Sterilising-filtration validation', relationship: 'requires', note: null },
      { id: 13, changeId: 1, linkType: 'supplier', linkedRef: 'SUP-118', linkedLabel: 'Second-source filter vendor', relationship: 'impacts', note: null },
    ],
  },
  {
    id: 2, changeNumber: 'CC-2026-012', title: 'Bioreactor scale-up 2,000 → 5,000 L',
    description: 'Scale the drug-substance process from 2,000 L to 5,000 L at the commercial site.',
    changeType: 'process', classification: 'major', riskLevel: 'high', status: 'in_implementation', nextStates: ['verification', 'cancelled'],
    reason: 'Commercial demand exceeds current batch output.',
    targetImplementationDate: '2026-07-05', createdAt: '2026-05-30', updatedAt: '2026-07-01', implementationOverdue: true,
    links: [
      { id: 21, changeId: 2, linkType: 'validation', linkedRef: 'VP-22', linkedLabel: 'Process performance qualification', relationship: 'requires', note: null },
      { id: 22, changeId: 2, linkType: 'capa', linkedRef: 'CAPA-88', linkedLabel: 'Yield trend below target', relationship: 'addresses', note: null },
    ],
  },
  {
    id: 3, changeNumber: 'CC-2026-009', title: 'Update SOP-820-50 supplier controls',
    description: 'Revise the supplier-controls procedure to add the risk-based re-qualification cadence.',
    changeType: 'document', classification: 'minor', riskLevel: 'low', status: 'verification', nextStates: ['closed', 'in_implementation'],
    reason: 'Internal audit finding A-2026-03.',
    targetImplementationDate: '2026-06-20', createdAt: '2026-05-12', updatedAt: '2026-06-22',
    links: [
      { id: 31, changeId: 3, linkType: 'sop', linkedRef: 'SOP-820-50', linkedLabel: 'Supplier controls procedure', relationship: 'impacts', note: null },
      { id: 32, changeId: 3, linkType: 'capa', linkedRef: 'CAPA-79', linkedLabel: 'Audit finding A-2026-03', relationship: 'addresses', note: null },
    ],
  },
  {
    id: 4, changeNumber: 'CC-2026-006', title: 'Migrate LIMS to validated cloud instance',
    description: 'Move the laboratory information system to the validated cloud environment.',
    changeType: 'computer_system', classification: 'major', riskLevel: 'medium', status: 'approved', nextStates: ['in_implementation', 'cancelled'],
    reason: 'End-of-life on the on-premise LIMS server.',
    targetImplementationDate: '2026-10-01', createdAt: '2026-06-15', updatedAt: '2026-07-08',
    links: [
      { id: 41, changeId: 4, linkType: 'validation', linkedRef: 'VP-31', linkedLabel: 'CSV — LIMS cloud qualification', relationship: 'requires', note: null },
    ],
  },
  {
    id: 5, changeNumber: 'CC-2026-002', title: 'Tighten aggregation release limit (SE-HPLC)',
    description: 'Reduce the drug-substance aggregation release limit from ≤2.0% to ≤1.5%.',
    changeType: 'specification', classification: 'minor', riskLevel: 'low', status: 'closed', nextStates: [],
    reason: 'Process capability supports a tighter limit.',
    targetImplementationDate: '2026-04-10', createdAt: '2026-03-01', updatedAt: '2026-04-12',
    links: [
      { id: 51, changeId: 5, linkType: 'document', linkedRef: 'SPEC-DS-01', linkedLabel: 'Drug-substance specification', relationship: 'impacts', note: null },
    ],
  },
  {
    id: 6, changeNumber: 'CC-2026-001', title: 'New incoming-inspection gauge (WI-014)',
    description: 'Introduce a calibrated digital gauge for the dimensional incoming check.',
    changeType: 'equipment', classification: 'minor', riskLevel: 'low', status: 'proposed', nextStates: ['under_assessment', 'cancelled'],
    reason: 'Improve measurement repeatability at incoming inspection.',
    targetImplementationDate: '2026-08-30', createdAt: '2026-07-18', updatedAt: '2026-07-18',
    links: [],
  },
];

export const CHANGE_SUMMARY: ChangeSummary = {
  total: 6,
  open: 5,
  awaitingApproval: 1,
  inImplementation: 1,
  awaitingVerification: 1,
  closed: 1,
  overdueImplementation: 1,
  byStatus: {
    proposed: 1,
    under_assessment: 1,
    approved: 1,
    in_implementation: 1,
    verification: 1,
    closed: 1,
  },
};
