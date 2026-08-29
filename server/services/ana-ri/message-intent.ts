/**
 * Message-intent detection for AnA context enrichment.
 *
 * Extracted verbatim from ./context-enrichment.ts (which re-exports the
 * public names so its import surface is unchanged). This module owns the
 * "what is the user asking about" layer of enrichment:
 *   - slash-command detection (SUPPORTED_SLASH_COMMANDS, detectSlashCommand)
 *   - @app mention detection (KNOWN_APPS, detectAppMention) and the map from
 *     app ID to the enrichment sources it activates (APP_ENRICHMENT_MAP)
 *   - the topic trigger tables (*_TRIGGERS, matchesTriggers) that decide
 *     which enrichment sources fire for a free-text message
 *   - which sources emit role-frameable guidance (ROLE_FRAMEABLE_SOURCES)
 */

// ─── Slash command detection ─────────────────────────────────────────────────

interface SlashCommand {
  command: string;
  args: string;
}

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

/** Enrichment sources that emit guidance the role lens can frame for an audience. */
export const ROLE_FRAMEABLE_SOURCES = new Set<string>([
  'industry-wisdom', 'tour-guide', 'first-session-tour', 'constructive-challenge', 'decision-framework',
  'agency-tactics', 'wisdom', 'guide', 'playbook', 'orient', 'tour', 'challenge', 'redteam', 'devil',
  'decide', 'tradeoff', 'framework', 'meeting', 'agency', 'tactics', 'proactive-tour-guide',
  'competitive-strategy', 'position', 'landscape', 'compete',
  'ich-guidelines', 'ich', 'guideline', 'guidelines',
  'regulatory-pathways', 'pathway', 'pathways', 'expedited',
]);

const SUPPORTED_SLASH_COMMAND_REGEX = new RegExp(
  `^\\/(${SUPPORTED_SLASH_COMMANDS.join('|')})\\b\\s*(.*)`,
  'i',
);

export function detectSlashCommand(message: string): SlashCommand | null {
  const match = message.match(SUPPORTED_SLASH_COMMAND_REGEX);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2].trim() };
}

// ─── @app mention detection ─────────────────────────────────────────────────

interface AppMention {
  appId: string;
  remainingText: string;
}

/** Known app IDs that can be @-mentioned in chat messages */
export const KNOWN_APPS = new Set([
  'deep-research', 'precedent', '510k', 'pma', 'cer',
  'safety', 'biostats', 'vault', 'ectd', 'protocol',
]);

/**
 * Detect @app mentions in user messages.
 * Returns the app ID and remaining message text, or null if no known app is mentioned.
 */
export function detectAppMention(message: string): AppMention | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('@')) return null;

  const match = trimmed.match(/^@([\w-]+)\s*(.*)/s);
  if (!match) return null;

  const appId = match[1].toLowerCase();
  const remainingText = match[2].trim();

  if (!KNOWN_APPS.has(appId)) return null;

  return { appId, remainingText };
}

/** Map from app ID to the enrichment sources it activates */
export const APP_ENRICHMENT_MAP: Record<string, string[]> = {
  'deep-research': ['foresight', 'precedent', 'claims', 'readiness'],
  'precedent': ['precedent'],
  '510k': ['device', 'precedent'],
  'pma': ['device', 'readiness'],
  'cer': ['device', 'safety', 'claims'],
  'safety': ['safety'],
  'biostats': ['biostatistics'],
  'vault': ['ectd'],
  'ectd': ['ectd'],
  'protocol': ['biostatistics', 'readiness'],
};

// ─── Trigger patterns ────────────────────────────────────────────────────────

export const FORESIGHT_TRIGGERS = [
  /\b(?:predict|probability|likelihood|chance|odds|forecast|success rate)\b/i,
  /\b(?:risk score|submission risk|approval probability|approval rate)\b/i,
  /\b(?:what are (?:the|our) (?:chances|odds|risks?))\b/i,
  /\b(?:will (?:this|it|we) (?:get approved|pass|succeed|be accepted))\b/i,
  /\b(?:how risky|risk profile|risk assessment|clinical risk)\b/i,
];

export const PRECEDENT_TRIGGERS = [
  /\b(?:precedent|similar (?:product|device|drug|submission|approval))\b/i,
  /\b(?:predicate|comparable|benchmark|competitive landscape)\b/i,
  /\b(?:who else|what similar|has anyone|previous (?:approval|submission|clearance))\b/i,
  /\b(?:510\(k\) (?:clearance|predicate)|substantial equivalence)\b/i,
];

export const CRL_RTF_TRIGGERS = [
  /\b(?:complete response|crl|refuse to file|rtf|deficiency letter)\b/i,
  /\b(?:rejection|rejected|denied|information request)\b/i,
  /\b(?:what could go wrong|likely deficien|common (?:reason|cause).*(?:reject|fail|deny))\b/i,
];

export const READINESS_TRIGGERS = [
  /\b(?:readiness|ready|submission ready|are we ready|how ready)\b/i,
  /\b(?:readiness score|submission score|completeness)\b/i,
];

export const RECOMMENDATION_TRIGGERS = [
  /\b(?:what should|recommend|suggestion|next step|what.s next|prioriti[zs]e)\b/i,
  /\b(?:what do you recommend|best move|action item|what now)\b/i,
];

