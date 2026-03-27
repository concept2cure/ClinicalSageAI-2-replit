#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] || 'docs/evals/oss_stack_regulatory_uat_catalog.json';
if (!fs.existsSync(file)) {
  console.error(`❌ Missing catalog file: ${file}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const tasks = payload.tasks || [];

if (!Array.isArray(tasks) || tasks.length < 6) {
  console.error('❌ Catalog must include at least 6 regulatory UAT tasks');
  process.exit(1);
}

const requiredDomains = ['fda_510k', 'fda_pma', 'eu_cer', 'ectd'];
const requiredPersonas = ['medical_writer', 'regulatory_reviewer', 'submission_manager', 'qa_compliance'];

const domains = new Set(tasks.map(t => t.domain));
const personas = new Set(tasks.map(t => t.persona));

let ok = true;
for (const d of requiredDomains) {
  if (!domains.has(d)) {
    ok = false;
    console.error(`❌ Missing required domain coverage: ${d}`);
  }
}
for (const p of requiredPersonas) {
  if (!personas.has(p)) {
    ok = false;
    console.error(`❌ Missing required persona coverage: ${p}`);
  }
}

for (const task of tasks) {
  for (const key of ['id', 'domain', 'persona', 'workflow', 'description']) {
    if (!task[key]) {
      ok = false;
      console.error(`❌ Task missing '${key}': ${JSON.stringify(task)}`);
    }
  }
}

if (!ok) {
  console.error('\nRegulatory catalog check failed.');
  process.exit(1);
}

console.log(`✅ Regulatory catalog check passed (${tasks.length} tasks)`);
