/**
 * Deep Research fixture data — ported verbatim from kit app/deep-research.jsx.
 *
 * Connector catalog mirrors CONNECTOR_CATALOG (server/services/connectors/
 * connector-interface.ts). 18 connectors with exact id / type / category /
 * requiredTier / requiresCredentials / credentialFields.
 */

/* ── Types ── */

export interface CredentialField {
  field: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export type ConnectorTier = 'free' | 'standard' | 'professional' | 'enterprise';
export type ConnectorType = 'api' | 'scraper';
export type ConnectorCategory =
  | 'clinical_data'
  | 'literature'
  | 'regulatory'
  | 'dms'
  | 'ehr'
  | 'funding'
  | 'compliance'
  | 'sor';

export interface ConnectorInfo {
  id: string;
  name: string;
  type: ConnectorType;
  cat: ConnectorCategory;
  tier: ConnectorTier;
  creds: boolean;
  icon: string;
  desc: string;
  cf: CredentialField[];
}

export interface ConnectorState extends ConnectorInfo {
  configured: boolean;
}

export interface DrResult {
  conn: string;
  title: string;
  date: string;
  meta: string;
}

export interface DrJob {
  name: string;
  state: 'run' | 'done';
  hits: number;
}

/**
 * The depths the research engine actually has.
 *
 * Was `'quick' | 'standard' | 'exhaustive'`. The engine has two:
 * deep-research-orchestrator.ts:86 charges
 * `request.depth === 'comprehensive' ? 3 : 1`, and POST /api/deep-research/jobs
 * defaults anything else to 'standard'. The third option was never a third
 * request — DeepResearch.tsx sent 'standard' for BOTH 'quick' and 'standard'.
 */
export type ResearchDepth = 'standard' | 'comprehensive';

/* ── Connector catalog (verbatim from CONNECTOR_CATALOG) ── */

export const DR_CATS: Record<string, string> = {
  regulatory: 'Regulatory',
  literature: 'Literature',
  clinical_data: 'Clinical data',
  dms: 'Document management (DMS)',
  ehr: 'EHR / clinical systems',
  funding: 'Funding',
  compliance: 'Compliance',
  sor: 'System of record',
};

/**
 * Research depth options, with the credit cost the engine ACTUALLY charges.
 *
 * ── What this said before ─────────────────────────────────────────────────────
 *   ['quick', 'Quick', '1 credit'], ['standard', 'Standard', '3 credits'],
 *   ['exhaustive', 'Exhaustive', '8 credits']
 *
 * Two of those three prices were wrong, and they were shown to a paying
 * customer at the moment of purchase. DeepResearch.tsx collapsed three UI
 * options into two server values (`depth === 'exhaustive' ? 'comprehensive' :
 * 'standard'`), and deep-research-orchestrator.ts:86 charges
 * `depth === 'comprehensive' ? 3 : 1`:
 *
 *   Quick       shown 1 credit  → sent 'standard'      → charged 1   correct
 *   Standard    shown 3 credits → sent 'standard'      → charged 1   3x over
 *   Exhaustive  shown 8 credits → sent 'comprehensive' → charged 3   2.7x over
 *
 * "Quick" and "Standard" were also the same request: identical payload,
 * identical cost, presented as two priced choices.
 *
 * ── The server had already refused to serve this ──────────────────────────────
 * deep-research-board.routes.ts documents it under OMITTED / NOT fabricated:
 * "DEPTHS (quick/standard/exhaustive @ 1/3/8 credits) is NOT served. The
 * engine's real depth model is standard|comprehensive @ 1|3 credits … Serving
 * the fixture's option/pricing model would fabricate credit costs the engine
 * does not charge — kept as a client constant."
 *
 * The server declined to fabricate it and the client rendered it anyway. The
 * keys below are now the engine's own values, so nothing translates them on the
 * way out and a price cannot drift from what is charged without this file and
 * the orchestrator disagreeing in the same review.
 */
export const DEPTHS: [ResearchDepth, string, string][] = [
  ['standard', 'Standard', '1 credit'],
  ['comprehensive', 'Comprehensive', '3 credits'],
];

export const TIER_TONE: Record<ConnectorTier, string> = {
  free: 'ok',
  standard: 'ai',
  professional: 'warn',
  enterprise: 'idle',
};
