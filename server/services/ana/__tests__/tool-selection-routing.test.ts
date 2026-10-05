/**
 * AnA tool-selection routing eval.
 *
 * With ~240 tools competing and a per-turn cap (default 50), a tool whose
 * description lacks the salient terms of its own use case is silently never
 * offered — the model can't pick what it isn't shown. `selectToolsForTurn` is the
 * deterministic pre-filter; this eval asserts that representative, realistic
 * prompts surface the right tool within the cut. It is a description-quality gate:
 * if a tool added later doesn't rank for its own intent, this fails.
 *
 * Pure (no LLM/DB) — it tests the deterministic selector, not the model.
 */

import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { selectToolsForTurn, ALWAYS_ON_TOOLS, SELF_DRIVE_TOOLS } from '../tool-selection';
import { withoutHiddenAppTools } from '../ana-launch-scope';

function selectedNames(prompt: string): Set<string> {
  return new Set(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name));
}

// Representative prompt → the tool that MUST survive the top-50 cut for it.
const CASES: { prompt: string; expect: string }[] = [
  { prompt: 'prepare FDA form 1571 as an editable document draft', expect: 'prepare_fda_form' },
  { prompt: 'amend this FDA form with a reason for the field changes', expect: 'amend_fda_form' },
  { prompt: 'list all FDA forms available in the canonical catalog', expect: 'list_fda_forms' },
  { prompt: 'open a time and effort certification statement for this person for the period', expect: 'create_effort_certification' },
  { prompt: 'file a foreign appointment conflict of interest disclosure for this investigator', expect: 'create_coi_disclosure' },
  { prompt: 'search grants.gov for posted cancer funding opportunities', expect: 'search_grants_gov' },
  { prompt: 'screen this vendor against the SAM.gov exclusions debarment list', expect: 'screen_restricted_party' },
  { prompt: 'what needs my attention across research compliance and sponsored programs right now', expect: 'research_compliance_briefing' },
  { prompt: 'open the grant closeout and track the final reports for this award', expect: 'open_grant_closeout' },
  { prompt: 'request a no cost extension to extend the award period of performance', expect: 'request_no_cost_extension' },
  { prompt: 'reconcile the budget versus actual expenditures on this grant award', expect: 'review_grant_budget' },
  { prompt: 'record an actual expenditure booked against the award by cost category', expect: 'record_grant_expenditure' },
  { prompt: 'record a subaward to a subrecipient university under this prime award', expect: 'record_subaward' },
  { prompt: 'register a schedule II controlled substance for the perpetual inventory', expect: 'register_controlled_substance' },
  { prompt: 'mark this PMR regulatory commitment fulfilled now that the study reported', expect: 'fulfill_regulatory_commitment' },
  { prompt: 'is this FDA formal meeting interaction ready, do we have a briefing book', expect: 'review_ha_interaction' },
  { prompt: 'record an institutional cost share contribution toward the match commitment', expect: 'record_cost_share_contribution' },
  { prompt: 'review the training gate, is the PI cleared to be listed on the protocol', expect: 'review_training_gate' },
  { prompt: 'record this grants.gov funding opportunity NOFO into our pre-award pipeline', expect: 'record_grant_opportunity' },
  { prompt: 'what approvals and training do we need to onboard this human subjects study and is the team ready', expect: 'assess_study_onboarding' },
  { prompt: 'can we close out this grant award yet, what closeout items and final reports are still outstanding', expect: 'prepare_award_closeout' },
  { prompt: 'are we ready for the FDA meeting, do we have the briefing book and open questions for this interaction', expect: 'prepare_meeting_package' },
  { prompt: 'triage the critical compliance attention items into tasks for the team to action', expect: 'triage_compliance_attention' },
  // Regulatory knowledge (regulatory-knowledge-tools.ts, D2 2026-10-04).
  { prompt: 'what has to go in section 12.2 adverse events of the clinical study report', expect: 'get_document_section_requirements' },
  { prompt: 'what should the summary of clinical efficacy 2.7.3 contain for our NDA', expect: 'get_document_section_requirements' },
  { prompt: 'we just locked the database, what happens next to get the NDA filed', expect: 'plan_submission_from_database_lock' },
  { prompt: 'what is blocking the clinical overview and what is the next step for the submission', expect: 'plan_submission_from_database_lock' },
  { prompt: 'will our dossier pass FDA technical validation and Elsa, what are the PDF requirements', expect: 'list_fda_technical_rules' },
  { prompt: 'why would the FDA gateway reject our study data, is the TS dataset and define.xml required', expect: 'list_fda_technical_rules' },
  // The cited CMC regulatory record (cmc-knowledge-tools.ts, CMC/Module 3 lane 2026-10-04).
  { prompt: 'what CMC quality information does the FDA require in an IND for a phase 1 study', expect: 'get_cmc_requirements' },
  { prompt: 'what does the EU IMPD quality dossier need for a phase 2 biologic under the clinical trials regulation', expect: 'get_cmc_requirements' },
  { prompt: 'is ICH Q2(R2) final and which guidance does it replace', expect: 'find_cmc_guidance' },
  { prompt: 'which guidance covers nitrosamine impurities and what version is current', expect: 'find_cmc_guidance' },
  { prompt: 'explain how impurity limits are justified for a phase 1 drug substance and the science behind it', expect: 'explain_cmc_topic' },
];

