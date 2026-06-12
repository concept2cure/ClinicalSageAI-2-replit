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
import { selectToolsForTurn, ALWAYS_ON_TOOLS } from '../tool-selection';

function selectedNames(prompt: string): Set<string> {
  return new Set(selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name));
}

// Representative prompt → the tool that MUST survive the top-50 cut for it.
const CASES: { prompt: string; expect: string }[] = [
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
