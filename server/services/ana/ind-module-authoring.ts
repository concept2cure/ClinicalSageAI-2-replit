/**
 * IND narrative module authoring — transcription-safe drafting of CTD Module 2
 * clinical summaries (e.g. 2.5 Clinical Overview, 2.7 Clinical Summaries) for
 * AnA's plan_ind_module_authoring (roadmap item E11).
 *
 * An IND Module 2 narrative is largely a TRANSCRIPTION of structured source
 * facts and figures (doses, n, exposure, percentages, durations) into prose. The
 * Part 11 risk is not the narrative voice but transcription fidelity: a single
 * mistyped figure (e.g. "24 months" → "12 months", "200 mg" → "20 mg") silently
 * corrupts the submission. This module makes that risk verifiable:
 *
 *   1. the authored .docx is driven from a STRUCTURED source (key facts/figures),
 *   2. `verify_docx_against_source` is run with `required_strings` DERIVED from
 *      that source's key facts/figures — so the verify step proves every figure
 *      was transcribed verbatim and CATCHES a missing or mistyped figure before
 *      the draft can be sealed, and
 *   3. a 21 CFR Part 11 honesty contract is enforced: a sample / not-assessed
 *      draft can never be sealed or exported, and AI-authored prose carries the
 *      determinism pedigree (the required_strings are the deterministic anchor).
 *
 * One record (D2 cleanup C4a, 2026-10-26). The sections were a hand copy in
 * shared/ana/: 2.5.1–2.5.6 and 2.7.1–2.7.4, so a plan had no 2.5.7, 2.7.5 or
 * 2.7.6, and its 2.7.1 header lacked "and Associated Analytical Methods" — the
 * header a verify step then required the document to contain. They are now
 * the headings the ICH M2–M5 record holds directly below 2.5 and 2.7. No client
 * code read the shared copy, so it moved here, beside the record it reads.
 *
 * Deterministic, framework-free. Advisory only — clinical conclusions are the
 * sponsor's.
 *
 * @module server/services/ana/ind-module-authoring
 */

import { ctdRecordSubtree } from '../market-specs/ctd-component-outlines';
import { ctdCodeWithin, normalizeCtdCode } from '../../../shared/regulatory/section-code';

export type IndModuleProvenance = 'live' | 'sample' | 'not_assessed';

/**
 * The IND Module 2 narrative sections E11 templates. `code` is the section's
 * CTD code, the id a fact names; `header` is the verbatim numbered section
 * heading the authored document must contain — it doubles as a
 * `required_strings` entry for `verify_docx_against_source`.
 */
export interface IndModuleSection {
  /** The CTD code, as the record holds it (e.g. "2.5.4"). */
  code: string;
  /** Verbatim section header emitted into the .docx and verified: the code and the record's title. */
  header: string;
  /** The governing CTD reference (e.g. "ICH M4E — CTD 2.5"). */
  reference: string;
  /** The id a fact named for this section before it was read from the record, still accepted. */
  formerId?: string;
}

/** The ids the hand copy gave its sections; a caller that learned them keeps working. */
const FORMER_IDS: Readonly<Record<string, string>> = {
  '2.5.1': 'product_development_rationale',
  '2.5.2': 'overview_biopharmaceutics',
  '2.5.3': 'overview_clinical_pharmacology',
  '2.5.4': 'overview_efficacy',
  '2.5.5': 'overview_safety',
  '2.5.6': 'benefits_and_risks_conclusions',
  '2.7.1': 'summary_biopharmaceutic_studies',
  '2.7.2': 'summary_clinical_pharmacology',
  '2.7.3': 'summary_clinical_efficacy',
  '2.7.4': 'summary_clinical_safety',
};

/** The headings the record holds directly below `root`, in CTD order. */
function moduleSections(root: string): IndModuleSection[] {
  const depth = root.split('.').length + 1;
  return ctdRecordSubtree(root)
    .filter((h) => h.code.split('.').length === depth)
    .map((h) => ({
      code: h.code,
      header: `${h.code} ${h.title}`,
      reference: `ICH M4E — CTD ${h.code}`,
      ...(FORMER_IDS[h.code] ? { formerId: FORMER_IDS[h.code] } : {}),
    }));
}

/**
 * The supported IND narrative modules. Each is a CTD Module 2 clinical summary
 * whose body is largely transcribed from structured source facts/figures.
 */
