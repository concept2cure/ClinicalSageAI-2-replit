/**
 * The submission context an IND, NDA or BLA chat is given. One block, called
 * from both canonical chat doors (POST /api/chat/send-message and
 * POST /api/ana-ri/stream); server/routes/__tests__/chat-path-parity.test.ts
 * fails if either door stops calling it or grows its own copy.
 *
 * ── What it replaced (2026-10-05, g-submission-context-block) ────────────────
 * send-message.ts carried a hand-written "## IND Submission Context" block, and
 * the stream door carried nothing. That block:
 *   - fired for NDA and BLA projects and told them "This is an IND";
 *   - sent drafting to ind_generate_section and progress to ind_get_status,
 *     whose loopback calls carry no Authorization header and get 401 on every
 *     call (retired in g-retire-ind-generate-tools);
 *   - said "Module 1 first, then 2-5", which is not the order the canonical
 *     NDA/BLA chain gives (Module 5 reports and ISS/ISE before the 2.7 and 2.5
 *     summaries — server/services/regulatory/submission-chain.ts);
 *   - listed IND_SECTIONS as the "complete IND structure" with no
 *     Investigator's Brochure.
 *
 * ── What it says now ─────────────────────────────────────────────────────────
 *   - a heading naming the actual application;
 *   - the canonical brief for it, renderLifecycleBrief('ind_initial' | 'nda' |
 *     'bla') — no second hand-kept list;
 *   - for an IND, the IB at 1.14.4.1: required under 21 CFR 312.23(a)(5) "if
 *     required under § 312.55", and § 312.55 binds every sponsor other than a
 *     sponsor-investigator (regulator text, eCFR; see the step's facts.md);
 *   - for an NDA or BLA, a pointer to plan_submission_from_database_lock for the
 *     order and where the project stands — the order is not restated here;
 *   - the drafting route: get_document_section_requirements, then
 *     draft_authoring_document (batch_draft_sections for several sections,
 *     plan_ind_module_authoring for IND Module 2.5 / 2.7).
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 * Only a DECLARED US application gets a block: the submission type the client
 * sent, or the project context's productType. The orchestrator's detected type
 * is deliberately not read: its taxonomy folds CTA, CTN into 'ind' and MAA,
 * NDS, JNDA into 'nda', so reading it would tell an EU CTA it is a US IND. Any
 * other type — supplements and amendments included — gets no block, which is
 * what the old block gave everything outside IND/NDA/BLA too.
 *
 * PURE. No I/O.
 */

import { renderLifecycleBrief } from '../ind/ctd/section-brief.js';

export interface SubmissionContextInput {
  /** The submission type the client declared for this turn (`submission_type`). */
  submissionType?: string | null;
  /** The client's context block (`req.body.context`): productType, activeProject, projectId. */
  projectContext?: Record<string, unknown> | null;
}

type UsApplication = 'IND' | 'NDA' | 'BLA';

/** Declared type → the application and its lifecycle brief id. Exact keys only. */
const DECLARED_TYPE: Readonly<Record<string, UsApplication>> = {
  IND: 'IND',
  US_IND: 'IND',
  NDA: 'NDA',
  US_NDA: 'NDA',
  BLA: 'BLA',
  US_BLA: 'BLA',
};

const LIFECYCLE_ID: Readonly<Record<UsApplication, string>> = {
  IND: 'ind_initial',
  NDA: 'nda',
  BLA: 'bla',
};

const text = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

function applicationFor({ submissionType, projectContext }: SubmissionContextInput): UsApplication | null {
  const declared =
    text(submissionType) || text(projectContext?.productType) || text(projectContext?.submissionType);
  return DECLARED_TYPE[declared.toUpperCase()] ?? null;
}

/** The brief sits under this block's heading, so its headings drop one level. */
const demoteHeadings = (md: string): string => md.replace(/^(#{2,5}) /gm, '#$1 ');

const IND_REQUIRED_DOCUMENTS = [
  '### Investigator\'s Brochure (1.14.4.1)',
  'Required in this IND unless the sponsor is a sponsor-investigator: 21 CFR 312.23(a)(5) requires the IB "if ' +
    'required under § 312.55", and § 312.55(a) requires every sponsor other than a sponsor-investigator to give ' +
    'each participating investigator an IB before the investigation begins. Ask who the sponsor is before ' +
    'treating it as optional. Investigational drug labeling is filed beside it at 1.14.4.2. Call ' +
    '`get_document_section_requirements` with "1.14.4.1" or "1.14.4.2" for what each must contain.',
].join('\n');

function draftingRoute(app: UsApplication): string {
  const lines = [
    '### Drafting a section',
    '1. `get_document_section_requirements` with the section code (or "' +
      LIFECYCLE_ID[app] +
      '" for the whole application) — state its requirements rather than recalling them.',
    '2. `draft_authoring_document` to put the draft into the project as an authoring document the person opens ' +
      'in the editor and files to the Vault. Use `batch_draft_sections` when several sections are asked for at once. ' +
      'Batch output is generated but NOT saved. For a deliverable, promote successful content through ' +
      '`draft_authoring_document` and its existing gates. Report saved only when it returns an authoringDocId. ' +
      'Retain saved IDs and successful drafts; retry only failed sections, never recreate a document already saved. ' +
      'A saved draft is not approved or filed.',
  ];
  if (app === 'IND') {
    lines.push(
      '3. For Module 2.5 or 2.7 from structured source facts, `plan_ind_module_authoring` returns the headers and ' +
        'the figures the draft must carry verbatim.',
      '',
      'There is no tool that reports which IND sections this project has completed; do not state progress you ' +
        'have not read.',
    );
  }
  return lines.join('\n');
}

const ORDER_OF_WORK = [
  '### Order of work',
  'Call `plan_submission_from_database_lock` for the sequence from database lock to a filed application and ' +
    'where this project stands on it (read from the project\'s Vault). Give the order it returns; do not ' +
    'restate one from memory.',
].join('\n');

/**
 * The block for an IND, NDA or BLA chat, or '' when the declared type is not
 * one of them. Leading blank lines included so a caller can append it as is.
 */
export function submissionContextBlockFor(input: SubmissionContextInput): string {
  const app = applicationFor(input);
  if (!app) return '';
  const brief = renderLifecycleBrief(LIFECYCLE_ID[app]);
  if (!brief) return '';

  const pc = input.projectContext ?? {};
  const project = [
    text(pc.activeProject) ? `Project: ${text(pc.activeProject)}` : '',
    text(pc.projectId) ? `Project ID: ${text(pc.projectId)}` : '',
  ].filter(Boolean);

  const parts = [
    `## ${app} submission context (US FDA)`,
    [`This project is declared as a US ${app}.`, ...project].join('\n'),
    demoteHeadings(brief),
  ];
  if (app === 'IND') parts.push(IND_REQUIRED_DOCUMENTS);
  else parts.push(ORDER_OF_WORK);
  parts.push(draftingRoute(app));

  return `\n\n${parts.join('\n\n')}\n`;
}
