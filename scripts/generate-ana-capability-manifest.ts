/**
 * Generate the AnA capability manifest — a machine-readable inventory of every
 * AnA tool, enriched with the metadata a UI/design team needs to build surfaces
 * WITHOUT reading the handler code: plain description, input shape, suggested
 * renderer, global-vs-project scope, and whether the action is governed (Part 11).
 *
 * Source of truth = the live tool registry (ALL_ANA_TOOLS). Regenerate with:
 *   npx tsx scripts/generate-ana-capability-manifest.ts
 *
 * Outputs:
 *   docs/ana-capability-manifest.json   (full, machine-readable)
 *
 * The scope/governed/renderer fields are derived: precise OVERRIDES for known
 * tools, heuristics (documented below) for the rest. Heuristic-derived rows are
 * marked `"derived": true` so designers know which to sanity-check.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ALL_ANA_TOOLS } from '../server/services/ana/AnaToolDefinitions.js';
import { categorizeTool } from '../server/services/ana/tool-selection.js';

type Scope = 'global' | 'project';
type Renderer =
  | 'result-card' | 'findings-list' | 'ranked-cards' | 'table-csv'
  | 'document-canvas' | 'artifact-xml' | 'readiness-panel' | 'list'
  | 'chart:bars' | 'chart:trace' | 'chart:ceac' | 'chart:icer-plane'
  | 'chart:regression-band' | 'navigation' | 'none';

interface Override {
  scope: Scope;
  governed: boolean;
  renderer: Renderer | Renderer[];
  example: string;
  outputs?: string;
}

/** Precise metadata for the capabilities added in this work-stream (exact, not derived). */
const OVERRIDES: Record<string, Override> = {
  assemble_device_submission: { scope: 'project', governed: false, renderer: 'readiness-panel', example: 'Can we produce a submittable eSTAR for this 510(k)?', outputs: 'artifactKind + section readiness + blockers' },
  score_predicate_adequacy: { scope: 'global', governed: false, renderer: 'ranked-cards', example: 'Which of these predicates is strongest for our SE argument?', outputs: 'ranked predicates w/ score + factors' },
  code_drug: { scope: 'global', governed: false, renderer: 'result-card', example: "Code 'atorvastatin 20 mg tablet' to RxNorm", outputs: 'RxNorm concept matches' },
  navigate_to: { scope: 'global', governed: false, renderer: 'navigation', example: 'Take me to the CMC workspace', outputs: 'navigation directive (UI moves)' },
  list_app_screens: { scope: 'global', governed: false, renderer: 'none', example: 'Where can you take me in the app?', outputs: 'screen catalog' },
  model_budget_impact: { scope: 'global', governed: false, renderer: 'chart:bars', example: 'Model the 3-year budget impact at 10/20/30% uptake', outputs: 'per-year + cumulative impact, PMPM' },
  model_cost_effectiveness: { scope: 'global', governed: false, renderer: 'chart:icer-plane', example: 'Compute the ICER vs standard of care', outputs: 'ICER, dominance, NMB' },
  generate_spl: { scope: 'global', governed: false, renderer: 'artifact-xml', example: 'Generate the SPL XML for this label', outputs: 'SPL XML (download)' },
  validate_spl: { scope: 'global', governed: false, renderer: 'findings-list', example: 'Validate my SPL labeling spec', outputs: 'errors/warnings' },
  generate_define_xml: { scope: 'global', governed: false, renderer: 'artifact-xml', example: 'Generate define.xml for these SDTM datasets', outputs: 'define.xml (download) + conformance' },
  check_dataset_conformance: { scope: 'global', governed: false, renderer: 'findings-list', example: 'Check my ADaM datasets for conformance', outputs: 'findings + pass/fail' },
  import_ris_references: { scope: 'global', governed: false, renderer: 'list', example: 'Import these RIS references', outputs: 'structured references' },
  format_references: { scope: 'global', governed: false, renderer: 'document-canvas', example: 'Format these refs in AMA style', outputs: 'numbered bibliography' },
  lint_references: { scope: 'global', governed: false, renderer: 'findings-list', example: 'Lint my bibliography for gaps and duplicates', outputs: 'issues + duplicate groups' },
  build_sae_line_listing: { scope: 'project', governed: false, renderer: 'table-csv', example: 'Build the SAE line listing for Q1', outputs: 'line listing + summary + CSV' },
  compose_e2b_icsr: { scope: 'project', governed: false, renderer: ['artifact-xml', 'findings-list'], example: 'Compose the E2B ICSR for case AE-1042', outputs: 'ICSR elements + XML + mandatory-gap list' },
  assess_analytical_method_validation: { scope: 'global', governed: false, renderer: 'result-card', example: 'Assess this method validation data (ICH Q2)', outputs: 'linearity/precision/accuracy + pass/fail' },
  model_markov_cohort: { scope: 'global', governed: false, renderer: 'chart:trace', example: 'Run a 3-state Markov model over 20 cycles', outputs: 'cost/QALY + per-cycle trace' },
  run_probabilistic_sensitivity: { scope: 'global', governed: false, renderer: 'chart:ceac', example: 'Run a PSA with these cost/effect distributions', outputs: 'ICER, P(dominant), CEAC' },
  run_cdisc_pipeline: { scope: 'global', governed: false, renderer: ['findings-list', 'artifact-xml'], example: 'Run the full CDISC pipeline on this dataset spec', outputs: 'conformance + define.xml + readiness' },
  compose_correspondence_cover_letter: { scope: 'project', governed: false, renderer: ['document-canvas', 'findings-list'], example: 'Draft the FDA response cover letter for these issues', outputs: 'cover letter + missing-section list' },
  compose_510k_summary: { scope: 'project', governed: false, renderer: ['document-canvas', 'findings-list'], example: 'Compose the 510(k) Summary', outputs: '807.92 summary + missing-section list' },
  estimate_shelf_life: { scope: 'global', governed: false, renderer: 'chart:regression-band', example: 'Estimate shelf life from this stability data', outputs: 'shelf life + regression + CL band' },
};

