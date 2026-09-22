/**
 * Protocol ⇄ study-design loop tool definitions — AnA's hands on the derivation.
 *
 * `docs/design/PROTOCOL_INTELLIGENCE.md` §"AnA's part" is explicit about what
 * these are and are not: *"AnA does not decide anything here. The engines decide;
 * AnA operates them and narrates."* The five tools below reach, conversationally,
 * the same engines the Protocol Development surface reaches:
 *
 *   • `bindStudyDesignTx`            — the soft, tenant-checked link
 *   • `deriveDesignFromProtocol`     — the pure five-bucket derivation engine
 *   • `applyDerivation` + `persistStudyDesignTx` — the ONE governed writer
 *   • `evaluateProtocolRules`        — the 53-rule regulatory pack
 *   • `validateDesign`               — the ICH E9/E9(R1)/E10/E3/M11 design gates
 *
 * These are `AnaTool` definition objects only; the handlers live in
 * AnaToolExecutor.ts beside the other protocol-development handlers, and are
 * governed and audited exactly as those are.
 *
 * ── WHY THESE DESCRIPTIONS READ THE WAY THEY DO ─────────────────────────────
 * The description is the only thing that steers the model, so four rules from
 * CLAUDE.md and the design document are written INTO the prose rather than left
 * to a convention nobody reads:
 *
 *  1. **A tool that asks a model for a figure is a defect** (CLAUDE.md Rule 2).
 *     Every description below names its engine and says the numbers and verdicts
 *     are to be reported VERBATIM — never estimated, rounded, re-derived or
 *     filled in when the engine returned nothing.
 *  2. **Absent is not zero and not "no".** Where an engine returns not-assessed,
 *     unevidenced, or no design at all, the description tells the model to say
 *     so. A percentage computed over checks that did not run is the defect this
 *     platform has already been burned by.
 *  3. **Conflict is not resolution.** `apply_protocol_design_derivation` spells
 *     out what accepting a conflicting path MEANS — the human chose the
 *     protocol's value over the design's — and that an incomplete path cannot be
 *     applied at all, rather than implying the tool will sort it out.
 *  4. **No prose, no filing.** None of these writes into `protocol_sections`,
 *     generates protocol text, or claims a submission or transmission to any
 *     authority. Same rule as `docs/design/IRB_SUBMISSION.md` D3.
 *
 * @module server/services/ana/protocol-design-tool-defs
 */

import type { AnaTool } from '../ai-gateway/types';

/** The reason-for-change every governed tool in this file captures (21 CFR Part 11). */
const REASON_PROPERTY = {
  type: 'string' as const,
  description:
    'Reason for change, in the human\'s own words, recorded on the 21 CFR Part 11 audit row. Ask for it; do not invent one.',
};

const DOCUMENT_ID_PROPERTY = {
  type: 'number' as const,
  description: 'protocol_documents.id. Must belong to the caller\'s organization.',
};

export const BIND_PROTOCOL_TO_STUDY_DESIGN: AnaTool = {
  name: 'bind_protocol_to_study_design',
  description:
    'Bind a protocol document to a study design object, so the protocol and the design describe the same study. ' +
    'This is the join the whole protocol ⇄ design loop depends on: until it exists, review_protocol_design_derivation, ' +
    'apply_protocol_design_derivation and review_protocol_design_gates have nothing to work against and say so. ' +
    'Governed and audited: the link and its 21 CFR Part 11 audit row commit or roll back together, and a reason for change is recorded. ' +
    'The binding engine (bindStudyDesignTx) enforces the tenant boundary on BOTH sides — a design id from another organization, ' +
    'or one that does not exist, is refused and nothing is written. Report the engine\'s result verbatim: if it refuses, say it refused and why; ' +
    'do not report a bind that did not happen, and do not guess a study design id — ask the user for it or find it first. ' +
    'Binding writes no protocol prose and claims no submission to any authority.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID_PROPERTY,
      study_design_id: {
        type: 'string',
        description:
          'cdisc_prm_studies.study_id for the design to bind. Must belong to the same organization; a guessed or copied id is refused.',
      },
      reason: REASON_PROPERTY,
    },
    required: ['document_id', 'study_design_id'],
  },
};

export const REVIEW_PROTOCOL_DESIGN_DERIVATION: AnaTool = {
  name: 'review_protocol_design_derivation',
  description:
    'READ-ONLY. Show what a protocol document evidences about its bound study design, as the deterministic derivation engine ' +
    '(deriveDesignFromProtocol) computes it. Writes nothing, changes nothing, and records no audit row — looking at a diff is not a governed action. ' +
    'The engine returns five buckets and you report them VERBATIM, with the engine\'s own counts; never estimate, round, re-derive or summarise a number it did not give you: ' +
    'PROPOSED — the protocol evidences a value the design does not carry, with provenance naming the exact protocol row; ' +
    'CONFLICTS — the protocol and the design disagree, and BOTH values are reported because neither wins automatically and only a human may choose; ' +
    'UNCHANGED — the two already agree, so there is nothing to do; ' +
    'UNEVIDENCED — the protocol says nothing about that design field, so it is left exactly as it is and is never set to null, zero or a default; ' +
    'INCOMPLETE — the protocol evidences part of a value but not a field the design requires, which a human must supply before it can be applied. ' +
    'An unevidenced or incomplete field is NOT agreement and NOT a pass — say that the protocol records nothing there rather than presenting it as clean. ' +
    'If no design is bound to the protocol, the tool returns an explanatory error; that is a different fact from an empty diff and you must not report it as "the protocol and design agree". ' +
    'To act on any of it, present the buckets and ask the human which paths to accept, then call apply_protocol_design_derivation.',
  input_schema: {
    type: 'object',
    properties: { document_id: DOCUMENT_ID_PROPERTY },
    required: ['document_id'],
  },
};

