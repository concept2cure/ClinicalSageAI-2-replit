/**
 * @fileoverview Intent-based tool selection for the agentic ANA loop.
 * @module server/services/ana/tool-selection
 *
 * The conversational ANA can be offered 100+ tools. Sending every tool on every
 * turn is correct but heavy — it grows prompt latency and cost as the surface
 * expands. This selects the subset relevant to the current turn's intent while
 * GUARANTEEING that ANA never loses a capability:
 *
 *   - The platform command bridge (list_platform_commands / execute_platform_command)
 *     is ALWAYS included. It is the catch-all: anything the relevance filter
 *     drops is still reachable by discovering + invoking it through the bridge.
 *   - A small core of always-relevant tools (search, guidance, generic authoring)
 *     is always included.
 *   - Below the cap, the full surface passes through unchanged — filtering only
 *     engages once the surface is genuinely large.
 *
 * Pure, deterministic, no LLM/DB — so it adds no latency of its own and is
 * trivially testable. Self-maintaining: relevance is scored from each tool's own
 * name + description, so new tools participate automatically.
 */

/** Tools that are always offered, regardless of the turn's intent. */
export const ALWAYS_ON_TOOLS: ReadonlySet<string> = new Set([
  // The catch-all bridge — guarantees no capability is ever filtered away.
  'list_platform_commands',
  'execute_platform_command',
  // Core tools relevant to almost any regulatory conversation.
  'project_knowledge_search',
  'global_search',
  'search_clinical_evidence',
  'search_literature',
  'lookup_fda_guidance',
  'lookup_ich_guideline',
  'generate_document',
  'generate_citation',
  'fetch_template_and_fill',
]);

const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'was', 'our', 'you', 'your',
  'can', 'could', 'would', 'should', 'please', 'help', 'need', 'want', 'have', 'has',
  'from', 'into', 'about', 'what', 'how', 'why', 'when', 'who', 'get', 'got', 'make',
  'made', 'use', 'using', 'will', 'shall', 'them', 'they', 'its', 'it', 'me', 'my',
  'we', 'us', 'do', 'does', 'did', 'is', 'be', 'an', 'of', 'to', 'in', 'on', 'or',
  'at', 'as', 'by', 'a', 'i',
]);

/** Situational signals that bias selection beyond the message text. */
export interface ToolSelectionContext {
  /** Submission/program type, e.g. "IND", "NDA", "BLA", "510k". */
  projectType?: string;
  /** Active document / CTD type, e.g. "nonclinical_overview", "qos", "clinical_summary". */
  documentType?: string;
  /** Active surface / screen, e.g. "cmc", "nonclinical", "labeling". */
  surface?: string;
  /** Extra free-text hints — recent intents, anticipated needs. */
  hints?: string[];
}

export interface ToolSelectionOptions {
  /** Maximum number of tools to offer (default 50). */
  maxTools?: number;
  /** Situational context folded into the relevance signal (project, document, surface). */
  context?: ToolSelectionContext;
  /** Tool names the user explicitly selected in the picker — always included. */
  pinned?: string[];
  /**
   * Tools currently observed to be unreliable (caller supplies this from live
   * execution telemetry — keeps this module pure). They are sorted BELOW healthy
   * tools so they are cut first when the surface exceeds `maxTools`, but are
   * never removed from the always-on core (the capability guarantee holds).
   */
  deprioritize?: ReadonlySet<string>;
}

interface NamedTool {
  name?: string;
  description?: string;
}

/** Salient lowercase terms from the turn text (≥3 chars, no stopwords, deduped). */
function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])) {
    if (!STOPWORDS.has(raw)) seen.add(raw);
  }
  return [...seen];
}

/** Relevance score: name matches weigh more than description matches. */
function scoreTool(tool: NamedTool, terms: string[]): number {
  const name = (tool.name ?? '').toLowerCase();
  const text = `${name} ${(tool.description ?? '').toLowerCase()}`;
  let score = 0;
  for (const term of terms) {
    if (name.includes(term)) score += 3;
    else if (text.includes(term)) score += 1;
  }
  return score;
}

/**
 * Select the tools to offer for a turn. Always includes the bridge + core; fills
 * the remaining budget with the highest-relevance tools for the query. Returns
 * the full set unchanged when it already fits within `maxTools`, and can be
 * disabled entirely via ANA_TOOL_SELECTION_DISABLED=1.
 */
