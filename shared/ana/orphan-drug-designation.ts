/**
 * Orphan Drug Designation (ODD) request — checklist, authoring plan, and
 * verification, shared between the AnA server tool-chain and the Document
 * Studio client affordance (roadmap enhancement E4).
 *
 * The FDA Orphan Drug Designation request is governed by 21 CFR Part 316. A
 * complete request under §316.20(b) must contain a fixed set of mandatory
 * elements; §316.21 governs the agency's verification of orphan-drug status
 * (the population/prevalence and cost-recovery basis). This module encodes
 * those mandatory section headers ONCE so that:
 *
 *   1. the authored .docx is driven from the real BiotechProduct fields
 *      (strategy.designation / indication / modality),
 *   2. `verify_docx_against_source` is run with `required_strings` = the
 *      mandatory §316.20/§316.21 headers, so the VerificationPanel proves every
 *      required element is present before any download/seal, and
 *   3. a 21 CFR Part 11 honesty contract is enforced: a sample / not-assessed
 *      draft can never be sealed or exported, and no prevalence / eligibility
 *      claim may be asserted without a cited source.
 *
 * Deterministic, dependency-free, framework-free. Advisory only — orphan-drug
 * eligibility is determined by FDA's Office of Orphan Products Development.
 *
 * @module shared/ana/orphan-drug-designation
 */

export type OddProvenance = 'live' | 'sample' | 'not_assessed';

/**
 * One mandatory element of a complete §316.20/§316.21 orphan-drug designation
 * request. `header` is the verbatim section heading the authored document must
 * contain — it doubles as the `required_strings` entry passed to
 * `verify_docx_against_source`.
 */
export interface OddRequiredSection {
  /** Stable id (used in tests + the checklist UI). */
  id: string;
  /** Verbatim numbered section header emitted into the .docx and verified. */
  header: string;
  /** The governing citation (e.g. "21 CFR 316.20(b)(1)"). */
  citation: string;
  /** One-line description of what the section must establish. */
  summary: string;
  /**
   * True when the section asserts a prevalence / population-size /
   * eligibility claim that, under the honesty contract, MUST be backed by a
   * cited source before the draft can be sealed or exported.
   */
  requiresCitation?: boolean;
}

/**
 * The mandatory elements of a complete orphan-drug designation request.
 *
 * §316.20(b)(1)–(8) enumerate the contents of a designation request;
 * §316.21(b)/(c) govern the documented basis for orphan status (the
 * <200,000-persons population estimate or the no-reasonable-expectation-of-
 * cost-recovery basis). The headers below are the verbatim anchors the
 * authored document is verified against.
 */
export const ODD_REQUIRED_SECTIONS: readonly OddRequiredSection[] = [
  {
    id: 'sponsor_statement',
    header: '1. Statement Requesting Orphan-Drug Designation',
    citation: '21 CFR 316.20(b)(1)',
    summary:
      'A statement that the sponsor requests orphan-drug designation for a rare disease or condition, named with specificity.',
  },
  {
    id: 'sponsor_identity',
    header: '2. Sponsor Name and Address',
    citation: '21 CFR 316.20(b)(2)',
    summary: 'The name and address of the sponsor; the name of the primary contact and the source of the drug.',
  },
  {
    id: 'drug_description',
    header: '3. Generic and Trade Name; Description of the Drug',
    citation: '21 CFR 316.20(b)(3)',
    summary:
      'The generic and trade name (if any) of the drug, plus a description of the drug and its physical/chemical or biologic characteristics.',
  },
  {
    id: 'disease_description',
    header: '4. Description of the Rare Disease or Condition',
    citation: '21 CFR 316.20(b)(4)',
    summary:
      'A description of the rare disease or condition for which the drug is being or will be investigated, the proposed indication, and the reasons such therapy is needed.',
  },
  {
    id: 'scientific_rationale',
    header: '5. Scientific Rationale for Use of the Drug',
    citation: '21 CFR 316.20(b)(5)',
    summary:
      'A description of the drug and the scientific rationale for its use in the rare disease or condition, including all relevant in vitro, preclinical, and clinical data.',
  },
  {
    id: 'same_drug_summary',
    header: '6. Summary of Regulatory Status and Marketing History',
    citation: '21 CFR 316.20(b)(6)',
    summary:
      'Where the drug is already marketed/approved, documentation that it may be clinically superior; a summary of prior designations/approvals of the same drug for the same condition.',
  },
  {
    id: 'population_estimate',
    header: '7. Population Estimate — Fewer Than 200,000 Persons',
    citation: '21 CFR 316.21(b)',
    summary:
      'Documentation, with authority references, that the disease/condition affects fewer than 200,000 persons in the United States (the prevalence basis for orphan status).',
    requiresCitation: true,
  },
  {
    id: 'cost_recovery_basis',
    header: '8. Basis for Orphan Status Where Population Exceeds 200,000',
    citation: '21 CFR 316.21(c)',
    summary:
      'Where the population is 200,000 or more, documentation that there is no reasonable expectation of recovering development and marketing costs from US sales.',
    requiresCitation: true,
  },
  {
    id: 'contact_certification',
    header: '9. Contact Person and Certification',
    citation: '21 CFR 316.20(b)(7)-(8)',
    summary:
      'The name and address of the person who will serve as the contact, and the sponsor certification/dated signature.',
  },
] as const;

