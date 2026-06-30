/**
 * Natural-history / external-control evidence-dossier composer for AnA (E13).
 *
 * Assembles a defensible natural-history / external-control evidence dossier
 * supporting a rare-disease pivotal-trial rationale where a concurrent control
 * is infeasible. It is the synthesis layer that sits on top of two already-built
 * tools:
 *
 *   - `search_clinical_evidence`  → gathers natural-history / external-control
 *                                   source studies (cited by NCT id + URL).
 *   - `advise_rwe_design`         → supplies the external-control design
 *                                   rationale (target-trial emulation, time-zero,
 *                                   confounding control, comparability/bias).
 *
 * The composed dossier is then authored as a native Word-grade .docx via
 * `author_docx_native`, and proved with `verify_docx_against_source` using the
 * `required_strings` this module derives (every cited source identifier + every
 * mandatory section header), so the VerificationPanel can demonstrate that every
 * prevalence / effect / outcome claim carries a cited source and every required
 * section is present.
 *
 * 21 CFR Part 11 honesty contract (enforced here, not advisory):
 *   - Every prevalence / effect / outcome claim MUST carry a cited source. An
 *     uncited claim is a hard error — the dossier cannot be assembled.
 *   - A dossier whose evidence provenance is `sample` or `not_assessed` is NOT
 *     sealable / exportable; only `live`-provenance dossiers may be exported.
 *
 * Deterministic, dependency-free, data-driven — pure functions over plain data,
 * unit-tested in isolation. Live evidence-search joins are marked
 * `// INTEGRATION:` and stubbed with fixtures here.
 *
 * @module server/services/ana/nat-history-dossier
 */

// ─────────────────────────────────────────────────────────────────────────────
// Source & claim model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provenance of the evidence backing a dossier. Mirrors the honesty contract:
 * only `live` evidence (a real search_clinical_evidence join) is sealable /
 * exportable. `sample` (fixture) and `not_assessed` (no search run) are draft-
 * only — they may be previewed but never sealed or exported.
 */
export type EvidenceProvenance = 'live' | 'sample' | 'not_assessed';

/**
 * The kind of role a source plays in the dossier. Natural-history sources
 * characterise untreated disease course; external-control sources are candidate
 * comparator cohorts.
 */
export type SourceRole = 'natural_history' | 'external_control';

/** A single cited evidence source (typically a search_clinical_evidence hit). */
export interface EvidenceSource {
  /** Stable citation identifier — an NCT id, PMID, or DOI. Must be non-empty. */
  id: string;
  role: SourceRole;
  title: string;
  /** Canonical, citeable URL (e.g. https://clinicaltrials.gov/study/NCT…). */
  url: string;
  /** Lead sponsor / first author / registry, for the source table. */
  source: string;
  /** Cohort size, when reported. */
  n?: number | null;
  /** Design descriptor, e.g. "Prospective natural-history cohort". */
  design?: string;
}

/**
 * A quantitative claim made in the dossier body. Every prevalence / effect /
 * outcome assertion is modelled as a claim and MUST reference a source id that
 * appears in the dossier's source set — this is the honesty guard.
 */
export interface EvidenceClaim {
  kind: 'prevalence' | 'effect' | 'outcome';
  /** The asserted text, e.g. "Median time to ambulation loss was 9.5 years". */
  text: string;
  /** The source id (must match an EvidenceSource.id) that supports the claim. */
  sourceId: string;
}

/** RWE / external-control design rationale (from advise_rwe_design). */
export interface ExternalControlDesign {
  /** e.g. "target_trial_emulation". */
  design: string;
  /** Human-readable rationale paragraph(s). */
  rationale: string;
  /** Comparability / bias-mitigation considerations to surface explicitly. */
  comparabilityConsiderations: string[];
}