export function selectToolsForTurn<T extends NamedTool>(
  allTools: T[],
  query: string,
  opts: ToolSelectionOptions = {},
): T[] {
  if (process.env.ANA_TOOL_SELECTION_DISABLED === '1') return allTools;

  const max = opts.maxTools ?? 50;
  if (allTools.length <= max) return allTools;

  const pinned = new Set(opts.pinned ?? []);

  // Always-on: server tools (no name) + the named always-on set + the user's
  // explicit picks from the tool selector. Pinning never crowds out the bridge.
  const always = allTools.filter(t => !t.name || ALWAYS_ON_TOOLS.has(t.name) || pinned.has(t.name));
  const alwaysNames = new Set(always.map(t => t.name));

  // Fold the situational context into the intent signal so selection reflects
  // the project, document type, and surface — not just the message wording.
  const ctx = opts.context;
  const signal = [
    query,
    ctx?.projectType ?? '',
    ctx?.documentType ?? '',
    ctx?.surface ?? '',
    ...(ctx?.hints ?? []),
  ].join(' ');
  const terms = tokenize(signal);
  if (terms.length === 0) return always; // no intent signal — bridge covers the rest

  // Reliability-aware ranking: healthy tools rank ahead of currently-unhealthy
  // ones (caller-supplied), and within each group by relevance score. So when
  // the surface is over the cap, unhealthy tools are the first to be trimmed.
  const deprioritize = opts.deprioritize;
  const scored = allTools
    .filter(t => t.name && !alwaysNames.has(t.name))
    .map(t => ({ t, score: scoreTool(t, terms), healthy: !deprioritize?.has(t.name as string) }))
    .filter(x => x.score > 0)
    .sort((a, b) => (a.healthy === b.healthy ? b.score - a.score : a.healthy ? -1 : 1));

  const room = Math.max(0, max - always.length);
  return [...always, ...scored.slice(0, room).map(x => x.t)];
}

// ── Tool catalog — powers the user's tool-picker ─────────────────────────────

/** Ordered category rules — first match wins; anything unmatched is 'other'. */
const CATEGORY_RULES: ReadonlyArray<{ id: string; label: string; test: RegExp }> = [
  { id: 'platform', label: 'Platform control', test: /platform_command|^list_platform|^execute_platform/ },
  { id: 'nonclinical', label: 'Nonclinical (M4)', test: /nonclinical|tox|fih|noael|_m2_4|_m2_6|preclinical/ },
  { id: 'clinical_pharmacology', label: 'Clinical pharmacology', test: /ddi|qtc|exposure_response|characterize_pk|pharmacokin/ },
  { id: 'clinical', label: 'Clinical (M5 / M2)', test: /clinical|csr|_m2_5|_m2_7|endpoint|study_ae|deviation|adverse_event/ },
  { id: 'cmc_quality', label: 'CMC / Quality (M3)', test: /qos|quality_overall|_m2_3|cmc|comparability|analytical|immunogenic|stability|module_?3/ },
  { id: 'device_ivd', label: 'Device / IVD', test: /510k|predicate|ivd|clia|ldt|udi|labeling|companion|software_lifecycle|performance/ },
  { id: 'qms', label: 'Quality management', test: /qms|supplier|nonconforming|risk_item|risk_control|training|ack_/ },
  { id: 'submission', label: 'Submission / eCTD', test: /ectd|submission|transmit|gateway|validation_finding|legacy_import|q_sub|package/ },
  { id: 'biostatistics', label: 'Biostatistics', test: /sample_size|statistical|study_design|scenario|defensibility|missing_data|dose_escalation/ },
  { id: 'evidence', label: 'Evidence & intelligence', test: /search|lookup|precedent|literature|guidance|reviewer|change_impact|mine_/ },
  { id: 'authoring', label: 'Authoring & rendering', test: /docx|pdf|template|generate_document|generate_citation|write_|extract_|rasterize|compare_document|draft_/ },
  { id: 'governance', label: 'Governance & data', test: /memory|metadata|notification|import|consistency|numerical_integrity|cross_reference/ },
];

/** Resolve a tool's display category from its name. */
export function categorizeTool(name: string): { id: string; label: string } {
  for (const rule of CATEGORY_RULES) if (rule.test.test(name)) return { id: rule.id, label: rule.label };
  return { id: 'other', label: 'Other' };
}

export interface ToolCatalogEntry {
  name: string;
  description: string;
}
export interface ToolCatalogCategory {
  id: string;
  label: string;
  tools: ToolCatalogEntry[];
}

/**
 * Group the named tools into categories for the user's tool-picker dropdown.
 * Server-native tools (no name) are omitted. Categories follow CATEGORY_RULES
 * order, with 'other' last.
 */
export function getToolCatalog<T extends NamedTool>(allTools: T[]): ToolCatalogCategory[] {
  const byCat = new Map<string, ToolCatalogCategory>();
  for (const t of allTools) {
    if (!t.name) continue;
    const cat = categorizeTool(t.name);
    if (!byCat.has(cat.id)) byCat.set(cat.id, { id: cat.id, label: cat.label, tools: [] });
    byCat.get(cat.id)!.tools.push({ name: t.name, description: (t.description ?? '').slice(0, 200) });
  }
  const order = [...CATEGORY_RULES.map(r => r.id), 'other'];
  return [...byCat.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