const GOVERNED_RE = /^(create|update|delete|freeze|sign|submit|transmit|approve|revert|place_in|assemble_ectd|package_ectd|execute_platform_command|add_review|run_compliance)/;
const PROJECT_HINT_RE = /active (organization|project)|organization context|tenant|requires .* context/i;

function deriveScope(name: string, props: Record<string, any>): Scope {
  if (/project_id|projectId|document_id|documentId/.test(Object.keys(props).join(' '))) return 'project';
  const t = ALL_ANA_TOOLS.find((x) => x.name === name);
  if (t && PROJECT_HINT_RE.test(t.description ?? '')) return 'project';
  return 'global';
}
function deriveGoverned(name: string, desc: string): boolean {
  return GOVERNED_RE.test(name) || /governed|e-signature|confirm=true|reason for change|sign-?off/i.test(desc);
}
function deriveRenderer(name: string, desc: string): Renderer {
  const s = `${name} ${desc}`.toLowerCase();
  if (/\bxml\b|define\.xml|spl |estar xml|icsr/.test(s)) return 'artifact-xml';
  if (/line listing|tabulation|\bcsv\b/.test(s)) return 'table-csv';
  if (/cover letter|summary|draft|compose|generate_document|memo|narrative/.test(s)) return 'document-canvas';
  if (/validate|conformance|lint|deficien|check_|scan_|gaps?\b|contradiction/.test(s)) return 'findings-list';
  if (/\brank|score|adequacy|precedent/.test(s)) return 'ranked-cards';
  if (/navigate|screen/.test(s)) return 'navigation';
  return 'result-card';
}

interface ToolInput { name: string; type: string; required: boolean; description: string }
interface ManifestEntry {
  name: string;
  category: { id: string; label: string };
  description: string;
  scope: Scope;
  governed: boolean;
  renderer: Renderer | Renderer[];
  example: string;
  outputs?: string;
  inputs: ToolInput[];
  requiredInputs: string[];
  derived: boolean;
}

const named = ALL_ANA_TOOLS.filter((t) => typeof t.name === 'string');

const entries: ManifestEntry[] = named.map((t) => {
  const name = t.name as string;
  const schema = (t as any).input_schema ?? {};
  const props: Record<string, any> = schema.properties ?? {};
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const inputs: ToolInput[] = Object.entries(props).map(([k, v]) => ({
    name: k,
    type: (v as any)?.type ?? 'any',
    required: required.includes(k),
    description: ((v as any)?.description ?? '').slice(0, 240),
  }));
  const ov = OVERRIDES[name];
  return {
    name,
    category: categorizeTool(name),
    description: (t.description ?? '').replace(/\s+/g, ' ').trim(),
    scope: ov?.scope ?? deriveScope(name, props),
    governed: ov?.governed ?? deriveGoverned(name, t.description ?? ''),
    renderer: ov?.renderer ?? deriveRenderer(name, t.description ?? ''),
    example: ov?.example ?? '',
    ...(ov?.outputs ? { outputs: ov.outputs } : {}),
    inputs,
    requiredInputs: required,
    derived: !ov,
  };
});

entries.sort((a, b) => a.category.label.localeCompare(b.category.label) || a.name.localeCompare(b.name));

const byCategory: Record<string, number> = {};
for (const e of entries) byCategory[e.category.label] = (byCategory[e.category.label] ?? 0) + 1;

const manifest = {
  $schema: 'ana-capability-manifest/v1',
  generatedFrom: 'server/services/ana/AnaToolDefinitions.ts (ALL_ANA_TOOLS)',
  note: 'Regenerate with: npx tsx scripts/generate-ana-capability-manifest.ts. ' +
    'Fields scope/governed/renderer are EXACT for curated tools (derived:false) and HEURISTIC for derived:true rows (sanity-check those). ' +
    'Access model: every tool is reached by asking AnA in chat; the UI renders the result and (optionally) navigates. There is NOT one screen per tool.',
  renderers: {
    'result-card': 'Status badge + key/value table + methodology/notes expander + scope-caveat line.',
    'findings-list': 'Severity-tagged list (errors before warnings) + pass/fail summary.',
    'ranked-cards': 'Ordered cards each with a score, factor breakdown, strengths/concerns.',
    'table-csv': 'Data table with an Export CSV action.',
    'document-canvas': 'Rendered document body in a canvas/editor with export; show any missing-section banner.',
    'artifact-xml': 'XML preview + download, with provenance.',
    'readiness-panel': 'Producible-artifact verdict + blocker checklist.',
    'list': 'Simple structured list.',
    'chart:bars': 'Per-period bar chart (e.g. budget impact).',
    'chart:trace': 'Multi-series line chart of a cohort/state trace over cycles.',
    'chart:ceac': 'Cost-effectiveness acceptability curve (P vs WTP) + ICER scatter.',
    'chart:icer-plane': 'Cost-effectiveness plane (incremental cost vs effect).',
    'chart:regression-band': 'Scatter + fitted line + confidence band + spec line.',
    navigation: 'No panel — emits a navigation directive the chat client applies (action chip).',
    none: 'No dedicated rendering (discovery/utility).',
  },
  totals: { tools: entries.length, byCategory },
  tools: entries,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'docs', 'ana-capability-manifest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote ${entries.length} tools to docs/ana-capability-manifest.json`);
console.log('By category:', byCategory);