export interface NatHistoryDossierRequest {
  /** Disease / indication the dossier supports. */
  indication: string;
  /** Sponsor / program name, for the title block. */
  sponsor?: string;
  /** Cited evidence sources (natural-history + external-control). */
  sources: EvidenceSource[];
  /** Quantitative claims; each must cite a source id in `sources`. */
  claims: EvidenceClaim[];
  /** The external-control design rationale. */
  design: ExternalControlDesign;
  /** Provenance of the evidence — drives sealable/exportable. */
  provenance: EvidenceProvenance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mandatory section headers — the dossier's required structure. These are also
// asserted verbatim by verify_docx_against_source via required_strings, so the
// VerificationPanel proves the document is structurally complete.
// ─────────────────────────────────────────────────────────────────────────────

export const DOSSIER_SECTION_HEADERS = [
  'Disease Natural History',
  'Proposed External Control',
  'Comparability and Bias Discussion',
  'Source Evidence Table',
] as const;

export type DossierSectionHeader = (typeof DOSSIER_SECTION_HEADERS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Honesty guard
// ─────────────────────────────────────────────────────────────────────────────

export interface HonestyGuardResult {
  ok: boolean;
  /** Claims whose sourceId does not resolve to a cited source. */
  uncitedClaims: EvidenceClaim[];
  /** Sources missing a citation id (id or url blank). */
  uncitedSources: EvidenceSource[];
  /** True only when provenance === 'live' (the sole sealable/exportable state). */
  sealable: boolean;
  exportable: boolean;
  reasons: string[];
}

/**
 * Enforce the Part 11 honesty contract on a dossier request:
 *   1. Every claim must cite a source id present in the source set.
 *   2. Every source must carry a non-empty citation id and url.
 *   3. Only `live` provenance is sealable / exportable.
 *
 * Pure — returns the verdict; callers decide whether to proceed.
 */
export function evaluateHonestyGuard(req: NatHistoryDossierRequest): HonestyGuardResult {
  const ids = new Set(req.sources.map((s) => s.id).filter(Boolean));

  const uncitedClaims = req.claims.filter((c) => !c.sourceId || !ids.has(c.sourceId));
  const uncitedSources = req.sources.filter((s) => !s.id?.trim() || !s.url?.trim());

  const reasons: string[] = [];
  if (uncitedClaims.length > 0) {
    reasons.push(
      `${uncitedClaims.length} claim(s) lack a resolvable cited source — every prevalence, effect, or outcome claim must carry a citation.`,
    );
  }
  if (uncitedSources.length > 0) {
    reasons.push(`${uncitedSources.length} source(s) are missing a citation id or URL.`);
  }

  const ok = uncitedClaims.length === 0 && uncitedSources.length === 0;

  // Honesty contract: sample / not_assessed evidence is never sealable or
  // exportable, even when every claim is cited.
  const provenanceSealable = req.provenance === 'live';
  if (!provenanceSealable) {
    reasons.push(
      `Evidence provenance is "${req.provenance}" — sample / unassessed dossiers are not sealable or exportable. Re-run with a live evidence search.`,
    );
  }

  return {
    ok,
    uncitedClaims,
    uncitedSources,
    sealable: ok && provenanceSealable,
    exportable: ok && provenanceSealable,
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// required_strings derivation — source ids + mandatory section headers. This is
// what we hand to verify_docx_against_source so the VerificationPanel proves
// (a) every section is present and (b) every cited source identifier appears
// verbatim in the rendered document.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the `required_strings` for verify_docx_against_source: the union of
 * every mandatory section header and every cited source identifier (deduped,
 * order-stable: headers first, then source ids in source order). Pure.
 */
export function deriveRequiredStrings(req: NatHistoryDossierRequest): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s?.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  for (const h of DOSSIER_SECTION_HEADERS) push(h);
  for (const s of req.sources) push(s.id);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source-table renderer — pipe-delimited markdown table consumed by
// author_docx_native (which renders |col|col| rows + |---|---| separator into a
// real Word table). Pure + independently tested.
// ─────────────────────────────────────────────────────────────────────────────

function escapeCell(v: string): string {
  // Pipes would break the markdown table grid author_docx_native parses.
  return v.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function roleLabel(role: SourceRole): string {
  return role === 'natural_history' ? 'Natural history' : 'External control';
}

/**
 * Render the cited sources as a pipe-delimited markdown table. Columns:
 * Identifier · Role · Title · Source · N · Design · URL. Every row carries the
 * source identifier and its citeable URL so the table itself is the citation
 * ledger. Pure.
 */
export function renderSourceTable(sources: EvidenceSource[]): string {
  const header = '| Identifier | Role | Title | Source | N | Design | URL |';
  const sep = '|---|---|---|---|---|---|---|';
  if (sources.length === 0) {
    return [header, sep, '| (no sources) | — | — | — | — | — | — |'].join('\n');
  }
  const rows = sources.map((s) =>
    [
      escapeCell(s.id),
      roleLabel(s.role),
      escapeCell(s.title),
      escapeCell(s.source),
      s.n == null ? '—' : String(s.n),
      escapeCell(s.design ?? '—'),
      escapeCell(s.url),
    ]
      .map((c) => c || '—')
      .join(' | '),
  );
  return [header, sep, ...rows.map((r) => `| ${r} |`)].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Dossier assembly — produces the markdown `content` for author_docx_native,
// with every required section header and every claim suffixed by its citation.
// ─────────────────────────────────────────────────────────────────────────────

function citeClaim(c: EvidenceClaim, byId: Map<string, EvidenceSource>): string {
  const src = byId.get(c.sourceId);
  const cite = src ? `${src.id}` : c.sourceId;
  // Source text always carries the identifier inline so a reader (and the
  // verifier) can tie the claim to the source table.
  return `${c.text.replace(/\s*$/, '')} (${cite}).`;
}

export interface AssembledDossier {
  title: string;
  /** Markdown content for author_docx_native. */
  content: string;
  /** required_strings for verify_docx_against_source. */
  requiredStrings: string[];
  honesty: HonestyGuardResult;
}

/**
 * Assemble the full natural-history / external-control dossier into the markdown
 * `content` author_docx_native consumes, plus the derived `requiredStrings`.
 *
 * Throws if the honesty guard fails (uncited claim or uncited source) — an
 * un-cited dossier must never be assembled. Provenance-based non-exportability
 * does NOT throw (a draft preview is allowed); callers gate sealing/export on
 * `honesty.exportable`.
 */
export function assembleNatHistoryDossier(req: NatHistoryDossierRequest): AssembledDossier {
  const honesty = evaluateHonestyGuard(req);
  if (honesty.uncitedClaims.length > 0 || honesty.uncitedSources.length > 0) {
    throw new Error(
      `Cannot assemble dossier — honesty guard failed: ${honesty.reasons.join(' ')}`,
    );
  }

  const byId = new Map(req.sources.map((s) => [s.id, s] as const));
  const nh = req.claims.filter((c) => byId.get(c.sourceId)?.role === 'natural_history');
  const ec = req.claims.filter((c) => byId.get(c.sourceId)?.role === 'external_control');

  const title = `Natural-History / External-Control Evidence Dossier — ${req.indication}`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (req.sponsor) lines.push(`Sponsor / program: ${req.sponsor}`);
  lines.push(
    'This dossier supports a rare-disease pivotal-trial rationale where a concurrent ' +
      'control is infeasible. Every prevalence, effect, and outcome claim below carries a ' +
      'cited source; the Source Evidence Table is the citation ledger.',
  );

  // §1 Disease Natural History
  lines.push(`## ${'Disease Natural History' satisfies DossierSectionHeader}`);
  lines.push(
    `The untreated course of ${req.indication} is characterised by the following, each drawn ` +
      'from the cited natural-history sources:',
  );
  if (nh.length > 0) {
    for (const c of nh) lines.push(`- ${citeClaim(c, byId)}`);
  } else {
    lines.push('- No natural-history claims supplied.');
  }

  // §2 Proposed External Control
  lines.push(`## ${'Proposed External Control' satisfies DossierSectionHeader}`);
  lines.push(`Design approach: ${req.design.design}.`);
  lines.push(req.design.rationale);
  if (ec.length > 0) {
    lines.push('Candidate external-control evidence:');
    for (const c of ec) lines.push(`- ${citeClaim(c, byId)}`);
  }

  // §3 Comparability and Bias Discussion
  lines.push(`## ${'Comparability and Bias Discussion' satisfies DossierSectionHeader}`);
  lines.push(
    'A defensible external control must address comparability and the biases that arise when ' +
      'the comparator is non-concurrent. The following are considered explicitly:',
  );
  if (req.design.comparabilityConsiderations.length > 0) {
    for (const c of req.design.comparabilityConsiderations) lines.push(`- ${c}`);
  } else {
    lines.push('- No comparability considerations supplied.');
  }

  // §4 Source Evidence Table
  lines.push(`## ${'Source Evidence Table' satisfies DossierSectionHeader}`);
  lines.push(renderSourceTable(req.sources));

  return {
    title,
    content: lines.join('\n\n'),
    requiredStrings: deriveRequiredStrings(req),
    honesty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture evidence — keeps the composer green-in-isolation without a live
// search. Provenance is 'sample', so a fixture-backed dossier is deliberately
// NOT exportable (the honesty contract). Swap for a live join at the call site.
//
// INTEGRATION: replace gatherSampleEvidence() with a real search_clinical_evidence
// join — map CtgovTrial → EvidenceSource (id=nctId, url=url, source=sponsor,
// n=enrollment, design=studyType) and lift natural-history/external-control
// claims from the returned cohorts. Set provenance:'live' on the result.
//
// BUILD-1 INTEGRATION: once Build 1 (document versioning) lands, persist the
// assembled dossier as a version row keyed by (organizationId, projectId,
// title) and surface it in the Document Studio version picker — only when
// honesty.exportable is true.
//
// BUILD-2 NOTE: this synthesis-heavy task suits a "thorough" effort setting
// (Build 2) — broader evidence fan-out and deeper comparability reasoning. Do
// not implement here; flagged for the Build-2 effort-tier work.
// ─────────────────────────────────────────────────────────────────────────────

export function gatherSampleEvidence(indication: string): NatHistoryDossierRequest {
  const sources: EvidenceSource[] = [
    {
      id: 'NCT01865084',
      role: 'natural_history',
      title: `Prospective natural-history study of ${indication}`,
      url: 'https://clinicaltrials.gov/study/NCT01865084',
      source: 'Academic consortium',
      n: 240,
      design: 'Prospective natural-history cohort',
    },
    {
      id: 'NCT02255552',
      role: 'external_control',
      title: `Registry cohort of ${indication} (candidate external control)`,
      url: 'https://clinicaltrials.gov/study/NCT02255552',
      source: 'Patient registry',
      n: 112,
      design: 'Observational registry',
    },
  ];

  const claims: EvidenceClaim[] = [
    {
      kind: 'prevalence',
      text: `Reported point prevalence of ${indication} is approximately 1 in 50,000`,
      sourceId: 'NCT01865084',
    },
    {
      kind: 'outcome',
      text: 'Median time to loss of independent ambulation was 9.5 years from symptom onset',
      sourceId: 'NCT01865084',
    },
    {
      kind: 'effect',
      text:
        'In the registry cohort, untreated annual decline on the functional scale was 4.1 points',
      sourceId: 'NCT02255552',
    },
  ];

  const design: ExternalControlDesign = {
    design: 'target_trial_emulation',
    rationale:
      'Because the disease is rare and rapidly progressive, randomising patients to a concurrent ' +
      'untreated arm is infeasible and arguably unethical. We therefore emulate a target trial ' +
      'using the natural-history cohort as the external control, defining time-zero at a matched ' +
      'disease milestone and pre-specifying the estimand and analysis before unblinding.',
    comparabilityConsiderations: [
      'Time-zero alignment: anchor the external control to the same disease milestone as the treated arm to avoid immortal-time bias.',
      'Measured confounding: pre-specify and adjust for baseline severity, age at onset, and genotype.',
      'Outcome ascertainment: confirm the external-control endpoints are measured comparably (same scale, same intervals).',
      'Residual/unmeasured confounding: quantify with sensitivity analyses (E-value) and report transparently.',
    ],
  };

  return { indication, sources, claims, design, provenance: 'sample' };
}
