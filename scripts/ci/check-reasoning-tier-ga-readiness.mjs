#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'docs/release/REASONING_TIER_GA_GATES.md',
  'docs/release/REASONING_TIER_HUMAN_UAT_PLAN.md',
  'docs/release/REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md',
  'docs/release/REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md',
  'docs/release/evidence/reasoning-tier-uat/README.md',
  'docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md',
  'docs/evals/REGULATORY_WRITING_QUALITY_RUBRIC.md',
  'docs/evals/MEDICAL_WRITING_RED_FLAG_PATTERNS.md',
  'docs/release/REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md',
  'docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md',
  'docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md',
];

const tokenChecks = [
  {
    file: 'docs/release/REASONING_TIER_GA_GATES.md',
    mustContain: [
      'GA Criteria (All Required)',
      'Governed consequence contract checks enforced in CI',
      'ci:reasoning-tier-readiness',
      'Human UAT completed and signed off',
      'REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md',
      'REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md',
      'REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md',
      'REGULATORY_WRITING_QUALITY_RUBRIC.md',
      'Regulatory + medical-writing quality thresholds enforced',
      'MEDICAL_WRITING_RED_FLAG_PATTERNS.md',
      'REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md',
      'REGULATORY_TERMINOLOGY_GLOSSARY.md',
      'REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md',
      'GA Blockers (Automatic No-Go)',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_HUMAN_UAT_PLAN.md',
    mustContain: [
      'UAT-01 Contradiction Scan',
      'UAT-02 Reviewer Challenge',
      'UAT-03 Evidence Reconciliation',
      'UAT-04 Governance Acceptance',
      'UAT-05 Degraded Mode',
      'UAT-06 Regulatory Narrative Precision',
      'UAT-07 Safety Language Calibration',
      'UAT-08 Regulatory Affairs Final-Pass Review',
      'UAT-09 Terminology Consistency and Scope Control',
      'Exit Criteria for GA Candidate',
      'REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md',
      'REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md',
    mustContain: [
      'Governance and Traceability Checks',
      '`provenance_ref` present and resolvable',
      '`audit_ref` present and resolvable',
      '`downloadable_output_ref` present for downloadable outputs',
      'Run result: **Pass / Conditional Pass / Fail**',
      'REGULATORY_WRITING_QUALITY_RUBRIC.md',
      'MEDICAL_WRITING_RED_FLAG_PATTERNS.md',
      'Regulatory Affairs recommendation',
      'REGULATORY_TERMINOLOGY_GLOSSARY.md',
      'REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md',
      'Storage Convention',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md',
    mustContain: [
      'MW-UAT-01',
      'MW-UAT-02',
      'MW-UAT-03',
      'MW-UAT-04',
    ],
  },
  {
    file: 'docs/evals/REGULATORY_WRITING_QUALITY_RUBRIC.md',
    mustContain: [
      'Minimum Acceptability Thresholds',
      'Factual and Source Integrity',
      'Regulatory Conformance',
      'Clinical Risk Framing and Safety Language',
      'Medical-Writing Clarity and Traceability',
      'Change-Control Friendliness',
    ],
  },
  {
    file: 'docs/evals/MEDICAL_WRITING_RED_FLAG_PATTERNS.md',
    mustContain: [
      'High-Risk Overclaim Patterns',
      'Missing-Uncertainty Patterns',
      'Required Safety/Review Qualifiers',
      'Escalation Rules',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md',
    mustContain: [
      'Submission-Context Fit',
      'Claim and Evidence Quality',
      'Medical Writing Controls',
      'Governance and Traceability',
      'Decision',
    ],
  },
  {
    file: 'docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md',
    mustContain: [
      'Core Terms',
      'Style Controls',
      'Consistency Controls',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md',
    mustContain: [
      'Allowed Edit Types',
      'Restricted Edit Types',
      'Required Review Signals',
      'No-Go Triggers',
    ],
  },
  {
    file: 'docs/release/REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md',
    mustContain: [
      'UAT Completion',
      'Quality and Safety Thresholds',
      'Governance Contract Integrity',
      'Operational Readiness',
      'Final Sign-Off',
      'No-Go',
    ],
  },
];

let failures = 0;

for (const rel of requiredFiles) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) {
    console.error(`❌ missing required GA-readiness file: ${rel}`);
    failures++;
  }
}

for (const check of tokenChecks) {
  const target = path.join(root, check.file);
  if (!fs.existsSync(target)) {
    continue;
  }
  const src = fs.readFileSync(target, 'utf8');
  for (const token of check.mustContain) {
    if (!src.includes(token)) {
      console.error(`❌ ${check.file} missing token: ${token}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\nReasoning Tier GA-readiness docs check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('✅ Reasoning Tier GA-readiness docs check passed.');