/** Section ids that carry a prevalence / eligibility claim requiring a cited source. */
export const ODD_CITATION_REQUIRED_SECTION_IDS: readonly string[] = ODD_REQUIRED_SECTIONS.filter(
  (s) => s.requiresCitation,
).map((s) => s.id);

/**
 * The `required_strings` array passed to `verify_docx_against_source`: every
 * mandatory §316.20/§316.21 section header must appear verbatim in the authored
 * document or verification fails. Derived from the single checklist source so
 * the checklist and the verification can never drift.
 */
export function oddRequiredStrings(): string[] {
  return ODD_REQUIRED_SECTIONS.map((s) => s.header);
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoring plan — drives author_docx_native from a BiotechProduct.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The minimal slice of `BiotechProduct` (client/src/concept2cure/types/
 * workspace.ts) the ODD authoring template needs. Kept structural so this
 * shared module does not depend on the client type graph.
 */
export interface OddProductInput {
  name: string;
  genericName?: string;
  brandName?: string;
  indication: string;
  modality?: string;
  /** strategy.designation — used to confirm the orphan track is on-strategy. */
  designations?: readonly string[];
  sponsorName?: string;
  sponsorAddress?: string;
  contactName?: string;
  fdaDivision?: string;
}

/**
 * A literature / precedent citation gathered by the tool-chain (search_literature
 * for prevalence & natural history; search_drug_approvals +
 * lookup_regulatory_precedents for prior same-drug/same-disease designations).
 */
export interface OddCitation {
  /** Which mandatory section this evidence supports. */
  sectionId: string;
  label: string;
  /** A DOI, PMID, FDA application number, precedent id, or URL. Presence is the honesty gate. */
  source: string;
}

export interface OddAuthoringInput {
  product: OddProductInput;
  /** Rationale narrative (from advise_special_designation, designation='orphan'). */
  rationale?: string;
  /** Evidence gathered by the chained search tools. */
  citations?: readonly OddCitation[];
  /** Provenance of the underlying product data. 'sample'/'not_assessed' → non-sealable. */
  provenance: OddProvenance;
}

export interface OddAuthoringPlan {
  /** Title for author_docx_native (title page + running header + filename). */
  title: string;
  /** Markdown content for author_docx_native, every mandatory header present. */
  content: string;
  /** required_strings for the verify_docx_against_source step. */
  requiredStrings: string[];
  /** Provenance carried through to the sealability/exportability gates. */
  provenance: OddProvenance;
  /** Sections whose prevalence/eligibility claim lacks a cited source. */
  uncitedClaimSections: string[];
}

function citationsFor(sectionId: string, citations: readonly OddCitation[] = []): OddCitation[] {
  return citations.filter((c) => c.sectionId === sectionId && c.source.trim().length > 0);
}

/**
 * Build the ODD authoring plan from the product + gathered evidence. Pure: it
 * emits the markdown the author_docx_native tool renders and the required_strings
 * the verify step checks. Where a prevalence/eligibility section has no cited
 * source, it is rendered as an explicit unresolved placeholder (never a fabricated
 * claim) and reported in `uncitedClaimSections` so the honesty guard can block
 * sealing/export.
 */
export function buildOddAuthoringPlan(input: OddAuthoringInput): OddAuthoringPlan {
  const { product, rationale, citations = [], provenance } = input;
  const drugLabel = product.genericName ? `${product.name} (${product.genericName})` : product.name;
  const title = `Request for Orphan-Drug Designation — ${drugLabel}`;

  const uncitedClaimSections: string[] = [];
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push('_Submitted under 21 CFR Part 316 to the FDA Office of Orphan Products Development (OOPD)._');

  for (const section of ODD_REQUIRED_SECTIONS) {
    lines.push('');
    lines.push(`## ${section.header}`);
    lines.push(`_${section.citation}_`);
    lines.push('');

    const sectionCitations = citationsFor(section.id, citations);

    switch (section.id) {
      case 'sponsor_statement':
        lines.push(
          `${product.sponsorName ?? '[Sponsor]'} requests orphan-drug designation for ${drugLabel} ` +
            `for the treatment of ${product.indication}.`,
        );
        break;
      case 'sponsor_identity':
        lines.push(`Sponsor: ${product.sponsorName ?? '[Sponsor name]'}`);
        lines.push(`Address: ${product.sponsorAddress ?? '[Sponsor address]'}`);
        if (product.fdaDivision) lines.push(`FDA review division: ${product.fdaDivision}`);
        break;
      case 'drug_description':
        lines.push(`Generic name: ${product.genericName ?? product.name}`);
        if (product.brandName) lines.push(`Trade name: ${product.brandName}`);
        lines.push(`Modality: ${product.modality ?? '[modality]'}`);
        break;
      case 'disease_description':
        lines.push(
          `Proposed indication: ${product.indication}. This section describes the rare disease or ` +
            `condition, its severity and natural history, and why ${drugLabel} therapy is needed.`,
        );
        break;
      case 'scientific_rationale':
        lines.push(
          rationale?.trim()
            ? rationale.trim()
            : `Scientific rationale for the use of ${drugLabel} in ${product.indication}, with all ` +
                `relevant in vitro, preclinical, and clinical data. [INTEGRATION: populate from ` +
                `advise_special_designation(designation="orphan") rationale.]`,
        );
        break;
      case 'same_drug_summary':
        lines.push(
          `Regulatory status and marketing history of ${drugLabel}, and any prior orphan-drug ` +
            `designations or approvals of the same drug for the same condition.`,
        );
        if (sectionCitations.length) {
          for (const c of sectionCitations) lines.push(`- ${c.label} (${c.source})`);
        } else {
          lines.push(
            '[INTEGRATION: populate from search_drug_approvals + lookup_regulatory_precedents ' +
              '(same-drug / same-disease prior-designation analysis).]',
          );
        }
        break;
      case 'population_estimate':
      case 'cost_recovery_basis':
        if (sectionCitations.length) {
          lines.push(
            section.id === 'population_estimate'
              ? `Documented estimate that ${product.indication} affects fewer than 200,000 persons in ` +
                  `the United States, supported by:`
              : `Documented basis that there is no reasonable expectation of recovering development and ` +
                  `marketing costs from US sales of ${drugLabel}, supported by:`,
          );
          for (const c of sectionCitations) lines.push(`- ${c.label} (${c.source})`);
        } else {
          // Honesty contract: assert no prevalence/eligibility claim without a
          // cited source. Emit an explicit unresolved marker, never a number.
          uncitedClaimSections.push(section.id);
          lines.push(
            `[UNRESOLVED — ${section.citation}: a prevalence/eligibility claim for this section ` +
              `requires a cited source (search_literature for prevalence & natural history). No ` +
              `claim asserted until a source is provided.]`,
          );
        }
        break;
      case 'contact_certification':
        lines.push(`Contact person: ${product.contactName ?? '[Contact name]'}`);
        lines.push('Certification: The sponsor certifies the information in this request is true and complete.');
        lines.push('Signature: __________________________   Date: ____________');
        break;
      default:
        lines.push(section.summary);
    }
  }

  return {
    title,
    content: lines.join('\n'),
    requiredStrings: oddRequiredStrings(),
    provenance,
    uncitedClaimSections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification — pass/fail against the required §316.20/§316.21 headers.
// ─────────────────────────────────────────────────────────────────────────────

export interface OddVerificationResult {
  ok: boolean;
  requiredStringsChecked: number;
  missingRequiredStrings: string[];
}

/**
 * Verify that a document's text contains every mandatory §316.20/§316.21 header.
 * Mirrors the substring contract of `verify_docx_against_source` so the client
 * can compute the same verdict the server tool produces. Pure.
 */
export function evaluateOddVerification(documentText: string): OddVerificationResult {
  const required = oddRequiredStrings();
  const text = documentText ?? '';
  const missing = required.filter((s) => !text.includes(s));
  return {
    ok: missing.length === 0,
    requiredStringsChecked: required.length,
    missingRequiredStrings: missing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 21 CFR Part 11 honesty contract — sealability / exportability gates.
// ─────────────────────────────────────────────────────────────────────────────

export interface OddSealabilityVerdict {
  /** True only when the draft may be sealed/exported/downloaded as a record. */
  sealable: boolean;
  /** Factual, emoji-free reasons the draft is blocked (empty when sealable). */
  blockers: string[];
}

/**
 * Decide whether an ODD draft may be sealed or exported. Enforces the honesty
 * contract:
 *   - sample / not_assessed provenance is NEVER sealable or exportable;
 *   - every required §316.20/§316.21 header must be present (verified);
 *   - no prevalence/eligibility section may assert a claim without a cited source.
 *
 * Pure + deterministic; the caller (download/seal handler) must respect a
 * `sealable: false` verdict.
 */
export function assessOddSealability(args: {
  provenance: OddProvenance;
  verification: OddVerificationResult;
  uncitedClaimSections: readonly string[];
}): OddSealabilityVerdict {
  const blockers: string[] = [];

  if (args.provenance !== 'live') {
    blockers.push(
      `Draft provenance is "${args.provenance}". Sample and not-assessed drafts cannot be sealed or exported.`,
    );
  }
  if (!args.verification.ok) {
    blockers.push(
      `Verification incomplete: ${args.verification.missingRequiredStrings.length} required ` +
        `section(s) missing of ${args.verification.requiredStringsChecked}.`,
    );
  }
  if (args.uncitedClaimSections.length > 0) {
    blockers.push(
      `A prevalence/eligibility claim is asserted without a cited source in ` +
        `${args.uncitedClaimSections.length} section(s). Provide a source before sealing.`,
    );
  }

  return { sealable: blockers.length === 0, blockers };
}
