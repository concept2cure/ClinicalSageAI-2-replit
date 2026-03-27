#!/usr/bin/env node
import fs from 'node:fs';

const checklistFile = process.argv[2] || 'docs/evals/oss_stack_medical_writing_checklist.json';
const catalogFile = process.argv[3] || 'docs/evals/oss_stack_regulatory_uat_catalog.json';
const draftFile = process.argv[4] || '';
const draftDomain = process.argv[5] || 'fda_510k';

if (!fs.existsSync(checklistFile)) {
  console.error(`❌ Missing checklist file: ${checklistFile}`);
  process.exit(1);
}
if (!fs.existsSync(catalogFile)) {
  console.error(`❌ Missing catalog file: ${catalogFile}`);
  process.exit(1);
}

const checklist = JSON.parse(fs.readFileSync(checklistFile, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const tasks = catalog.tasks || [];
const domains = checklist.domains || {};

let ok = true;
for (const requiredDomain of ['fda_510k', 'fda_pma', 'eu_cer', 'ectd']) {
  const config = domains[requiredDomain];
  if (!config) {
    ok = false;
    console.error(`❌ Missing domain checklist: ${requiredDomain}`);
    continue;
  }

  if (!Array.isArray(config.required_sections) || config.required_sections.length < 4) {
    ok = false;
    console.error(`❌ Domain ${requiredDomain} must define at least 4 required sections`);
  }

  if (!Array.isArray(config.required_quality_controls) || config.required_quality_controls.length < 3) {
    ok = false;
    console.error(`❌ Domain ${requiredDomain} must define at least 3 quality controls`);
  }
}

const taskDomains = new Set(tasks.map(t => t.domain));
for (const d of ['fda_510k', 'fda_pma', 'eu_cer', 'ectd']) {
  if (!taskDomains.has(d)) {
    ok = false;
    console.error(`❌ Regulatory catalog missing task coverage for ${d}`);
  }
}

if (draftFile) {
  if (!fs.existsSync(draftFile)) {
    console.error(`❌ Draft file not found: ${draftFile}`);
    process.exit(1);
  }

  const domainChecklist = domains[draftDomain];
  if (!domainChecklist) {
    console.error(`❌ Draft domain not found in checklist: ${draftDomain}`);
    process.exit(1);
  }

  const draft = fs.readFileSync(draftFile, 'utf8').toLowerCase();

  for (const section of domainChecklist.required_sections || []) {
    if (!draft.includes(section.toLowerCase().replace(/_/g, ' ')) && !draft.includes(section.toLowerCase())) {
      ok = false;
      console.error(`❌ Draft missing required section token: ${section}`);
    }
  }

  for (const control of domainChecklist.required_quality_controls || []) {
    if (!draft.includes(control.toLowerCase())) {
      ok = false;
      console.error(`❌ Draft missing required quality control token: ${control}`);
    }
  }

  for (const forbidden of ['without evidence', 'guaranteed outcome', 'always safe']) {
    if (draft.includes(forbidden)) {
      ok = false;
      console.error(`❌ Draft contains forbidden phrase: ${forbidden}`);
    }
  }
}

if (!ok) {
  console.error('\nMedical writing checklist check failed.');
  process.exit(1);
}

console.log(`✅ Medical writing checklist check passed (${Object.keys(domains).length} domains)`);
