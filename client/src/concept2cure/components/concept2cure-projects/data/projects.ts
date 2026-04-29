/**
 * Phase 3 Projects — seed data (PR_PROJECTS).
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx (PR_PROJECTS,
 * lines 37–136). Per HANDOFF.md item 14, the prototype mutates this
 * array in place via `PR_PROJECTS.unshift(...)` from NewProjectDialog;
 * v2 must replace that with a server mutation + React Query
 * invalidation when wiring real data. Keep the SHAPE — drop the
 * mock-only fields (capacityPct per item 13, daysToTarget derived per
 * item 6) only when wiring real data.
 */
import type { Project } from '../types';
import { buildPhases } from './phases';

export const PR_PROJECTS: Project[] = [
  {
    id: 'c2c-ana',
    name: 'Concept2cure AnA 1.0 Skills',
    desc: 'this is a claud code project for concept2cure AnA 1.0',
    starred: true,
    chats: [
      { id: 'c1', title: 'Pitching Concept2cure to Medidata executives', last: '6 days ago' },
      { id: 'c2', title: 'Concept2Cure equity and royalty deal structure', last: '6 days ago' },
      { id: 'c3', title: 'Aligning Claude Code UI with ChatGPT interface', last: '20 days ago' },
      { id: 'c4', title: 'Adding skill.md to Claude code project', last: '22 days ago' },
    ],
    memory: {
      enabled: true,
      summary:
        'Purpose & context: JM Smith is the founder of Concept2Cure (C2C), an AI-powered regulatory intelligence SaaS platform for life sciences…',
      updated: '4 days ago',
    },
    instructions: '',
    files: [
      { name: 'WO-06_CONSISTENCY_CLEANUP.md',           lines: 192, kind: 'MD' },
      { name: 'WO-05_FINAL_AUDIT_AND_POLISH….md',       lines: 209, kind: 'MD' },
      { name: 'SKILL[1].md',                             lines: 484, kind: 'MD' },
      { name: 'CLAUDE_MD_UI_CONVERGENCE_SECTION[1].md',  lines: 111, kind: 'MD' },
      { name: 'CLAUDE_CODE_PROMPT_UI_CONVERGENCE[1].md', lines: 101, kind: 'MD' },
      { name: 'ANA_UI_MASTER_WORK_ORDER[1].md',          lines: 267, kind: 'MD' },
      { name: 'ANA_CHATGPT_PARITY_UI_DESIGN[1].md',      lines: 621, kind: 'MD' },
    ],
    capacityPct: 1,
    submissionType: '510K', submissionTypeLabel: '510(k)',
    product: 'AnA 1.0 RI', sponsor: 'Concept2Cure', targetAgency: 'FDA',
    targetDate: '2026-09-15', status: 'active',
    phases: buildPhases('510K', 2), daysToTarget: 142,
  },
  {
    id: 'mdx-510k',
    name: 'OR-801 510(k) submission',
    desc: 'Class II orthopedic screw — predicate workup, eSTAR drafting, internal QC.',
    starred: false,
    chats: [
      { id: 'c1', title: 'Substantial equivalence draft v3', last: '2 days ago' },
      { id: 'c2', title: 'Predicate K221847 mismatch resolution', last: '4 days ago' },
      { id: 'c3', title: 'Biocompatibility report — supplier signature', last: '1 week ago' },
    ],
    memory: {
      enabled: true,
      summary:
        'OR-801 is a Class II orthopedic screw system pursuing 510(k). Predicate K221847 selected; biocompatibility pending supplier signature.',
      updated: '1 day ago',
    },
    instructions:
      'Always cite the FDA reference in parentheses. Use sentence case. Default to 21 CFR 807.92 ordering.',
    files: [
      { name: 'OR-801_predicate_workup.md', lines: 142, kind: 'MD' },
      { name: 'OR-801_eSTAR_outline.md',    lines: 88,  kind: 'MD' },
      { name: 'biocompat_summary_v2.pdf',   lines: 36,  kind: 'PDF' },
    ],
    capacityPct: 4,
    submissionType: '510K', submissionTypeLabel: '510(k)',
    product: 'OR-801 orthopedic screw', sponsor: 'BioNova Therapeutics', targetAgency: 'FDA',
    targetDate: '2026-06-30', status: 'in_review',
    phases: buildPhases('510K', 5), daysToTarget: 65,
  },
  {
    id: 'biopharma-nda',
    name: 'NDA 212345 — BX-204 oral',
    desc: 'Oral CGM-adjacent compound; CMC + clinical sections in active drafting.',
    starred: false,
    chats: [
      { id: 'c1', title: 'CMC §3.2.S drug substance — outline', last: 'today' },
      { id: 'c2', title: 'Clinical section 2.5 — Module 2 sweep', last: '3 days ago' },
    ],
    memory: { enabled: false, summary: '', updated: '' },
    instructions: '',
    files: [
      { name: 'BX-204_clinical_overview.md', lines: 244, kind: 'MD' },
      { name: 'BX-204_module2_2.5.md',       lines: 312, kind: 'MD' },
      { name: 'CMC_drug_substance_3.2.S.md', lines: 198, kind: 'MD' },
    ],
    capacityPct: 6,
    submissionType: 'NDA', submissionTypeLabel: 'NDA',
    product: 'BX-204 oral', sponsor: 'Concept2Cure', targetAgency: 'FDA',
    targetDate: '2027-02-01', status: 'active',
    phases: buildPhases('NDA', 3), daysToTarget: 290,
  },
  {
    id: 'eu-mdr-iv415',
    name: 'IV-415 EU MDR — companion Dx',
    desc: 'Article 61 clinical evaluation, FAERS adjudication, notified body Q1 review.',
    starred: false,
    chats: [
      { id: 'c1', title: 'FAERS signal adjudication — 3 events', last: '5 hours ago' },
      { id: 'c2', title: 'Article 61 PMS plan v0.4', last: '2 days ago' },
    ],
    memory: {
      enabled: true,
      summary:
        'IV-415 is a Class III companion diagnostic; EU MDR Article 61. 1,842 literature hits, 47 FAERS signals.',
      updated: '5 hours ago',
    },
    instructions: '',
    files: [
      { name: 'IV-415_CER_outline.md',    lines: 187, kind: 'MD' },
      { name: 'FAERS_signals_2026Q3.csv', lines: 47,  kind: 'CSV' },
    ],
    capacityPct: 2,
    submissionType: 'CER', submissionTypeLabel: 'EU MDR CER',
    product: 'IV-415 companion Dx', sponsor: 'Concept2Cure EU', targetAgency: 'EMA',
    targetDate: '2026-12-15', status: 'in_review',
    phases: buildPhases('CER', 4), daysToTarget: 233,
  },
];
