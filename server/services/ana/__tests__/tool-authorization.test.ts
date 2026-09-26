/**
 * P1-34 (DP-36): every AnA tool is classified, and a new one cannot ship
 * without a class.
 *
 * The register (tool-authorization.register.json) holds one entry per tool
 * the registry serves. Two ways it can go wrong, both silent without this file:
 *
 *   A tool is registered and not classified. At runtime that fails closed —
 *   proposed, never run — so nothing is written; but a new read-only tool would
 *   then ask a person to confirm every lookup, and the fix would be to add the
 *   entry by reflex. The test names the tool so the class is chosen, not typed.
 *
 *   An entry outlives its tool. Harmless at runtime, but a register that lists
 *   tools that are gone stops being read as the truth.
 */

import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getRegisteredToolNames } from '../AnaToolExecutor';
import { CONDITIONAL_RULES, TOOL_REGISTER, toolAuthorizationOf } from '../tool-authorization';

const registered = new Set(getRegisteredToolNames());
const classified = new Set(Object.keys(TOOL_REGISTER));

describe('the register covers the registry exactly', () => {
  it('every registered tool has a class', () => {
    const unclassified = [...registered].filter(n => !classified.has(n)).sort();
    expect(
      unclassified,
      'registered tools with no entry in tool-authorization.register.json — classify each ' +
        '(read, self, confirm, refuse, or conditional with a rule in tool-authorization.ts)',
    ).toEqual([]);
  });

  it('every entry names a registered tool', () => {
    expect([...classified].filter(n => !registered.has(n)).sort(), 'register entries for tools that no longer exist').toEqual([]);
  });

  it('is the whole surface, not a sample of it', () => {
    expect(registered.size).toBeGreaterThan(700);
  });

  it('every conditional entry has its rule, and every rule an entry', () => {
    const conditional = Object.entries(TOOL_REGISTER).filter(([, e]) => e.class === 'conditional').map(([n]) => n).sort();
    expect(Object.keys(CONDITIONAL_RULES).sort()).toEqual(conditional);
  });

  it('every refusal says where the person does it', () => {
    const silent = Object.entries(TOOL_REGISTER).filter(([, e]) => e.class === 'refuse' && !e.why?.trim()).map(([n]) => n);
    expect(silent).toEqual([]);
  });

  it('only the command carrier defers to the command partition', () => {
    const deferred = Object.entries(TOOL_REGISTER).filter(([, e]) => e.class === 'command').map(([n]) => n);
    expect(deferred).toEqual(['execute_platform_command']);
  });
});

describe('what the register says about specific tools', () => {
  it.each([
    // A person's own act.
    ['cast_committee_vote', 'refuse'],
    ['ack_training', 'refuse'],
    ['approve_qms_document', 'refuse'],
    // Reasoned and audited in its handler; a person's yes on top (see the register).
    ['retire_qms_document', 'confirm'],
    ['transmit_submission', 'refuse'],
    // Writes that read like reads — the scanner's misses, found by tracing.
    ['raise_monitoring_signal', 'confirm'],
    ['predict_change_impact', 'confirm'],
    ['catalog_project_document', 'confirm'],
    ['check_consistency', 'confirm'],
    ['assess_site_risk', 'confirm'],
    ['set_protocol_budget_params', 'confirm'],
    // The five P0-12 gated first.
    ['save_document_to_vault', 'confirm'],
    ['seed_tmf', 'confirm'],
    // Reads, and AnA's own state.
    ['list_vault_documents', 'read'],
    ['global_ri_exclusivity', 'read'],
    ['set_specifications', 'read'],
    ['answer_intelligence_question', 'self'],
  ])('%s is %s', (tool, cls) => {
    expect(toolAuthorizationOf(tool, {}).class).toBe(cls);
  });

  it('a tool the register does not know is proposed, not run', () => {
    expect(toolAuthorizationOf('a_tool_added_tomorrow', {})).toEqual({ class: 'confirm', unclassified: true });
  });
});

describe('a conditional tool is judged on what it was asked to do', () => {
  it.each([
    ['qms_change_transition', { to: 'under_assessment' }, 'confirm'],
    ['qms_change_transition', { to: 'approved' }, 'refuse'],
    ['qms_change_transition', { to: ' Closed ' }, 'refuse'],
    ['create_clinical_study', { title: 'P1' }, 'confirm'],
    ['create_clinical_study', { title: 'P1', irb_approved: true }, 'refuse'],
    ['update_tmf_artifact_status', { status: 'received' }, 'confirm'],
    ['update_tmf_artifact_status', { status: 'final' }, 'refuse'],
    ['set_registration_status', { market_status: 'submitted' }, 'confirm'],
    ['set_registration_status', { market_status: 'approved' }, 'refuse'],
    ['log_cs_transaction', { quantity: 2 }, 'confirm'],
    ['log_cs_transaction', { quantity: 2, witnessed_by: 'R. Ortiz' }, 'refuse'],
    ['report_protocol_deviation', { severity: 'major' }, 'confirm'],
    ['report_protocol_deviation', { severity: 'major', affects_safety: false }, 'refuse'],
    ['review_schedule_of_events_health', { apply: false }, 'read'],
    ['review_schedule_of_events_health', {}, 'confirm'],
    ['run_rbm_assessment', {}, 'read'],
    ['run_rbm_assessment', { seed: true }, 'confirm'],
    ['commit_intelligence_flow', { dry_run: true }, 'read'],
    ['commit_intelligence_flow', {}, 'confirm'],
    ['convert_docx_to_pdf', { input_docx_path: 'tmp/docbuilder/a/x.docx' }, 'self'],
    ['convert_docx_to_pdf', { input_docx_path: 'tmp/docbuilder/a/x.docx', output_pdf_path: 'uploads/7/x.pdf' }, 'confirm'],
    ['convert_docx_to_pdf', { input_docx_path: 'uploads/7/x.docx' }, 'confirm'],
    ['generate_document', { output_format: 'docx' }, 'self'],
    ['generate_document', { output_format: 'xml' }, 'confirm'],
    ['place_project_document', { document_id: 3 }, 'confirm'],
    ['place_project_document', { document_id: 3, confirm_suggested: true }, 'refuse'],
  ])('%s %j is %s', (tool, input, cls) => {
    expect(toolAuthorizationOf(tool, input).class).toBe(cls);
  });
});
