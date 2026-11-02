// The labels a person reads for the 20 RBM steps, built by the one builder
// (server/services/ana/step-presentation.ts presentStep) from the register.
// Run: npx tsx docs/evidence/F1/2026-11-01-rbm-step-presentation/method/rendered-labels.ts | grep -v '^{'
// (importing the builder opens the database pool, which logs JSON lines; the grep drops them)
import { presentStep } from '../../../../../server/services/ana/step-presentation';

const TOOLS: Array<[string, Record<string, unknown>]> = [
  ['run_rbm_assessment', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['assess_site_risk', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['evaluate_kris_qtls', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['generate_rbm_plan', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['prioritize_monitoring_queries', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['run_central_monitoring', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['scan_patient_profiles', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['generate_rbm_report', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['get_rbm_attention', { programId: '00000000-0000-4000-8000-000000000001' }],
  ['add_ctq_factor', { programId: '00000000-0000-4000-8000-000000000001', ctqFactor: 'Primary endpoint assessment timing', likelihood: 4, impact: 5 }],
  ['define_kri', { programId: '00000000-0000-4000-8000-000000000001', name: 'Screen-failure rate' }],
  ['record_kri_reading', { programId: '00000000-0000-4000-8000-000000000001', kriName: 'Screen-failure rate', value: 34 }],
  ['set_qtl', { programId: '00000000-0000-4000-8000-000000000001', parameter: 'Important protocol deviation rate' }],
  ['raise_monitoring_signal', { programId: '00000000-0000-4000-8000-000000000001', title: 'Site 104 late AE entry', severity: 'high' }],
  ['triage_signal', { signalId: 12, status: 'investigating' }],
  ['draft_monitoring_plan', { programId: '00000000-0000-4000-8000-000000000001', title: 'Phase 2 monitoring plan' }],
  ['create_monitoring_action', { planId: 3, description: 'On-site visit to site 104' }],
  ['update_monitoring_action', { actionId: 7, status: 'done' }],
  ['approve_rbm_assessment', { assessmentId: 5, reason: 'Reviewed with the study team' }],
  ['approve_rbm_plan', { planId: 3, reason: 'Reviewed with the study team' }],
];

for (const [tool, input] of TOOLS) {
  const live = presentStep(tool, input);
  const done = presentStep(tool, input, null, { status: 'success', result: '{}' } as never);
  const held = presentStep(tool, input, null, { status: 'error', result: '{"error":"x"}' } as never);
  console.info(
    [tool.padEnd(30), live.source.padEnd(8), `live: ${live.label}`, `| finished (success): ${done.label}`, `| finished (error): ${held.label}`, live.preview ? `| preview: ${live.preview}` : ''].join(' '),
  );
}
