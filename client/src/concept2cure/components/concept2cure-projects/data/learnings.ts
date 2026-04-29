/**
 * Phase 3 Projects — memory learnings (PMEM_LEARNINGS).
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx (lines 484–507).
 */
import type { MemoryLearning } from '../types';

export const PMEM_LEARNINGS: Record<string, MemoryLearning[]> = {
  'or-801': [
    { when: '1 day ago',   kind: 'predicate', text: 'Predicate K221847 confirmed equivalent for indication and material — orthopedic surgeons reviewed.' },
    { when: '2 days ago',  kind: 'biocompat', text: 'Biocompatibility supplier signature pending; ISO 10993-5 cytotoxicity in progress.' },
    { when: '3 days ago',  kind: 'design',    text: 'Final OR-801 dimensions locked — 3.5/4.0/4.5/5.0 mm cortical screws.' },
    { when: '5 days ago',  kind: 'eSTAR',     text: 'eSTAR section 12.2 (sterilization) expects ISO 11135 EO; EtO residuals must follow ISO 10993-7.' },
    { when: '1 week ago',  kind: 'pre-sub',   text: 'Q-Sub feedback FDA-2025-Q-1083: agency requested clarification on torque-strength to predicate ratio.' },
  ],
  'pr-1': [
    { when: '4 days ago', kind: 'project',    text: 'Concept2Cure AnA 1.0 skill — multi-region application registry seed JSON drafted.' },
    { when: '6 days ago', kind: 'design',     text: 'Region picker confirmed: US, EU, UK, Canada, Japan, Switzerland in v1.' },
    { when: '8 days ago', kind: 'compliance', text: '21 CFR Part 11 audit trail enabled for memory writes; SHA-256 integrity verified.' },
  ],
  'nda-bx204': [
    { when: '6 hours ago', kind: 'cmc',         text: 'BX-204 drug substance specification finalized — 99.2% HPLC purity, 6 impurities controlled.' },
    { when: '2 days ago',  kind: 'clinical',    text: 'Phase 3 study CTQ-204-301 met primary endpoint (HbA1c reduction 0.84%, p<0.001).' },
    { when: '4 days ago',  kind: 'nonclinical', text: 'Carcinogenicity 2-year rat study negative; tox margin 32x at NOAEL.' },
  ],
  'iv-415-cer': [
    { when: '5 hours ago', kind: 'literature',    text: '1,842 unique publications retrieved; 47 relevant after appraisal.' },
    { when: '1 day ago',   kind: 'pms',           text: 'FAERS 2026-Q3 — 47 signals reviewed, 3 require benefit-risk update.' },
    { when: '3 days ago',  kind: 'classification', text: 'Article 61 confirmed; Class III companion Dx pathway under MDR.' },
  ],
};
