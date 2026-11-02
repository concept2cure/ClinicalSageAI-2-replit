// Make the gate fail on the case it exists to catch, for the 20 RBM entries.
// Each case edits an in-memory copy of the register (checkStepPresentation's
// `overrides.register`); the file on disk is never touched.
// Run: node docs/evidence/F1/2026-11-01-rbm-step-presentation/method/probe-wrong-claims.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStepPresentation } from '../../../../../scripts/ci/check-step-presentation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const real = JSON.parse(fs.readFileSync(path.join(root, 'server/services/ana/tool-authorization.register.json'), 'utf8')).tools;
const copy = () => JSON.parse(JSON.stringify(real));

const cases = [
  ['remove the present block of generate_rbm_report', r => { delete r.generate_rbm_report.present; }, 'MISSING', 'generate_rbm_report'],
  ['claim engine on add_ctq_factor (class confirm: it INSERTs rbm_risk_items)', r => { r.add_ctq_factor.present.source = 'engine'; }, 'ENGINE', 'add_ctq_factor'],
  ['claim engine on assess_site_risk (class confirm: it rewrites rbm_site_risk_scores)', r => { r.assess_site_risk.present.source = 'engine'; }, 'ENGINE', 'assess_site_risk'],
  ['give approve_rbm_plan (refusedBy handler) the verb finalize', r => { r.approve_rbm_plan.present.verb = 'finalize'; }, 'REFUSAL', 'approve_rbm_plan'],
  ['give approve_rbm_assessment a verb outside STEP_VERBS ("approve")', r => { r.approve_rbm_assessment.present.verb = 'approve'; }, 'VERB', 'approve_rbm_assessment'],
  ['use the tool name as the object of get_rbm_attention', r => { r.get_rbm_attention.present.object = 'get rbm_attention'; }, 'OBJECT', 'get_rbm_attention'],
  ['preview an id field (signalId) on triage_signal', r => { r.triage_signal.present.preview = ['signalId']; }, 'PREVIEW', 'triage_signal'],
  ['source "rbm" (not in STEP_SOURCES) on set_qtl', r => { r.set_qtl.present.source = 'rbm'; }, 'SOURCE', 'set_qtl'],
  // Same file as the five RBM engine handlers (AnaToolExecutor.ts): a handler there that does
  // reach a model is refused, so the five passed on what their handlers import, not because
  // the walker skipped the file.
  ['claim engine on critique_document (same file, its handler reaches a model)', r => { r.critique_document.present.source = 'engine'; }, 'ENGINE', 'critique_document'],
];

let ok = 0;
const base = checkStepPresentation(root);
console.info(`baseline: ${base.findings.length} finding(s), ${base.stats.engineClaims} engine claims`);
for (const [label, edit, code, tool] of cases) {
  const r = copy();
  edit(r);
  const { findings } = checkStepPresentation(root, { register: r });
  const hit = findings.find(f => f.code === code && f.tool === tool);
  console.info(`${hit ? 'FAILS AS IT SHOULD' : 'DID NOT FAIL      '}  ${label}\n        ${hit ? `${hit.code} ${hit.tool}: ${hit.detail}` : JSON.stringify(findings)}`);
  if (hit) ok++;
}
console.info(`\n${ok}/${cases.length} wrong claims refused.`);
process.exit(ok === cases.length ? 0 : 1);
