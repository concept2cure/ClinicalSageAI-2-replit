/**
 * The claim rules, shared by the CI gate and the catalog contract test.
 *
 * They live in their own module because there are now two readers. The gate
 * (`check-compliance-claims.mjs`) scans customer-facing SOURCE; the contract
 * test (`tests/schema-contract/catalog-module-claims.contract.test.ts`) scans
 * the Apps-catalog descriptions AFTER the migrations have run, which is copy
 * a customer reads that no file-scanner can see — the catalog lives in
 * `available_modules` rows, assembled across several migrations, so the text
 * a buyer is shown exists only once the set has been applied. That gap is how
 * "no hallucinations ... 100% of the time" sat in the catalog while the gate
 * for unsupported claims was green.
 *
 * One definition, two readers. A rule added here protects both.
 */

// ─────────────────────────────────────────────────────────────────────────────
export const CLAIMS = [
  {
    id: 'soc2-attestation',
    // "SOC 2 Type II", "SOC 2 certified", "SOC 2 compliant", "SOC2-audited".
    // NOT bare "SOC 2", which legitimately appears when describing the control
    // mapping we ship for the customer's own program.
    re: /SOC\s?2\b[^.\n]{0,24}\b(Type\s?(?:I{1,2}|1|2)|certified|certification|attested|attestation|compliant|audited)\b/i,
    why: 'Concept2Cure holds no SOC 2 report of any type. The shipped TSC mapping is a reference framework for the customer\'s GRC program, not an attestation of this platform.',
  },
  {
    id: 'part11-compliant-product',
    // The ADJECTIVE form only — "a Part 11-compliant PDF", "our Part 11
    // compliant signature" — which asserts that a thing we ship IS compliant.
    //
    // Deliberately NOT the noun form. "The Platform supports 21 CFR Part 11
    // compliance" (client/src/concept2cure/auth/ZenSignup.tsx) and "audit trail
    // for 21 CFR Part 11 compliance" state a PURPOSE, which is both true and
    // the hedged wording the team already settled on. Flagging those would bury
    // the real violations in noise and get this gate muted — the precision is
    // what makes it worth having.
    //
    // Part 11 compliance is a property of a VALIDATED INSTALLATION — IQ/OQ/PQ,
    // SOPs, training — which a vendor cannot assert on a customer's behalf.
    re: /(?:21\s?CFR\s?)?\bPart[-\s]?11[-\s]compliant\b|\b(?:is|are|fully|100%)\s+(?:\w+\s+){0,2}(?:21\s?CFR\s?)?Part[-\s]?11[-\s]complian/i,
    why: 'Part 11 compliance is a property of a validated installation (IQ/OQ/PQ, SOPs, training), not of shipped software. Describe the control instead — "Part 11 audit trail", "Part 11 e-signature", or "supports Part 11 compliance".',
  },
  {
    id: 'hipaa-compliant',
    // "HIPAA compliant" vs the hedged "HIPAA-ready" the team already uses.
    re: /HIPAA[- ]?compliant\b/i,
    why: 'Use "HIPAA-ready". HIPAA compliance depends on a BAA and the customer\'s own administrative and physical safeguards.',
  },
  {
    id: 'blanket-encryption-at-rest',
    // "all data encrypted at rest", "everything encrypted at rest", and the
    // bare "encrypted at rest" badge that implies blanket coverage.
    re: /\b(?:all|every|complete(?:ly)?|full(?:y)?)\s+(?:\w+\s+){0,2}encrypt(?:ed|ion)\b[^.\n]{0,32}\bat[- ]rest\b/i,
    why: 'Encryption at rest is field-level over specific secrets. Whole-database encryption is a property of the deployment, not of this application.',
  },
  {
    id: 'mfa-enforced-everywhere',
    re: /\bMFA\b[^.\n]{0,40}\benforced\b[^.\n]{0,40}\b(?:every|all)\b/i,
    why: 'TOTP MFA is per-user opt-in; it cannot currently be enforced org-wide.',
  },
  {
    id: 'ai-no-hallucinations',
    // "no hallucinations", "hallucination-free", "zero hallucinations".
    //
    // An absolute claim about generative output that no vendor can make and
    // this one specifically cannot: the drafting path's own honesty machinery
    // exists BECAUSE ungrounded output happens. `retrievalStatus` distinguishes
    // a draft written over an empty corpus from one written over a failed
    // retrieval (L35), and the accept path refuses content whose lineage
    // cannot be covered. A screen promising the failure mode is impossible
    // contradicts the code that handles it.
    re: /\b(?:no|zero|without|never\s+any)\s+hallucinat|\bhallucination[- ]free\b/i,
    why: 'The platform cannot promise a model never hallucinates — its own drafting path ships grounding checks, ungrounded-claim surfacing and a retrieval-failure state precisely because it can. Describe the control ("every claim cited to locked evidence", "ungrounded claims surfaced"), not the absence of the failure.',
  },
  {
    id: 'absolute-validation-guarantee',
    // "100% of drifted references", "validation that runs as intended 100% of
    // the time", "guarantees no incomplete draft is promoted", "correct every
    // single time".
    //
    // Narrow by construction: an absolute quantifier must sit within ~40 chars
    // of a correctness/validation word. Bare "100%" is left alone — it is
    // legitimate on a completeness meter, a coverage figure or a progress
    // readout, and flagging those would bury the real violations and get this
    // gate muted, exactly as the SOC 2 rule's comment warns.
    // NOTE ON THE WORD BOUNDARIES. There is deliberately no `\b` after the
    // `100\s?%` alternatives. `%` is a non-word character, so `\b` between it
    // and a following space can never match — an earlier draft of this rule
    // carried that `\b` and was inert against every string it was written for,
    // including "non-AI validation, 100%" sitting three lines from the rule's
    // own example. Anchor the START of each alternative instead.
    re: /(?:\b100\s?%|\bevery\s+single\s+time\b|\balways\b)[^.\n]{0,40}\b(?:validat\w*|determinist\w*|guarantee\w*|accurate|correct)\b|\b(?:guarantee[sd]?|determinist\w*|validat\w*)\b[^.\n]{0,40}(?:\b100\s?%|\bevery\s+single\s+time\b)|\bguarantee[sd]?\b\s+(?:that\s+)?\bno\b/i,
    why: 'An unqualified correctness rate is unevidenced unless a test measures it. State what the check does and what it blocks ("reconciles the regenerated summary against the table", "blocks promotion when a required section is missing"), not a rate nothing measures.',
  },
];
