/**
 * Slash commands — the ONE `/command` vocabulary, shared by the composer and
 * the server.
 *
 * The server's message-intent layer decides whether a message starts with a
 * command it knows (`server/services/ana-ri/message-intent.ts`); the composer
 * offers the same list when a person types `/` at the start of a draft. The
 * list is here, and only here, so the menu can never offer a command the
 * server does not parse, and the server can never parse one the menu does not
 * show.
 *
 * `SUPPORTED_SLASH_COMMANDS` is the parser's contract (a literal tuple: its
 * element type is used as a discriminant across the server). The summaries
 * are the menu's one-line copy — what the command does, in the product's
 * words, not the prompt text the server rewrites the command into.
 *
 * Pure data + pure functions; importable from client and server.
 */

export const SUPPORTED_SLASH_COMMANDS = [
  'risk',
  'readiness',
  'precedent',
  'draft',
  'preflight',
  'claims',
  'recommend',
  'next',
  'simulate',
  'signals',
  'export',
  'assess',
  'twin',
  'consistency',
  'deficiencies',
  'knowledge',
  'decisions',
  'help',
  'sap',
  'power',
  'dose',
  'defensibility',
  'design',
  'safety',
  'cmc',
  'csr',
  'device',
  'diagnostics',
  'cms',
  'ectd',
  'audit',
  'amend',
  'review',
  'memo',
  'brief',
  'strategy',
  'freeze',
  'sign',
  'scan',
  'checklist',
  'submit',
  'workflow',
  'status',
  'narrative',
  'report',
  'iss',
  'ise',
  'ib',
  'smpc',
  'rmp',
  'uspi',
  'haq',
  'ask',
  'wisdom',
  'guide',
  'playbook',
  'orient',
  'tour',
  'challenge',
  'redteam',
  'devil',
  'decide',
  'tradeoff',
  'framework',
  'meeting',
  'agency',
  'tactics',
  'position',
  'landscape',
  'compete',
  'align',
  'ich',
  'guideline',
  'guidelines',
  'pathway',
  'pathways',
  'expedited',
  'capabilities',
  'whatcanyoudo',
] as const;

export type SlashCommandName = (typeof SUPPORTED_SLASH_COMMANDS)[number];

/** One line per command for the composer menu. Total by type: a command without a summary does not compile. */
export const SLASH_COMMAND_SUMMARIES: Readonly<Record<SlashCommandName, string>> = {
  risk: 'Risk profile and submission risk for this project',
  readiness: 'How ready this project is for submission',
  precedent: 'Relevant regulatory precedents',
  draft: 'Draft a section or artifact — name it after the command',
  preflight: 'Preflight check on the current section or module',
  claims: 'Evidence chain and unsupported claims',
  recommend: 'Top priority actions to take next',
  next: 'What to work on next, by impact',
  simulate: 'Likely reviewer challenges and questions',
  signals: 'Accumulated regulatory intelligence signals',
  export: 'Export the current work product',
  assess: 'Full assessment: readiness, recommendations, risk, predictions',
  twin: 'Submission twin: claims vs evidence, reviewer challenges, fragility',
  consistency: 'Cross-module consistency across the dossier',
  deficiencies: 'Known deficiency taxonomy for this submission type',
  knowledge: 'Search or list the project knowledge base',
  decisions: 'Decision audit trail for this project',
  help: 'How to work with AnA',
  sap: 'Statistical Analysis Plan from the deterministic engine',
  power: 'Sample size and power from the deterministic engine',
  dose: 'Dose-escalation design',
  defensibility: 'Statistical defensibility assessment',
  design: 'Clinical trial design',
  safety: 'Safety and pharmacovigilance context',
  cmc: 'CMC / Module 3 context',
  csr: 'Clinical study report context',
  device: 'Device pathway context',
  diagnostics: 'IVD and diagnostics context',
  cms: 'CMS coverage and reimbursement context',
  ectd: 'eCTD structure and publishing context',
  audit: 'Audit trail and audit readiness',
  amend: 'Amend a governed document with a reason',
  review: 'Review the current document',
  memo: 'A memo on the current topic',
  brief: 'A briefing document',
  strategy: 'Regulatory strategy',
  freeze: 'Freeze the current version',
  sign: 'Sign-off flow for the current document',
  scan: 'Compliance scan of the current document',
  checklist: 'Checklist for the current submission or task',
  submit: 'Submission steps and gates',
  workflow: 'Where this work sits in its workflow',
  status: 'Status of this project',
  narrative: 'Draft a narrative',
  report: 'Draft a report',
  iss: 'Integrated Summary of Safety',
  ise: 'Integrated Summary of Efficacy',
  ib: "Investigator's Brochure",
  smpc: 'Summary of Product Characteristics',
  rmp: 'Risk Management Plan',
  uspi: 'US Prescribing Information',
  haq: 'Health-authority questions',
  ask: 'Ask a question of the project record',
  wisdom: 'Industry wisdom on the topic',
  guide: 'Guidance on how to proceed',
  playbook: 'Playbook for this situation',
  orient: 'Orientation to the workspace',
  tour: 'A tour of the platform',
  challenge: 'Challenge the current plan',
  redteam: 'Red-team the current position',
  devil: "Devil's advocate on the current position",
  decide: 'Structure a decision',
  tradeoff: 'Weigh a trade-off',
  framework: 'A decision framework',
  meeting: 'Agency meeting preparation',
  agency: 'Agency interaction tactics',
  tactics: 'Tactics for the current agency interaction',
  position: 'Competitive position',
  landscape: 'Competitive landscape',
  compete: 'Competitive strategy',
  align: 'Alignment across the program',
  ich: 'ICH guideline context',
  guideline: 'Guideline context',
  guidelines: 'Guideline context',
  pathway: 'Regulatory pathway options',
  pathways: 'Regulatory pathway options',
  expedited: 'Expedited pathways',
  capabilities: 'What AnA can do here',
  whatcanyoudo: 'What AnA can do here',
};

export interface SlashCommand {
  name: SlashCommandName;
  summary: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = SUPPORTED_SLASH_COMMANDS.map((name) => ({
  name,
  summary: SLASH_COMMAND_SUMMARIES[name],
}));

/** Case-insensitive lookup by name. */
export function findSlashCommand(name: string): SlashCommand | undefined {
  const needle = name.trim().replace(/^\//, '').toLowerCase();
  return SLASH_COMMANDS.find((c) => c.name === needle);
}

/**
 * Commands a person is likely typing after `/`: name prefix first, then a
 * name or summary that contains the query; an empty query lists the start of
 * the vocabulary.
 */
export function searchSlashCommands(query: string, limit = 8): SlashCommand[] {
  const q = query.trim().replace(/^\//, '').toLowerCase();
  if (!q) return SLASH_COMMANDS.slice(0, limit);
  const pool = SLASH_COMMANDS.filter((c) => c.name.includes(q) || c.summary.toLowerCase().includes(q));
  return pool
    .sort((a, b) => {
      const as = a.name.startsWith(q) ? 0 : 1;
      const bs = b.name.startsWith(q) ? 0 : 1;
      return as - bs || a.name.length - b.name.length || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
