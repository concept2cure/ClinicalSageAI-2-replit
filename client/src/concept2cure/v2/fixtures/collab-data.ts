/**
 * Collaboration-layer fixture data -- extracted from kit collab.jsx.
 *
 * Grounded in the concept2cure-v2 backend (forensic):
 *   - Canonical store: unifiedTasks (shared/schema.ts) via
 *     /api/task-management (server/routes/taskManagement.routes.ts).
 *   - Polymorphic origin: sourceEntityType + sourceEntityId stamps
 *     the active surface onto every task the collab layer creates.
 *   - SURFACE_CTX maps every surface ID to its default module type,
 *     noun (for placeholder text), and entity type.
 *   - Module palette: superset of the board's, covering every surface.
 *   - Optimal assignees: a FIXED per-module default. NOT the output of
 *     getOptimalAssignee() — that function is real (taskManagement.routes.ts:229,
 *     lowest active estimated-hours in the org) but lives server-side and is
 *     never called from here. This constant only looks like its result.
 */
import {
  TB_MOD,
  type TeamMember, type ProjectEntry, type TaskItem,
} from './task-board-data';

/* ── Activity item for task notes / comments ── */

export interface ActivityItem {
  type: string;
  text: string;
  who: string;
  when: string;
}

/* ── Extended task with collaboration fields ── */

export interface C2CTask extends TaskItem {
  activity?: ActivityItem[];
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceLabel?: string;
}

/* ── Surface context definition ── */

export interface SurfaceContextDef {
  mod: string;
  noun: string;
  et: string;
}

/* ── Per-surface context defaults ──
   Maps every surface ID to its default module, noun (for placeholder text),
   and entity type. A surface can refine with C2C.setContext(). */