export const APPLY_PROTOCOL_DESIGN_DERIVATION: AnaTool = {
  name: 'apply_protocol_design_derivation',
  description:
    'Write into the study design ONLY the derivation paths a human explicitly accepted. Governed and audited: the design change and its ' +
    '21 CFR Part 11 audit row commit or roll back together, through the same writer the surface uses. ' +
    'You pass PATHS, never values. There is no value parameter and you must not attempt to supply one: naming a path says "I accept what the protocol evidences here", ' +
    'and the derivation engine recomputes that value from the live protocol rows at apply time. A value you typed would be a fabricated governed number. ' +
    'What accepting each kind of path MEANS, and what you must say before calling this: ' +
    'a PROPOSED path fills a design field the design did not carry; ' +
    'a CONFLICT path OVERWRITES the design\'s current value with the protocol\'s — the human is choosing the protocol over the design, and you must state both values and get that choice explicitly, never infer it; ' +
    'an INCOMPLETE path CANNOT be applied at all — the engine refuses it and returns it in `rejected` with the design field the protocol does not record, which a human must supply first; ' +
    'an UNEVIDENCED field is not a path and cannot be named here. ' +
    'A path the current derivation no longer offers — because the protocol changed since the diff was shown — is also rejected, and nothing is written for it. ' +
    'Report the engine\'s `applied` and `rejected` lists verbatim. An empty `applied` list means nothing was written: say exactly that, with the engine\'s reasons, and never describe it as a successful update. ' +
    'This writes no protocol prose and claims no submission to any authority.',
  input_schema: {
    type: 'object',
    properties: {
      document_id: DOCUMENT_ID_PROPERTY,
      accepted_paths: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The derivation paths the human accepted, copied exactly from review_protocol_design_derivation (for example "title", "phase", "objectives", ' +
          '"endpoints", "population.eligibility", "scheduleOfActivities.visits"). Paths only — the engine supplies the values. ' +
          'At least one is required; a path the derivation does not offer is rejected with its reason.',
      },
      reason: REASON_PROPERTY,
    },
    required: ['document_id', 'accepted_paths'],
  },
};

export const REVIEW_PROTOCOL_REGULATORY_RULES: AnaTool = {
  name: 'review_protocol_regulatory_rules',
  description:
    'READ-ONLY. Run the deterministic protocol regulatory rule pack (evaluateProtocolRules) over a protocol document\'s recorded registers and return ' +
    'one finding per rule in scope for its kind, each citing its clause — ICH M11, E8(R1), E9/E9(R1), E6(R3), 21 CFR 312.23(a)(6), 50.25 and 56.111, ' +
    '45 CFR 46 Subparts B/C/D, EU CTR 536/2014 Annex I Part D, FDORA §3601, and for non-clinical kinds the 3Rs and the NIH Guidelines. ' +
    'Writes nothing and records no audit row. This is deeper than review_protocol_completeness, which is the five-check finalize gate; a protocol can pass that and fail here. ' +
    'The engine returns three counts — assessed, unmet, not-assessed — and you report them and the findings VERBATIM. Never compute a compliance percentage, ' +
    'a score or a readiness verdict of your own, and never fill in a figure the engine did not return. ' +
    'A NOT-ASSESSED rule means the recorded input could not support a judgement: it is not a pass, and an unassessed protocol is not a clean one. Say "not assessed", with the engine\'s reason. ' +
    'An ATTENTION finding on a complete section means the section\'s CONTENT was not inspected, only its status — say so rather than implying the content was reviewed. ' +
    'An optional flag the protocol does not record (children, pregnant women, prisoners, IND status) is absent, not "no": report it as not recorded.',
  input_schema: {
    type: 'object',
    properties: { document_id: DOCUMENT_ID_PROPERTY },
    required: ['document_id'],
  },
};

export const REVIEW_PROTOCOL_DESIGN_GATES: AnaTool = {
  name: 'review_protocol_design_gates',
  description:
    'READ-ONLY. Return the study-design gate findings for the design bound to a protocol document, from the same deterministic validation engine ' +
    '(validateDesign) that /api/study-design and the Protocol Development surface serve — ICH E9, E9(R1), E10, E3 and ICH M11. ' +
    'Nothing is recomputed here and nothing is written; no audit row is recorded. ' +
    'Report the engine\'s findings, its severity counts (critical, major, minor, info), its risk level and its canAdvance / blocksApproval verdicts VERBATIM. ' +
    'Do not re-rank a finding, do not drop one, do not total the counts yourself, and do not produce a readiness percentage the engine did not return. ' +
    'If no design is bound, or the bound design cannot be read for this organization, the tool returns an explanatory error and NOT an empty finding list — ' +
    'tell the user the gates did not run. A gate run that is absent is not a pass: "no findings" would say the protocol cleared gates that were never run on it. ' +
    'Use bind_protocol_to_study_design first when nothing is bound. These are the DESIGN\'s gates; the protocol document\'s own rules come from review_protocol_regulatory_rules.',
  input_schema: {
    type: 'object',
    properties: { document_id: DOCUMENT_ID_PROPERTY },
    required: ['document_id'],
  },
};

/**
 * The loop, in the order a human walks it: bind, look at the diff, apply what
 * they accepted, then read the two verdict engines.
 */
export const PROTOCOL_DESIGN_TOOLS: AnaTool[] = [
  BIND_PROTOCOL_TO_STUDY_DESIGN,
  REVIEW_PROTOCOL_DESIGN_DERIVATION,
  APPLY_PROTOCOL_DESIGN_DERIVATION,
  REVIEW_PROTOCOL_REGULATORY_RULES,
  REVIEW_PROTOCOL_DESIGN_GATES,
];
