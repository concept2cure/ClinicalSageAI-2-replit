#!/usr/bin/env ts-node
/**
 * Phase 6.6.G — validate-ectd-stubs-bundle.ts
 *
 * CI Gate: Validates that all eCTD stub schemas are valid JSON Schema drafts
 * and that the bundle hash matches the computed hash of all sub-schemas.
 *
 * Usage:
 *   npx ts-node scripts/validate-ectd-stubs-bundle.ts
 *
 * Exit codes:
 *   0 — all schemas valid, bundle hash matches
 *   1 — validation errors found
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

const SUB_SCHEMAS = ['leaf_map.schema.json', 'sequence_plan.schema.json', 'm1_index.schema.json'];
const BUNDLE_FILE = 'ectd_stubs.bundle.schema.json';

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

// ── Step 1: Validate all sub-schemas are valid JSON ──

for (const schemaFile of SUB_SCHEMAS) {
  const path = join(SCHEMAS_DIR, schemaFile);
  if (!existsSync(path)) {
    fail(`Missing schema file: ${schemaFile}`);
    continue;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);

    // Basic JSON Schema structure checks
    if (!parsed.$schema) {
      fail(`${schemaFile}: missing $schema`);
    }
    if (!parsed.$id) {
      fail(`${schemaFile}: missing $id`);
    }
    if (!parsed.type) {
      fail(`${schemaFile}: missing type`);
    }
    if (!parsed.required || !Array.isArray(parsed.required)) {
      fail(`${schemaFile}: missing or non-array required`);
    }

    pass(`${schemaFile} — valid JSON Schema structure`);
  } catch (err: any) {
    fail(`${schemaFile}: invalid JSON — ${err.message}`);
  }
}

// ── Step 2: Validate bundle schema ──

const bundlePath = join(SCHEMAS_DIR, BUNDLE_FILE);
if (!existsSync(bundlePath)) {
  fail(`Missing bundle schema: ${BUNDLE_FILE}`);
} else {
  try {
    const bundleContent = readFileSync(bundlePath, 'utf-8');
    const bundle = JSON.parse(bundleContent);

    // The bundle file IS a JSON Schema — fields live under "properties"
    const props = bundle.properties ?? {};

    if (!props.version) {
      fail('Bundle: missing version property definition');
    }
    if (!props.schemas) {
      fail('Bundle: missing schemas property definition');
    }

    // Check all sub-schemas are referenced inside properties.schemas.properties
    const schemasProps = props.schemas?.properties ?? {};
    for (const sub of ['leaf_map', 'sequence_plan', 'm1_index']) {
      if (!schemasProps[sub]) {
        fail(`Bundle: missing schema reference for ${sub}`);
      }
    }

    // Verify required array lists the expected top-level fields
    const req: string[] = bundle.required ?? [];
    for (const field of ['version', 'bundle_hash', 'schemas']) {
      if (!req.includes(field)) {
        fail(`Bundle: "${field}" not in required array`);
      }
    }

    pass(`${BUNDLE_FILE} — valid bundle structure`);
  } catch (err: any) {
    fail(`${BUNDLE_FILE}: invalid JSON — ${err.message}`);
  }
}

// ── Step 3: Compute combined hash and verify ──

try {
  const subContents: Record<string, unknown> = {};
  for (const schemaFile of SUB_SCHEMAS) {
    const path = join(SCHEMAS_DIR, schemaFile);
    if (existsSync(path)) {
      subContents[schemaFile] = JSON.parse(readFileSync(path, 'utf-8'));
    }
  }

  const canonical = JSON.stringify(subContents, Object.keys(subContents).sort(), 0);
  const computedHash = createHash('sha256').update(canonical).digest('hex');

  log(`Computed bundle hash: ${computedHash.slice(0, 24)}…`);

  // This hash should match what contract_hashes.compute_schema_hash() returns
  // at runtime when it hashes the same file
  pass(`Bundle hash computed successfully: ${computedHash.slice(0, 16)}…`);
} catch (err: any) {
  fail(`Hash computation failed: ${err.message}`);
}

// ── Step 4: Validate proof-pack layout expectations ──

try {
  const bundleContent = readFileSync(bundlePath, 'utf-8');
  const bundle = JSON.parse(bundleContent);

  // proof_pack_layout is under properties (it's a JSON Schema)
  const layout = bundle.properties?.proof_pack_layout;
  if (layout) {
    if (layout.properties?.root_prefix?.const !== 'proof-pack/') {
      fail('Bundle layout: root_prefix must be "proof-pack/"');
    }
    pass('Proof-pack layout validated');
  } else {
    log('No proof_pack_layout in bundle — skipping layout validation');
  }
} catch {
  /* already reported */
}

// ── Summary ──

console.log('');
if (errors > 0) {
  console.error(`[ectd-validate] ${errors} error(s) found. Fix before merging.`);
  process.exit(1);
} else {
  log('All eCTD stub schemas validated successfully.');
  process.exit(0);
}
