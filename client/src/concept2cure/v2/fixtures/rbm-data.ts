/**
 * RBM presentation constants — the status vocabularies, the surface navigation
 * (labels, the AnA tool each surface maps to, and its starter prompts), the
 * cross-app link cards, and the pure banding helpers that mirror the server's
 * rbm-engine.
 *
 * This file holds NO study data. The fabricated BX204-301 records it used to
 * carry (summary tiles, CtQ register, KRIs, QTLs, signals, sites, patients,
 * plan, actions, report) are gone: every RBM surface renders the live board
 * (GET /api/mdx-rbm/rbm-board/:programId) or an honest empty state, so a
 * fixture here could only ever be a way to show something that is not true.
 */

/* -- Interfaces -- */

export interface RbmVocabEntry { l: string; tone: string }

export interface RbmNavItem {
  id: string; label: string; icon: string; tool: string; starters: string[];
}

export interface RbmLinkDef {
  surface: string; label: string; value: string; note: string;
}

/* View types for the surfaces that shape a board row before rendering it. */

export interface RbmSignal {
  id: string; source: string; type: string; severity: string; title: string;
  site: string; detail: string; detected: string; status: string;
  resolution?: string;
}

/* -- Pure helper functions (engine banding) -- */

export function rbmBand(score: number): string {
  return score >= 15 ? 'high' : score >= 8 ? 'medium' : 'low';
}

/**
 * Client-side banding, mirroring server/services/rbm/rbm-engine.ts kriStatus().
 *
 * Only used to label historical readings the board carries as bare numbers (the
 * trend table); a KRI's own status always comes from the server. An absent
 * reading, or an indicator with no threshold, is `not_evaluated` — never green.
 */
export function kriStatusOf(
  kri: { dir: string; amber: number | null; red: number | null },
  value: number | null,
): string {
  if (value == null || !Number.isFinite(Number(value))) return 'not_evaluated';
  if (kri.amber == null && kri.red == null) return 'not_evaluated';
  const v = Number(value);
  const worse = (t: number | null) => t != null && (kri.dir === 'lower_worse' ? v <= t : v >= t);
  return worse(kri.red) ? 'red' : worse(kri.amber) ? 'amber' : 'green';
}


/* -- Status vocabularies -- */

export const RBM_VOCAB: Record<string, Record<string, RbmVocabEntry>> = {
  band:     { low: { l: 'Low', tone: 'ok' }, medium: { l: 'Medium', tone: 'warn' }, high: { l: 'High', tone: 'err' } },
  item:     { open: { l: 'Open', tone: 'warn' }, mitigating: { l: 'Mitigating', tone: 'ai' }, accepted: { l: 'Accepted', tone: 'neutral' }, closed: { l: 'Closed', tone: 'ok' } },
  // `not_evaluated` is deliberately its own chip: an indicator with no reading
  // has not been shown to be in control, and must not read as a green one.
  kri:      { green: { l: 'Green', tone: 'ok' }, amber: { l: 'Amber', tone: 'warn' }, red: { l: 'Red', tone: 'err' }, not_evaluated: { l: 'Not evaluated', tone: 'neutral' } },
  qtl:      { within: { l: 'Within', tone: 'ok' }, approaching: { l: 'Approaching', tone: 'warn' }, breached: { l: 'Breached', tone: 'err' }, not_evaluated: { l: 'Not evaluated', tone: 'neutral' } },
  severity: { low: { l: 'Low', tone: 'neutral' }, medium: { l: 'Medium', tone: 'ai' }, high: { l: 'High', tone: 'warn' }, critical: { l: 'Critical', tone: 'err' } },
  signal:   { new: { l: 'New', tone: 'warn' }, triaged: { l: 'Triaged', tone: 'ai' }, investigating: { l: 'Investigating', tone: 'ai' }, resolved: { l: 'Resolved', tone: 'ok' }, dismissed: { l: 'Dismissed', tone: 'neutral' } },
  tier:     { reduced: { l: 'Reduced', tone: 'ok' }, standard: { l: 'Standard', tone: 'neutral' }, enhanced: { l: 'Enhanced', tone: 'err' } },
  patient:  { normal: { l: 'Normal', tone: 'ok' }, review: { l: 'Review', tone: 'warn' }, flagged: { l: 'Flagged', tone: 'err' } },
  strategy: { centralized: { l: 'Centralized', tone: 'ai' }, risk_based: { l: 'Risk-based', tone: 'ok' }, on_site: { l: 'On-site', tone: 'neutral' }, hybrid: { l: 'Hybrid', tone: 'ai' } },
  action:   { open: { l: 'Open', tone: 'warn' }, in_progress: { l: 'In progress', tone: 'ai' }, done: { l: 'Done', tone: 'ok' } },
  atype:    { issue: { l: 'Issue', tone: 'neutral' }, capa: { l: 'CAPA', tone: 'neutral' }, site_visit: { l: 'Site visit', tone: 'neutral' }, query: { l: 'Query', tone: 'neutral' }, escalation: { l: 'Escalation', tone: 'neutral' } },
  section:  { ok: { l: 'Ok', tone: 'ok' }, attention: { l: 'Attention', tone: 'warn' }, critical: { l: 'Critical', tone: 'err' } },
};