export const IND_MODULE_TEMPLATES: Readonly<Record<string, readonly IndModuleSection[]>> = {
  /** CTD 2.5 — Clinical Overview (ICH M4E). */
  '2.5': moduleSections('2.5'),
  /** CTD 2.7 — Clinical Summary (ICH M4E). */
  '2.7': moduleSections('2.7'),
};

/** The module ids this template supports (e.g. "2.5", "2.7"). */
export function listIndModules(): string[] {
  return Object.keys(IND_MODULE_TEMPLATES);
}

/**
 * One structured source fact transcribed into the narrative. `value` is the
 * verbatim figure/string that MUST appear in the authored document; it is the
 * unit of transcription fidelity the verify step checks.
 */
export interface IndSourceFact {
  /** Which template section the fact belongs in: its CTD code (e.g. "2.5.4") or a code below it ("2.7.4.2.1.2"), or its former id. */
  sectionId: string;
  /** Human label for the fact (e.g. "Primary endpoint response rate"). */
  label: string;
  /** The verbatim figure/string to transcribe AND verify (e.g. "42.3%", "200 mg", "24 months"). */
  value: string;
  /** Optional source pointer (table/dataset id) recorded for provenance. */
  source?: string;
}

export interface IndModuleAuthoringInput {
  /** The CTD module to author (e.g. "2.5", "2.7"). */
  module: string;
  /** Product/compound name for the title + running header. */
  productName: string;
  /** Proposed indication. */
  indication: string;
  /** Structured source facts/figures to transcribe. The honesty/fidelity anchor. */
  facts: readonly IndSourceFact[];
  /** Provenance of the underlying source data. 'sample'/'not_assessed' → non-sealable. */
  provenance: IndModuleProvenance;
}

export interface IndModuleAuthoringPlan {
  /** Title for author_docx_native (title page + running header + filename). */
  title: string;
  /** Markdown content for author_docx_native, every section header + fact present. */
  content: string;
  /** required_strings for verify_docx_against_source: section headers + every fact value. */
  requiredStrings: string[];
  /** Provenance carried through to the sealability gate. */
  provenance: IndModuleProvenance;
  /** CTD codes of the template's sections that received no source fact (informational). */
  sectionsWithoutFacts: string[];
  /** Supplied facts that name no section of the template: not in the plan, and said so. */
  unplacedFacts: IndSourceFact[];
}

/** Trim + collapse a verbatim figure so a fact value is matched the same way it
 * is rendered (the verify step is substring-based, so trailing whitespace would
 * otherwise produce false negatives). Pure. */
function normalizeFactValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Derive the `required_strings` for `verify_docx_against_source` from the module
 * template + the structured source facts. The array is:
 *   - every mandatory section header (so the document is structurally complete), and
 *   - every source fact's verbatim VALUE (so a missing or mistyped figure fails verify).
 *
 * De-duplicated and order-stable (headers first, then facts). Pure: this is the
 * single derivation the author and the verify step both consume, so the template
 * and the verification can never drift. A figure that is mistyped in the authored
 * prose will NOT appear in the document text and therefore fails verification —
 * which is exactly the transcription error E11 must catch before sealing.
 */