export const CLAIMS_TRIGGERS = [
  /\b(?:claim[s]?|evidence|support(?:ed|ing)?|substantiat)\b/i,
  /\b(?:evidence gap|unsupported|claim.*evidence|evidence.*chain)\b/i,
];

export const SIMULATION_TRIGGERS = [
  /\b(?:simulat|what.if|scenario|challenge|reviewer.*question)\b/i,
  /\b(?:how would.*reviewer|anticipat.*question|likely.*question)\b/i,
];

export const BIOSTAT_TRIGGERS = [
  /\b(?:sample size|power analysis|power calculation|statistical power|how many patients|how many subjects)\b/i,
  /\b(?:sap|statistical analysis plan|analysis plan)\b/i,
  /\b(?:dose escalation|dose.finding|3\+3|boin|crm|mtd|maximum tolerated dose|dlt)\b/i,
  /\b(?:biostatistic|biostat|statistician|statistical design|trial design)\b/i,
  /\b(?:adaptive design|group sequential|interim analysis|stopping rule|futility)\b/i,
  /\b(?:multiplicity|multiple endpoints|alpha spending|bonferroni|dunnett)\b/i,
  /\b(?:missing data|dropout|attrition|imputation|mmrm|locf)\b/i,
  /\b(?:estimand|intercurrent event|ich e9)\b/i,
  /\b(?:non.?inferiority|equivalence|superiority margin)\b/i,
  /\b(?:crossover|parallel.?arm|basket trial|umbrella trial|platform trial)\b/i,
  /\b(?:statistical defensib|endpoint.*quality|reviewer.*risk.*statistic)\b/i,
];

export const SAFETY_TRIGGERS = [
  /\b(?:safety|adverse event|teae|sae|serious adverse|benefit.risk|dsur)\b/i,
  /\b(?:safety narrative|safety summary|safety section|safety report)\b/i,
  /\b(?:meddr|causality|severity|fatal|death|discontinu)\b/i,
];

export const CMC_TRIGGERS = [
  /\b(?:cmc|chemistry.*manufacturing|manufacturing|comparability|analytical method)\b/i,
  /\b(?:cqa|critical quality|process validation|control strategy|stability)\b/i,
  /\b(?:module 3|drug substance|drug product|excipient|specification)\b/i,
];

export const CSR_TRIGGERS = [
  /\b(?:csr|clinical study report|study report|ich e3)\b/i,
  /\b(?:efficacy.*result|safety.*result|disposition|demographics|baseline)\b/i,
];

export const HAQ_TRIGGERS = [
  /\b(?:haq|health authority question|information request)\b/i,
  /\b(?:fda question|ema question|reviewer question|agency question)\b/i,
  /\b(?:respond to.*question|draft.*response|answer.*agency)\b/i,
  /\b(?:rtq|request for information|day \d+ (?:question|list))\b/i,
];

export const DEVICE_TRIGGERS = [
  /\b(?:510\(k\)|predicate|substantial equivalence|medical device|de novo)\b/i,
  /\b(?:pma|premarket|eu mdr|ivdr|clinical evaluation report|cer)\b/i,
  /\b(?:device classification|product code|performance study)\b/i,
];

export const ECTD_TRIGGERS = [
  /\b(?:ectd|module [1-5]|ctd structure|dossier structure|submission structure)\b/i,
  /\b(?:granule|lifecycle|sequence|submission.*package)\b/i,
];

export const CMS_TRIGGERS = [
  /\b(?:cms|centers? for medicare|medicare|medicaid|coverage determination)\b/i,
  /\b(?:coding strategy|hcpcs|cpt|drg|apc|icd-10|ntap|pass-through)\b/i,
  /\b(?:reimbursement|payer|coverage|payment rate|value dossier|heor)\b/i,
];

export const DIAGNOSTICS_TRIGGERS = [
  /\b(?:diagnostic|companion diagnostic|cdx|in.?vitro diagnostic|ivd)\b/i,
  /\b(?:analytical validation|clinical validation|sensitivity|specificity|ppv|npv)\b/i,
  /\b(?:lodd?|linearity|precision|repeatability|reproducibility|method comparison)\b/i,
];

export const WISDOM_TRIGGERS = [
  /\b(?:common mistakes?|pitfalls?|rookie mistakes?|gotchas?|first.?time (?:sponsor|filer)s?)\b/i,
  /\btrips? (?:up )?(?:people|teams|sponsors|first.?timers?)\b/i,
  /\b(?:lessons? learned|hard.?won|war stor(?:y|ies)|best practices? for)\b/i,
  /\b(?:what should i (?:watch out for|avoid|know about))\b/i,
  /\b(?:what (?:do|would) (?:experienced|veteran|seasoned)\b)/i,
];

export const WAYFINDING_TRIGGERS = [
  /\b(?:where (?:do|should) i (?:start|begin)|how do i (?:get )?start|guide me|walk me through|orient me|i.?m new|new (?:here|to this)|where am i|what.?s the (?:process|journey|path))\b/i,
  /\b(?:what are my options|which (?:pathway|route) (?:should|do)|help me get (?:oriented|started)|i.?m lost|give me (?:a|the) tour)\b/i,
];

export function matchesTriggers(message: string, triggers: RegExp[]): boolean {
  return triggers.some(t => t.test(message));
}
