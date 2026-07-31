/**
 * PDEV AnA command registry — the 20 capabilities AnA exposes when the user
 * is inside the PDEV workstream.
 *
 * Ported from `design-system/ui_kits/pdev/data.jsx` §PDEV_COMMANDS (the kit's
 * `window.PDEV_COMMANDS` global). The shape is the palette contract: every
 * capability has a stable id, a group label used for grouping in a picker /
 * palette, and an example prompt that seeds the composer when selected.
 *
 * Presented in the AnA dock as "quick prompts" when the transcript is empty
 * and will feed the ⌘K palette once the palette lands.
 */

export type PdevCommandGroup =
  | 'Program'
  | 'Workstream'
  | 'Activity'
  | 'Workflow'
  | 'Assembly'
  | 'Contradiction'
  | 'FDA'
  | 'Audit';

export interface PdevCommand {
  /** Stable capability id, dot-namespaced under `pdev.*`. */
  id: string;
  /** Grouping label shown in the palette. */
  group: PdevCommandGroup;
  /** Example prompt seeded into the composer when the command is picked. */
  example: string;
}

export const PDEV_COMMANDS: ReadonlyArray<PdevCommand> = [
  { id: 'pdev.program.summary',          group: 'Program',       example: 'What is the status of BX-501?' },
  { id: 'pdev.program.fda_interactions', group: 'Program',       example: 'Walk me through every FDA interaction for BX-501' },
  { id: 'pdev.readiness.snapshot',       group: 'Program',       example: 'Snapshot readiness now' },
  { id: 'pdev.readiness.findings',       group: 'Program',       example: 'What is blocking IND for BX-501?' },
  { id: 'pdev.workstream.summary',       group: 'Workstream',    example: 'Show me the CMC workstream status' },
  { id: 'pdev.activity.summary',         group: 'Activity',      example: 'What is the status of nonclinical.glp_tox?' },
  { id: 'pdev.activity.state_change',    group: 'Activity',      example: 'Move clinical.protocol_p1 to in_review' },
  { id: 'pdev.activity.ai_draft',        group: 'Activity',      example: 'Draft my GLP tox summary into Module 4' },
  { id: 'pdev.activity.evidence_attach', group: 'Activity',      example: 'Attach ICH M3(R2) §5.1 as a reference to nonclinical.glp_tox' },
  { id: 'pdev.activity.evidence_detach', group: 'Activity',      example: 'Detach evidence ev-3003 from nonclinical.glp_tox' },
  { id: 'pdev.activity.provenance',      group: 'Activity',      example: 'Show me the full provenance trace for nonclinical.glp_tox' },
  { id: 'pdev.activity.workflow_kickoff',group: 'Activity',      example: 'Kick off the approval chain for nonclinical.glp_tox' },
  { id: 'pdev.workflow.decide',          group: 'Workflow',      example: 'Approve checkpoint 2 of wfr-2014' },
  { id: 'pdev.ind_assembly.summary',     group: 'Assembly',      example: 'How ready is each module for IND?' },
  { id: 'pdev.ind_assembly.compile',     group: 'Assembly',      example: 'Compile the IND assembly for BX-501' },
  { id: 'pdev.contradictions.list',      group: 'Contradiction', example: 'Show me the critical contradictions for BX-501' },
  { id: 'pdev.contradictions.transition',group: 'Contradiction', example: 'Move c-441 to under_review' },
  { id: 'pdev.fda.feedback_propose',     group: 'FDA',           example: 'Propose PDEV activity matches for unrolled FDA commitments' },
  { id: 'pdev.fda.feedback_apply',       group: 'FDA',           example: 'Apply the proposed rollup for fda-101' },
  { id: 'pdev.audit.export',             group: 'Audit',          example: 'Export the full audit chain for BX-501' },
];