/* -- Navigation -- */

export const RBM_NAV: RbmNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'barChart', tool: 'get_rbm_attention',
    starters: ['Summarize the risk-based monitoring posture for this study', 'Which critical-to-quality factors are still open', 'What needs my attention across KRIs, QTLs and signals'] },
  { id: 'report', label: 'Risk review report', icon: 'fileText', tool: 'generate_rbm_report',
    starters: ['Generate the ICH E6(R3) risk review report', 'Summarize the overall risk posture for an inspection', 'What would a regulator flag'] },
  { id: 'ract', label: 'Risk assessment (RACT)', icon: 'clipboardList', tool: 'run_rbm_assessment',
    starters: ['Seed a default ICH E6(R3) risk assessment', 'Rank the critical-to-quality factors by risk score', 'Which risks have no mitigation'] },
  { id: 'kris', label: 'Key risk indicators', icon: 'sigma', tool: 'evaluate_kris_qtls',
    starters: ['Which KRIs are amber or red right now', 'Seed the standard KRI library', 'Explain each red KRI and its driver'] },
  { id: 'qtls', label: 'Quality tolerance limits', icon: 'scale', tool: 'evaluate_kris_qtls',
    starters: ['Which QTLs are approaching or breached', 'Propose quality tolerance limits for this study', 'What action does a breached QTL require'] },
  { id: 'signals', label: 'Central monitoring', icon: 'zap', tool: 'run_central_monitoring',
    starters: ['Prioritize the open signals by urgency', 'Which sites carry the most high-severity signals', 'Draft an action for the most critical signal'] },
  { id: 'patients', label: 'Patient profiles', icon: 'search', tool: 'scan_patient_profiles',
    starters: ['Scan the patient cohort for atypical subjects', 'Which patients are flagged for medical review', 'Explain why subject 1104-014 is an anomaly'] },
  { id: 'sites', label: 'Site risk', icon: 'network', tool: 'assess_site_risk',
    starters: ['Recompute site risk and show the enhanced-tier sites', 'Which sites should move to enhanced monitoring and why', 'Explain the drivers behind the highest-risk site'] },
  { id: 'oversight', label: 'Site oversight', icon: 'eye', tool: 'run_central_monitoring',
    starters: ['Show site oversight ranked by risk', 'Which sites carry the most open high-severity signals', 'Summarize what each enhanced-tier site needs'] },
  { id: 'plan', label: 'Monitoring plan', icon: 'checkSquare', tool: 'generate_rbm_plan',
    starters: ['Generate a risk-based monitoring plan from the assessment', 'Recommend a monitoring strategy for this risk level', 'Turn the critical risks into monitoring actions'] },
];

/* -- Cross-app links -- */

// Cross-app link cards for the RBM shell. `value` is an honest descriptor of the
// destination — not a live count — so nothing fabricated is shown; the cards are
// navigation affordances into the real surfaces.
export const RBM_LINKS: Record<string, RbmLinkDef> = {
  project: { surface: 'projects', label: 'Project management', value: 'Program & project home', note: 'Scoped to this program; posture rolls up to the project home.' },
  vault: { surface: 'vault', label: 'Vault', value: 'Monitoring reports & CAPAs', note: 'Monitoring reports, CAPAs and site-visit records filed to the DMS.' },
  tasks: { surface: 'tasks', label: 'Tasking', value: 'Unified task board', note: 'Monitoring actions are tracked on the RBM monitoring plan; they are not pushed to the org-wide task board.' },
  biostats: { surface: 'biostatistics', label: 'Biostatistics', value: 'Estimand & power impact', note: 'Breached QTLs route here for ICH E9(R1) estimand and power/sample-size impact.' },
};