export function deriveIndRequiredStrings(input: {
  module: string;
  facts: readonly IndSourceFact[];
}): string[] {
  const sections = IND_MODULE_TEMPLATES[input.module] ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim();
    if (v.length > 0 && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  for (const section of sections) push(section.header);
  for (const fact of input.facts ?? []) {
    if (typeof fact?.value === 'string') push(normalizeFactValue(fact.value));
  }
  return out;
}

const hasValue = (f: IndSourceFact) => typeof f.value === 'string' && f.value.trim().length > 0;

/**
 * A fact belongs to the section its id names: the section's code or a code
 * below it (2.7.4.2.1.2 is under 2.7.4), or the section's former id. (D2
 * cleanup C4c: a code below a section matched nothing, so the fact was dropped
 * and its section read "no source fact supplied".)
 */
const belongsTo = (f: IndSourceFact, section: IndModuleSection) =>
  ctdCodeWithin(f.sectionId, section.code) || f.sectionId === section.formerId;

function factsFor(section: IndModuleSection, facts: readonly IndSourceFact[] = []): IndSourceFact[] {
  return facts.filter((f) => belongsTo(f, section) && hasValue(f));
}

/**
 * Build the IND module authoring plan from the structured source. Pure: it emits
 * the markdown `author_docx_native` renders and the `required_strings` the verify
 * step checks. Every source fact is transcribed VERBATIM into its section so the
 * required_strings (which include each fact value) are guaranteed present in a
 * faithful draft — and absent the moment a figure is mistyped.
 */
export function buildIndModuleAuthoringPlan(input: IndModuleAuthoringInput): IndModuleAuthoringPlan {
  const sections = IND_MODULE_TEMPLATES[input.module] ?? [];
  const title = `IND Module ${input.module} — ${input.productName} (${input.indication})`;

  const sectionsWithoutFacts: string[] = [];
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`_Common Technical Document Module ${input.module}. AI-authored from structured source; every figure below is transcribed verbatim and verified against the source._`);

  for (const section of sections) {
    lines.push('');
    lines.push(`## ${section.header}`);
    lines.push(`_${section.reference}_`);
    lines.push('');
    const sectionFacts = factsFor(section, input.facts);
    if (sectionFacts.length === 0) {
      sectionsWithoutFacts.push(section.code);
      lines.push(
        `[NO SOURCE FACT SUPPLIED — this section has no transcribed figure. ` +
          `Provide structured source facts for "${section.header}" before sealing.]`,
      );
      continue;
    }
    for (const fact of sectionFacts) {
      const value = normalizeFactValue(fact.value);
      const src = fact.source ? ` (source: ${fact.source})` : '';
      // A fact named by a code below the section keeps that code, so the author sees where in it the figure goes.
      const code = normalizeCtdCode(fact.sectionId);
      const at = code && code !== section.code ? ` (${code})` : '';
      lines.push(`- ${fact.label}${at}: ${value}${src}`);
    }
  }
  const unplacedFacts = (input.facts ?? []).filter((f) => hasValue(f) && !sections.some((section) => belongsTo(f, section)));

  return {
    title,
    content: lines.join('\n'),
    requiredStrings: deriveIndRequiredStrings({ module: input.module, facts: input.facts }),
    provenance: input.provenance,
    sectionsWithoutFacts,
    unplacedFacts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification — pass/fail against the derived required_strings.
// ─────────────────────────────────────────────────────────────────────────────

export interface IndModuleVerificationResult {
  ok: boolean;
  requiredStringsChecked: number;
  missingRequiredStrings: string[];
}

/**
 * Verify that a document's text contains every derived required string (section
 * headers + every transcribed figure). Mirrors the substring contract of
 * `verify_docx_against_source` so the client can compute the same verdict the
 * server tool produces. A mistyped figure leaves the source value absent from
 * the text, so it surfaces here as a missing required string. Pure.
 */
export function evaluateIndModuleVerification(args: {
  documentText: string;
  requiredStrings: readonly string[];
}): IndModuleVerificationResult {
  const text = args.documentText ?? '';
  const required = args.requiredStrings ?? [];
  const missing = required.filter((s) => !text.includes(s));
  return {
    ok: missing.length === 0,
    requiredStringsChecked: required.length,
    missingRequiredStrings: missing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 21 CFR Part 11 honesty contract — sealability gate.
// ─────────────────────────────────────────────────────────────────────────────

export interface IndModuleSealabilityVerdict {
  /** True only when the draft may be sealed/exported as a record. */
  sealable: boolean;
  /** Factual, emoji-free reasons the draft is blocked (empty when sealable). */
  blockers: string[];
}

/**
 * Decide whether an IND module draft may be sealed or exported. Enforces the
 * honesty contract:
 *   - sample / not_assessed provenance is NEVER sealable;
 *   - every derived required string (section headers + every figure) must be
 *     present (verified) — so a missing/mistyped figure blocks sealing.
 *
 * Pure + deterministic; the caller must respect a `sealable: false` verdict.
 */
export function assessIndModuleSealability(args: {
  provenance: IndModuleProvenance;
  verification: IndModuleVerificationResult;
}): IndModuleSealabilityVerdict {
  const blockers: string[] = [];
  if (args.provenance !== 'live') {
    blockers.push(
      `Draft provenance is "${args.provenance}". Sample and not-assessed drafts cannot be sealed or exported.`,
    );
  }
  if (!args.verification.ok) {
    blockers.push(
      `Verification incomplete: ${args.verification.missingRequiredStrings.length} required ` +
        `string(s) (section header or transcribed figure) missing of ${args.verification.requiredStringsChecked}. ` +
        `A missing or mistyped figure blocks sealing.`,
    );
  }
  return { sealable: blockers.length === 0, blockers };
}