export const SURFACE_CTX: Record<string, SurfaceContextDef> = {
  projects:                 { mod: 'Regulatory',      noun: 'portfolio',                et: 'portfolio' },
  'artifacts-center':       { mod: 'Evidence',        noun: 'artifact',                 et: 'artifact' },
  'cro-portfolio':          { mod: 'Regulatory',      noun: 'sponsor portfolio',        et: 'sponsor' },
  'filings-catalog':        { mod: 'Regulatory',      noun: 'filing type',              et: 'filing' },
  dossier:                  { mod: 'eCTD',            noun: 'dossier section',           et: 'section' },
  'project-home':           { mod: 'Regulatory',      noun: 'project',                  et: 'project' },
  'conversation-thread':    { mod: 'Regulatory',      noun: 'conversation',             et: 'conversation' },
  'document-authoring':     { mod: 'Clinical',        noun: 'document section',          et: 'section' },
  'regulatory-workspace':   { mod: 'Regulatory',      noun: 'section',                  et: 'section' },
  vault:                    { mod: 'Vault',           noun: 'document',                  et: 'document' },
  'evidence-search':        { mod: 'Evidence',        noun: 'evidence query',            et: 'evidence' },
  review:                   { mod: 'Regulatory',      noun: 'review item',               et: 'review' },
  'submission-center':      { mod: 'Submission',      noun: 'submission',                et: 'submission' },
  'haq-manager':            { mod: 'Regulatory',      noun: 'health-authority question', et: 'haq' },
  'ectd-coauthor':          { mod: 'eCTD',            noun: 'eCTD leaf',                 et: 'section' },
  'nda-cockpit':            { mod: 'Regulatory',      noun: 'NDA/BLA filing',            et: 'filing' },
  'device-workstream':      { mod: 'Medical Device',  noun: 'device submission',         et: 'submission' },
  'device-510k':            { mod: 'Medical Device',  noun: '510(k) section',            et: 'section' },
  'device-cer':             { mod: 'Medical Device',  noun: 'CER section',               et: 'section' },
  'device-diagnostics':     { mod: 'Medical Device',  noun: 'diagnostics item',          et: 'device' },
  'device-submission':      { mod: 'Medical Device',  noun: 'device submission',         et: 'submission' },
  cmc:                      { mod: 'CMC',             noun: 'CMC section',               et: 'section' },
  'ind-checklist':          { mod: 'IND',             noun: 'IND item',                  et: 'ind' },
  pdev:                     { mod: 'IND',             noun: 'development activity',      et: 'activity' },
  'protocol-dev':           { mod: 'Protocol Design', noun: 'protocol section',          et: 'section' },
  'research-admin':         { mod: 'Regulatory',      noun: 'committee item',            et: 'committee' },
  biopharma:                { mod: 'Regulatory',      noun: 'BLA/CTD section',           et: 'section' },
  'template-library':       { mod: 'Regulatory',      noun: 'template',                  et: 'template' },
  tasks:                    { mod: 'Regulatory',      noun: 'task',                      et: 'unified' },
  'task-board':             { mod: 'Regulatory',      noun: 'task',                      et: 'unified' },
  'dossier-map':            { mod: 'eCTD',            noun: 'module',                    et: 'module' },
  'csr-workflow':           { mod: 'Clinical',        noun: 'CSR section',               et: 'section' },
  registrations:            { mod: 'Regulatory',      noun: 'registration',              et: 'registration' },
  'market-access':          { mod: 'Market Access',   noun: 'access item',               et: 'access' },
  'change-assessment':      { mod: 'Regulatory',      noun: 'change',                    et: 'change' },
  'doc-journey':            { mod: 'Regulatory',      noun: 'document',                  et: 'document' },
  'labeling-pi':            { mod: 'Labeling',        noun: 'label section',             et: 'section' },
  'agency-meetings':        { mod: 'Meetings',        noun: 'meeting',                   et: 'meeting' },
  orchestration:            { mod: 'Regulatory',      noun: 'workflow run',              et: 'workflow' },
  'reg-change':             { mod: 'Intelligence',    noun: 'reg change',                et: 'change' },
  'global-ri':              { mod: 'Intelligence',    noun: 'RI capability',             et: 'capability' },
  'precedent-intelligence': { mod: 'Intelligence',    noun: 'precedent',                 et: 'precedent' },
  biostatistics:            { mod: 'Biostatistics',   noun: 'analysis',                  et: 'analysis' },
  'report-engine':          { mod: 'Evidence',        noun: 'report',                    et: 'report' },
  'safety-narrative':       { mod: 'Safety',          noun: 'safety case',               et: 'case' },
  labeling:                 { mod: 'Labeling',        noun: 'label',                     et: 'label' },
  risk:                     { mod: 'Medical Device',  noun: 'risk item',                 et: 'risk' },
  'deep-research':          { mod: 'Intelligence',    noun: 'research',                  et: 'research' },
  setup:                    { mod: 'Regulatory',      noun: 'setting',                   et: 'admin' },
  'audit-trail':            { mod: 'Quality',         noun: 'audit item',                et: 'audit' },
  billing:                  { mod: 'Regulatory',      noun: 'billing item',              et: 'billing' },
  home:                     { mod: 'Regulatory',      noun: 'item',                      et: 'workspace' },
};

/* ── Module palette -- superset of the board's, covering every surface ── */

export const CL_MOD: Record<string, string> = {
  ...TB_MOD,
  Submission:      '#3c7a8a',
  Quality:         '#8a7a3c',
  Labeling:        '#7a5a9c',
  'Market Access': '#5a8a7a',
  Evidence:        '#6b7a9c',
  Meetings:        '#9c6f5a',
  Intelligence:    '#5a7a6b',
};

/* ── Default assignee per module. A constant lookup, not a computation. ── */


/* ── Task type labels ── */

export const CL_TYPE: Record<string, string> = {
  milestone: 'Milestone',
  deliverable: 'Deliverable',
  review: 'Review',
  approval: 'Approval',
  action: 'Action',
};

/* ── Priority levels ── */

/* Exactly the priorities the server accepts. createTaskSchema
   (server/routes/taskManagement.routes.ts) validates priority against
   z.enum(['low','medium','high','critical']), so the 'urgent' option this list
   used to carry was a guaranteed HTTP 400 — the task simply failed to create
   for anyone who chose it. Keep this in step with that enum. */
export const CL_PRI: string[] = ['low', 'medium', 'high', 'critical'];

/* ── Re-exports for consumer convenience ── */

export type { TeamMember, ProjectEntry, TaskItem };
