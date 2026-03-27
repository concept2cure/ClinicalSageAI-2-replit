#!/usr/bin/env node
import fs from 'node:fs';

const file = 'docs/evals/oss_stack_golden_tasks.json';

if (!fs.existsSync(file)) {
  console.error(`❌ Missing ${file}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const tasks = payload.tasks || [];

if (!Array.isArray(tasks) || tasks.length === 0) {
  console.error('❌ No golden tasks defined');
  process.exit(1);
}

const required = ['id', 'category', 'description', 'gate'];
let ok = true;

for (const task of tasks) {
  for (const field of required) {
    if (!task[field]) {
      ok = false;
      console.error(`❌ Task missing '${field}': ${JSON.stringify(task)}`);
    }
  }
}

const betaCount = tasks.filter(t => t.gate === 'beta').length;
const gaCount = tasks.filter(t => t.gate === 'ga').length;

if (betaCount === 0 || gaCount === 0) {
  ok = false;
  console.error('❌ Need at least one beta and one ga task');
}

if (!ok) {
  console.error('\nGolden task eval check failed.');
  process.exit(1);
}

console.log(`✅ Golden task eval check passed (${tasks.length} tasks; beta=${betaCount}, ga=${gaCount})`);
