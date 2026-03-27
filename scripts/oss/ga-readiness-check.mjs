#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'docs/evals/oss_stack_scorecard.template.json';
if (!fs.existsSync(file)) {
  console.error(`❌ Missing scorecard file: ${file}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const stage = String(payload.stage || 'beta').toLowerCase();
const weights = payload.weights || {};
const scores = payload.scores || {};
const fails = payload.hard_fail_conditions || {};
const human = payload.human_testing || {};

const requiredCategories = [
  'parsing_quality',
  'retrieval_citation',
  'policy_enforcement',
  'workflow_reliability',
  'observability_completeness',
  'pilot_safety',
];

let ok = true;
let weighted = 0;

for (const c of requiredCategories) {
  if (typeof weights[c] !== 'number' || typeof scores[c] !== 'number') {
    ok = false;
    console.error(`❌ Missing numeric weight/score for ${c}`);
    continue;
  }
  weighted += weights[c] * scores[c];
}

for (const [k, v] of Object.entries(fails)) {
  if (v === true) {
    ok = false;
    console.error(`❌ Hard fail active: ${k}`);
  }
}

const minCategory = Math.min(...requiredCategories.map(c => Number(scores[c] ?? 0)));
if (stage === 'beta') {
  if (weighted < 3.8 || minCategory < 3.0) {
    ok = false;
    console.error(`❌ Beta threshold not met (weighted=${weighted.toFixed(2)}, minCategory=${minCategory.toFixed(2)})`);
  }
  if (Number(human.beta_sessions_completed || 0) < 10) {
    ok = false;
    console.error('❌ Beta requires at least 10 supervised sessions');
  }
} else if (stage === 'ga') {
  if (weighted < 4.3 || minCategory < 3.8) {
    ok = false;
    console.error(`❌ GA threshold not met (weighted=${weighted.toFixed(2)}, minCategory=${minCategory.toFixed(2)})`);
  }
  if (Number(human.ga_sessions_completed || 0) < 25) {
    ok = false;
    console.error('❌ GA requires at least 25 supervised sessions');
  }
  if (Number(human.critical_defects_open || 0) > 0) {
    ok = false;
    console.error('❌ GA requires zero critical defects open');
  }
  if (Number(human.core_task_success_rate || 0) < 0.9) {
    ok = false;
    console.error('❌ GA requires >=90% core task success rate');
  }
  if (Number(human.citation_trust_mean || 0) < 4.0) {
    ok = false;
    console.error('❌ GA requires citation trust mean >= 4.0/5');
  }
} else {
  ok = false;
  console.error(`❌ Unknown stage '${stage}'. Expected beta or ga.`);
}

if (!ok) {
  console.error('\nGA readiness check failed.');
  process.exit(1);
}

console.log(`✅ ${stage.toUpperCase()} readiness check passed (weighted=${weighted.toFixed(2)}, minCategory=${minCategory.toFixed(2)})`);
