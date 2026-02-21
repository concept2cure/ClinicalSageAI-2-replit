/**
 * Phase 6.6.H — eCTD Bundle Validation Tests
 *
 * Tests the AJV-based bundle validator:
 *   1. Valid bundle data passes validation
 *   2. Invalid bundle data fails and reports JSONPointer errors
 *   3. Bundle hash verification
 *   4. Cross-reference checks (leaf_map ↔ sequence_plan)
 *
 * Run: npx vitest run tests/ectd-bundle-validation.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';

const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');
const BUNDLE_DATA_PATH = resolve(__dirname, '..', 'ectd-stubs', 'ectd_stubs.bundle.json');
const BUNDLE_SCHEMA_PATH = join(SCHEMAS_DIR, 'ectd_stubs.bundle.schema.json');
const SUB_SCHEMAS = ['leaf_map.schema.json', 'sequence_plan.schema.json', 'm1_index.schema.json'];

let ajv: InstanceType<typeof Ajv>;
let bundleSchema: Record<string, unknown>;
let bundleData: Record<string, unknown>;

beforeAll(() => {
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Load sub-schemas
  for (const schemaFile of SUB_SCHEMAS) {
    const path = join(SCHEMAS_DIR, schemaFile);
    if (existsSync(path)) {
      ajv.addSchema(JSON.parse(readFileSync(path, 'utf-8')));
    }
  }

  bundleSchema = JSON.parse(readFileSync(BUNDLE_SCHEMA_PATH, 'utf-8'));
  bundleData = JSON.parse(readFileSync(BUNDLE_DATA_PATH, 'utf-8'));
});

describe('Phase 6.6.H — eCTD Bundle AJV Validation', () => {
  it('valid bundle data passes AJV validation', () => {
    const validate = ajv.compile(bundleSchema);
    const valid = validate(bundleData);
    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('invalid bundle (missing version) fails AJV validation', () => {
    const invalid = { ...bundleData };
    delete (invalid as any).version;

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();
    expect(validate.errors!.length).toBeGreaterThan(0);

    // Should report the missing 'version' field
    const errorMessages = validate.errors!.map(e => `${e.instancePath}: ${e.message}`);
    const hasVersionError = errorMessages.some(
      m => m.includes('version') || m.includes('required')
    );
    expect(hasVersionError).toBe(true);
  });

  it('invalid bundle (missing leaf_map) fails AJV validation', () => {
    const invalid = { ...bundleData };
    delete (invalid as any).leaf_map;

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();

    const errorMessages = validate.errors!.map(e => `${e.instancePath}: ${e.message}`);
    const hasMissing = errorMessages.some(m => m.includes('leaf_map') || m.includes('required'));
    expect(hasMissing).toBe(true);
  });

  it('invalid bundle (bad bundle_hash format) fails AJV validation', () => {
    const invalid = JSON.parse(JSON.stringify(bundleData));
    invalid.bundle_hash = 'not-a-valid-hash';

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it('invalid leaf_map (bad leaf_id pattern) fails AJV validation', () => {
    const invalid = JSON.parse(JSON.stringify(bundleData));
    invalid.leaf_map.leaves[0].leaf_id = 'INVALID_LEAF_ID';

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);

    const pointers = validate.errors!.map(e => e.instancePath);
    expect(pointers.some(p => p.includes('leaf_map'))).toBe(true);
  });

  it('invalid sequence_plan (bad operation) fails AJV validation', () => {
    const invalid = JSON.parse(JSON.stringify(bundleData));
    invalid.sequence_plan.lifecycle_operations[0].operation = 'INVALID_OP';

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);
  });

  it('bundle_hash matches computed hash of sub-schemas', () => {
    const subContents: Record<string, unknown> = {};
    for (const schemaFile of SUB_SCHEMAS) {
      const path = join(SCHEMAS_DIR, schemaFile);
      subContents[schemaFile] = JSON.parse(readFileSync(path, 'utf-8'));
    }

    const canonical = JSON.stringify(subContents, Object.keys(subContents).sort(), 0);
    const computed = createHash('sha256').update(canonical).digest('hex');

    expect(bundleData.bundle_hash).toBe(computed);
  });

  it('leaf_map and sequence_plan leaf_ids are 1:1', () => {
    const leafMap = bundleData.leaf_map as any;
    const seqPlan = bundleData.sequence_plan as any;

    const leafIds = new Set(leafMap.leaves.map((l: any) => l.leaf_id));
    const seqIds = new Set(seqPlan.lifecycle_operations.map((op: any) => op.leaf_id));

    // Every sequence plan leaf_id must exist in leaf_map
    for (const id of seqIds) {
      expect(leafIds.has(id)).toBe(true);
    }

    // Every leaf_map leaf_id must have a lifecycle operation
    for (const id of leafIds) {
      expect(seqIds.has(id)).toBe(true);
    }
  });

  it('m1_index leaf_ids are subset of leaf_map', () => {
    const leafMap = bundleData.leaf_map as any;
    const m1Index = bundleData.m1_index as any;

    const leafIds = new Set(leafMap.leaves.map((l: any) => l.leaf_id));

    for (const entry of m1Index.entries) {
      if (entry.leaf_id) {
        expect(leafIds.has(entry.leaf_id)).toBe(true);
      }
    }
  });

  it('rejects additional properties in bundle data', () => {
    const invalid = JSON.parse(JSON.stringify(bundleData));
    invalid.extra_unknown_field = 'should fail';

    const validate = ajv.compile(bundleSchema);
    const valid = validate(invalid);
    expect(valid).toBe(false);

    const hasAdditionalPropError = validate.errors!.some(e => e.keyword === 'additionalProperties');
    expect(hasAdditionalPropError).toBe(true);
  });
});
