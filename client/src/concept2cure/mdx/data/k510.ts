/**
 * 510(k) pathway fixtures — ported verbatim from data.jsx.
 *
 * The "Assemble eSTAR" step used to read "20 sections · validation". Nothing
 * produced that 20: the readiness engine modelled 11 slots and the eSTAR
 * manifest listed different numbers again, so a hand-typed count on a stage
 * label was a third answer that could only ever drift further from the model
 * (MDX_WORK_ORDER W1-5). The count is gone rather than corrected to 24 — a
 * literal here would drift again the next time the model changes, and the step
 * label does not need a number to say what the step is.
 */

export type EstarStatus = 'complete' | 'review' | 'draft' | 'na' | 'empty';
export type PredicateStatus = 'selected' | 'candidate' | 'reviewed' | 'rejected';

export interface K510Stage {
  id: string;
  label: string;
  meta: string;
}

export interface Predicate {
  k: string;
  name: string;
  holder: string;
  cleared: string;
  class: string;
  code: string;
  match: number;
  status: PredicateStatus;
  diffs: number;
}

export interface SeRow {
  attr: string;
  subject: string;
  predicate: string;
  /** 'unassessed' when the server gave no verdict, or one this client does not
   *  recognise. It used to default to 'equivalent' — a finding of substantial
   *  equivalence, on the attribute a reviewer would challenge, that nobody made. */
  verdict: 'same' | 'equivalent' | 'different' | 'unassessed';
  note?: string;
}

/** Draft provenance for a section row. Populated when AnA drafted via the
 *  write_kit_section tool and the user has not yet accepted. Drives the
 *  "drafted by AnA — accept / refine" affordance in K510Surface,
 *  PmaSurface, CerSurface. Null on legacy + human-typed sections. */
export interface DraftProvenance {
  /** 'ana' for AnA-authored drafts (only source today); future-proofed for
   *  template-only drafts ('ana_template') if we split that path later. */
  source: 'ana';
  /** ISO timestamp the draft was written. */
  at: string;
  /** One-line note describing what the draft covers (from
   *  write_kit_section's summary_note). */
  summary?: string;
  /** Backing cerv2_510k_sections.id, used to POST the accept call. */
  rowId: number;
}

export interface EstarRow {
  id: number;
  label: string;
  status: EstarStatus;
  blocker?: boolean;
  /** Set when AnA has drafted the section but the user hasn't accepted. */
  draft?: DraftProvenance | null;
}

export const K510_STAGES: K510Stage[] = [
  { id: 'intake',     label: 'Intake',                  meta: 'Device spec · intended use' },
  { id: 'classify',   label: 'Classify',                meta: 'Product code · pathway' },
  { id: 'predicate',  label: 'Predicate search',        meta: 'Precedent intelligence' },
  { id: 'testing',    label: 'Performance testing',     meta: 'Bench · analytical · clinical' },
  { id: 'se',         label: 'Substantial equivalence', meta: 'SE matrix · differences' },
  { id: 'assemble',   label: 'Assemble eSTAR',          meta: 'sections · validation' },
  { id: 'submit',     label: 'Submit',                  meta: 'eSTAR + cover letter' },
];

/*
 * K510_PREDICATES, K510_SE_ROWS and K510_ESTAR — removed. What each asserted:
 *
 * K510_SE_ROWS was an invented substantial-equivalence comparison, attribute
 * by attribute, including a MARD accuracy of 8.2% against a predicate's 8.7%.
 * Substantial equivalence IS the 510(k) argument, and those are the numbers a
 * reviewer weighs.
 *
 * K510_PREDICATES paired real cleared devices — K221847, K213163 and the rest
 * are genuine FDA records — with an invented `match` score against the
 * sponsor's device, which is an assessment nobody performed. K510Surface
 * already refused to write an example K-number into the device profile,
 * because "an example K-number claimed as a predicate would reach FDA as this
 * sponsor's own assertion"; but that refusal was a tooltip on a disabled
 * button, and nothing on screen said the six rows were examples at all.
 *
 * K510_ESTAR carried the real FDA eSTAR section list with an invented
 * per-section status, and drove both the blocker count and the completion
 * readout. The list itself is real and is kept below, without the assessment.
 */

/**
 * The FDA eSTAR 510(k) template's section structure — the published list, in
 * the order the template carries it, and nothing about any submission's
 * progress through it. A section's status, its blockers and its signers belong
 * to a tenant's own submission and are read from the server.
 */
export const K510_ESTAR_SECTIONS: { id: number; label: string }[] = [
  { id:  1, label: 'Medical Device User Fee Cover Sheet'          },
  { id:  2, label: 'CDRH Premarket Review Submission Cover Sheet' },
  { id:  3, label: '510(k) Cover Letter'                          },
  { id:  4, label: 'Indications for Use Statement'                },
  { id:  5, label: '510(k) Summary'                               },
  { id:  6, label: 'Truthful and Accuracy Statement'              },
  { id:  7, label: 'Class III Summary and Certification'          },
  { id:  8, label: 'Financial Certification or Disclosure'        },
  { id:  9, label: 'Declarations of Conformity'                   },
  { id: 10, label: 'Device Description'                           },
  { id: 11, label: 'Substantial Equivalence Discussion'           },
  { id: 12, label: 'Proposed Labeling'                            },
  { id: 13, label: 'Sterilization and Shelf Life'                 },
  { id: 14, label: 'Biocompatibility'                             },
  { id: 15, label: 'Software'                                     },
  { id: 16, label: 'Electromagnetic Compatibility'                },
  { id: 17, label: 'Performance Testing — Bench'                  },
  { id: 18, label: 'Performance Testing — Animal'                 },
  { id: 19, label: 'Performance Testing — Clinical'               },
  { id: 20, label: 'References'                                   },
];