describe('AnA tool-selection routing eval', () => {
  it('the always-on bridge + core are always offered', () => {
    const names = selectedNames('something completely unrelated to any tool xyzzy');
    for (const core of ALWAYS_ON_TOOLS) expect(names.has(core), `core tool ${core} not offered`).toBe(true);
  });

  it('the surface is genuinely over the cap (filtering actually engages)', () => {
    expect(ALL_ANA_TOOLS.length).toBeGreaterThan(50);
  });

  it.each(CASES)('selects "$expect" for: "$prompt"', ({ prompt, expect: tool }) => {
    const names = selectedNames(prompt);
    expect(names.has(tool), `"${tool}" was filtered out for its own prompt — check its name/description terms`).toBe(true);
  });
});

/**
 * The production composition. With launch scope on (production default,
 * governed-toolset.ts) the pool is withoutHiddenAppTools(ALL_ANA_TOOLS), and
 * stream.ts pins the six SELF_DRIVE_TOOLS on every turn, so fewer slots are left
 * for relevance than in the block above. The persona
 * (server/services/ana-ri/persona.ts, "From Database Lock to a Filed
 * Application") orders AnA to call these three record tools before drafting or
 * reviewing a section, on acceptance questions and after database lock. These
 * prompts are how people actually ask — they do not reuse the tools' own
 * wording — and each must reach the model, or the persona's order cannot be
 * obeyed and she answers from memory.
 */
describe('AnA routing — production composition (launch-scoped pool, self-drive pinned)', () => {
  const POOL = withoutHiddenAppTools(ALL_ANA_TOOLS);
  const offered = (prompt: string): Set<string> =>
    new Set(selectToolsForTurn(POOL, prompt, { maxTools: 50, pinned: [...SELF_DRIVE_TOOLS] }).map((t) => t.name));

  const RECORD_TOOLS = [
    'get_document_section_requirements',
    'list_fda_technical_rules',
    'plan_submission_from_database_lock',
  ];

  it('each record tool is in the launch-scoped pool (so the cases below cannot pass vacuously)', () => {
    const poolNames = new Set(POOL.map((t) => t.name));
    for (const tool of RECORD_TOOLS) expect(poolNames.has(tool), `${tool} hidden by launch scope`).toBe(true);
  });

  const NATURAL: { prompt: string; expect: string }[] = [
    { prompt: 'what goes in the ISS', expect: 'get_document_section_requirements' },
    { prompt: 'how should I write the clinical overview', expect: 'get_document_section_requirements' },
    { prompt: 'what does FDA want in 2.7.4', expect: 'get_document_section_requirements' },
    { prompt: 'how do I structure a CSR', expect: 'get_document_section_requirements' },
    { prompt: 'help me write the quality overall summary', expect: 'get_document_section_requirements' },
    { prompt: 'how should the investigator brochure be organized', expect: 'get_document_section_requirements' },
    { prompt: 'review my clinical overview', expect: 'get_document_section_requirements' },
    { prompt: 'will my submission be rejected', expect: 'list_fda_technical_rules' },
    { prompt: 'what do I do after database lock', expect: 'plan_submission_from_database_lock' },
  ];

  it.each(NATURAL)('offers "$expect" for: "$prompt"', ({ prompt, expect: tool }) => {
    expect(offered(prompt).has(tool), `"${tool}" not offered — the persona requires it for this question`).toBe(true);
  });
});
