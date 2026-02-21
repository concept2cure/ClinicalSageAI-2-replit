#!/usr/bin/env ts-node
/**
 * Phase 6.6.H — validate-ectd-stubs-bundle.ts
 *
 * CI Gate: Validates the eCTD stubs bundle DATA against the bundle SCHEMA
 * using AJV (compile + validate), then verifies the bundle hash and
 * cross-references leaf_map ↔ sequence_plan.
 *
 * Key fix vs v1: The old validator navigated properties.* treating the bundle
 * file as a JSON Schema. This version correctly validates the DATA payload
 * (ectd-stubs/ectd_stubs.bundle.json) against the SCHEMA artifact
 * (schemas/ectd_stubs.bundle.schema.json) using ajv.compile(schema)(data).
 *
 * Usage:
 *   npx tsx scripts/validate-ectd-stubs-bundle.ts
 *
 * Exit codes:
 *   0 — all validations pass
 *   1 — validation errors found
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');
const BUNDLE_DATA_PATH = resolve(__dirname, '..', 'ectd-stubs', 'ectd_stubs.bundle.json');
const BUNDLE_SCHEMA_PATH = join(SCHEMAS_DIR, 'ectd_stubs.bundle.schema.json');

const SUB_SCHEMAS = ['leaf_map.schema.json', 'sequence_plan.schema.json', 'm1_index.schema.json'];

let errors = 0;

function log(msg: string) {
  console.log(`[ectd-validate] ${msg}`);
}

function fail(msg: string) {
  console.error(`[ectd-validate] ❌ ${msg}`);
  errors++;
}

function pass(msg: string) {
  console.log(`[ectd-validate] ✅ ${msg}`);
}

// ── Step 0: Existence checks (hard-fail) ──

if (!existsSync(BUNDLE_DATA_PATH)) {
  fail(`Bundle data file missing: ectd-stubs/ectd_stubs.bundle.json`);
  process.exit(1);
}
if (!existsSync(BUNDLE_SCHEMA_PATH)) {
  fail(`Bundle schema file missing: schemas/ectd_stubs.bundle.schema.json`);
  process.exit(1);
}

let bundleData: Record<string, unknown>;
let bundleSchema: Record<string, unknown>;

try {
  bundleData = JSON.parse(readFileSync(BUNDLE_DATA_PATH, 'utf-8'));
} catch (err: any) {
  fail(`Bundle data is not valid JSON: ${err.message}`);
  process.exit(1);
}
try {
  bundleSchema = JSON.parse(readFileSync(BUNDLE_SCHEMA_PATH, 'utf-8'));
} catch (err: any) {
  fail(`Bundle schema is not valid JSON: ${err.message}`);
  process.exit(1);
}

// ── Step 1: AJV — validate DATA against SCHEMA ──

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Register sub-schemas so AJV can resolve $ref URIs
for (const schemaFile of SUB_SCHEMAS) {
  const schemaPath = join(SCHEMAS_DIR, schemaFile);
  if (!existsSync(schemaPath)) {
    fail(`Missing sub-schema file: ${schemaFile}`);
    continue;
  }
  try {
    const sub = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    ajv.addSchema(sub);
    pass(`Loaded sub-schema: ${schemaFile}`);
  } catch (err: any) {
    fail(`Sub-schema ${schemaFile} is not valid JSON: ${err.message}`);
  }
}

const validate = ajv.compile(bundleSchema);
const valid = validate(bundleData);

if (!valid && validate.errors) {
  for (const err of validate.errors) {
    const pointer = err.instancePath || '/';
    const params = err.params ? ` ${JSON.stringify(err.params)}` : '';
    fail(`AJV ${pointer}: ${err.message}${params} (keyword: ${err.keyword})`);
  }
} else {
  pass('Bundle data validates against bundle schema (AJV compile + validate)');
}

// ── Step 2: Verify bundle_hash (SHA-256 of sub-schema contents) ──

try {
  const subContents: Record<string, unknown> = {};
  for (const schemaFile of SUB_SCHEMAS) {
    const schemaPath = join(SCHEMAS_DIR, schemaFile);
    if (existsSync(schemaPath)) {
      subContents[schemaFile] = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    }
  }

  const canonical = JSON.stringify(subContents, Object.keys(subContents).sort(), 0);
  const computedHash = createHash('sha256').update(canonical).digest('hex');
  const storedHash = bundleData.bundle_hash as string | undefined;

  log(`Computed bundle hash: ${computedHash.slice(0, 24)}…`);

  if (!storedHash) {
    fail('Bundle data missing bundle_hash field');
  } else if (computedHash !== storedHash) {
    fail(
      `Bundle hash mismatch: computed ${computedHash.slice(0, 16)}… ≠ stored ${storedHash.slice(0, 16)}…`
    );
  } else {
    pass(`Bundle hash verified: ${computedHash.slice(0, 16)}…`);
  }
} catch (err: any) {
  fail(`Hash computation failed: ${err.message}`);
}

// ── Step 3: Validate proof-pack layout semantics ──

const layout = bundleData.proof_pack_layout as Record<string, unknown> | undefined;
if (layout) {
  if (layout.root_prefix !== 'proof-pack/') {
    fail('Bundle layout: root_prefix must be "proof-pack/"');
  }
  const dirs = layout.required_dirs as string[] | undefined;
  const files = layout.required_files as string[] | undefined;
  if (!Array.isArray(dirs) || dirs.length === 0) {
    fail('Bundle layout: required_dirs must be a non-empty array');
  }
  if (!Array.isArray(files) || files.length === 0) {
    fail('Bundle layout: required_files must be a non-empty array');
  }
  pass('Proof-pack layout validated');
} else {
  fail('Bundle data missing proof_pack_layout');
}

// ── Step 4: Cross-reference leaf_map ↔ sequence_plan ──

const leafMap = bundleData.leaf_map as Record<string, unknown> | undefined;
const seqPlan = bundleData.sequence_plan as Record<string, unknown> | undefined;

if (leafMap && seqPlan) {
  const leaves = (leafMap.leaves as Array<{ leaf_id: string }>) ?? [];
  const ops = (seqPlan.lifecycle_operations as Array<{ leaf_id: string }>) ?? [];
  const leafIds = new Set(leaves.map(l => l.leaf_id));
  const seqLeafIds = new Set(ops.map(op => op.leaf_id));

  for (const seqId of seqLeafIds) {
    if (!leafIds.has(seqId)) {
      fail(`sequence_plan references leaf_id "${seqId}" not found in leaf_map`);
    }
  }
  for (const leafId of leafIds) {
    if (!seqLeafIds.has(leafId)) {
      fail(`leaf_map contains leaf_id "${leafId}" with no lifecycle_operation in sequence_plan`);
    }
  }
  pass('Cross-reference: leaf_map ↔ sequence_plan leaf_ids are 1:1');
}

// ── Step 5: Cross-reference m1_index entries with leaf_map ──

const m1Index = bundleData.m1_index as Record<string, unknown> | undefined;
if (m1Index && leafMap) {
  const entries = (m1Index.entries as Array<{ leaf_id?: string }>) ?? [];
  const leaves = (leafMap.leaves as Array<{ leaf_id: string }>) ?? [];
  const leafIds = new Set(leaves.map(l => l.leaf_id));

  for (const entry of entries) {
    if (entry.leaf_id && !leafIds.has(entry.leaf_id)) {
      fail(`m1_index references leaf_id "${entry.leaf_id}" not found in leaf_map`);
    }
  }
  pass('Cross-reference: m1_index leaf_ids ⊆ leaf_map leaf_ids');
}

// ── Summary ──

console.log('');
if (errors > 0) {
  console.error(`[ectd-validate] ${errors} error(s) found. Fix before merging.`);
  process.exit(1);
} else {
  log('All eCTD stubs validated successfully (AJV schema + hash + layout + cross-ref).');
  process.exit(0);
}
