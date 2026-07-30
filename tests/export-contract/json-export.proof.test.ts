/**
 * Export-contract proof — JSON export → reopen (parse) → schema qualification.
 *
 * Proof hierarchy tiers 6-7 for the JSON path (docs/architecture/PROOF_HIERARCHY.md).
 * The universal packager emits a real .json envelope for structured/data exports
 * (universal-packager.ts generateJson: { title, metadata, sections, content,
 * generatedAt, generator } via JSON.stringify). JSON.parse alone is the writer's
 * own inverse and proves little, so the independence in this proof comes from an
 * INDEPENDENT validator: an `ajv` JSON-Schema for the envelope contract. This proof
 * takes the REAL generator's output and:
 *   - REOPEN: parses the bytes (must be syntactically valid JSON);
 *   - QUALIFY: validates the parsed object against an ajv schema for the envelope
 *     (required title/content/generator, correct types) and round-trips the
 *     authored title + content token back out of the parsed structure;
 *   - NON-VACUOUS: a truncated buffer fails to parse, and a doctored object missing
 *     the `generator` field FAILS the ajv schema — proving the schema bites.
 *
 * No DB, no mocks: the universal packager imports only docx/archiver/crypto.
 * Output: tests/export-contract/__reports__/json-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import Ajv from 'ajv';
import { packageSingleFormat } from '../../server/services/universal-packager';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const TITLE = 'Structured Export Contract';
const TOKEN = 'ROUNDTRIPJSON5X';
const CONTENT = `Analytical dataset — ${TOKEN}`;

// The envelope contract the packager promises. ajv is a validator independent of
// the JSON.stringify writer: a shape drift (missing/renamed/mistyped field) fails
// here even though JSON.parse would happily accept it.
const ENVELOPE_SCHEMA = {
  type: 'object',
  required: ['title', 'metadata', 'sections', 'content', 'generatedAt', 'generator'],
  additionalProperties: true,
  properties: {
    title: { type: 'string', minLength: 1 },
    metadata: { type: 'object' },
    sections: { type: 'array' },
    content: { type: 'string' },
    generatedAt: { type: 'string', minLength: 1 },
    generator: { type: 'string', const: 'Concept2Cure Universal Packager' },
  },
} as const;

const R = new JourneyRecorder(
  'Export-contract proof — JSON export → reopen → schema qualification',
  'Generate a real .json envelope with the universal packager and qualify it with ' +
    'an independent ajv JSON-Schema, proving the emitted structure honors its ' +
    'contract (not merely that it is parseable JSON).',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('json-export', REPORT_DIR);
});

describe('JSON export → reopen → schema qualification', () => {
  R.limitations.push(
    'JSON.parse is the writer\'s own inverse; the independent check is the ajv ' +
      'JSON-Schema over the envelope. No second JSON serializer is involved.',
  );

  it('generates, reopens, and validates the envelope against an independent schema', async () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(ENVELOPE_SCHEMA as unknown as object);

    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-json', async () => {
      const output = await packageSingleFormat('json', TITLE, CONTENT);
      expect(output).not.toBeNull();
      const buf = output!.buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(output!.format).toBe('json');
      expect(output!.checksum).toMatch(/^[a-f0-9]{64}$/);
      return { sizeBytes: buf.length, format: output!.format, mimeType: output!.mimeType, fileName: output!.fileName };
    });
    const output = await packageSingleFormat('json', TITLE, CONTENT);
    const buffer = output!.buffer;

    // ── REOPEN: syntactically valid JSON ─────────────────────────────────────
    const parsed = await R.step('reopen-parse', async () => {
      const obj = JSON.parse(buffer.toString('utf-8')) as Record<string, unknown>;
      expect(typeof obj).toBe('object');
      return { keys: Object.keys(obj).sort() };
    });
    expect(parsed.keys).toContain('generator');

    // ── QUALIFY: envelope validates against the independent ajv schema ───────
    await R.step('qualify-against-ajv-schema', async () => {
      const obj = JSON.parse(buffer.toString('utf-8')) as Record<string, unknown>;
      const ok = validate(obj);
      expect(ok, `envelope failed schema: ${JSON.stringify(validate.errors)}`).toBe(true);
      // Round-trip the authored data back out of the parsed structure.
      expect(obj.title).toBe(TITLE);
      expect(String(obj.content)).toContain(TOKEN);
      expect(obj.generator).toBe('Concept2Cure Universal Packager');
      return { schemaValid: ok, titleMatches: obj.title === TITLE };
    });

    // ── Non-vacuous #1: a truncated buffer fails to parse ────────────────────
    await R.expectBlocked('truncated-json-fails-parse', async () => {
      const truncated = buffer.subarray(0, buffer.length - 10);
      let parserThrew = false;
      try {
        JSON.parse(truncated.toString('utf-8'));
      } catch {
        parserThrew = true;
      }
      return { blocked: parserThrew, parserThrew };
    });

    // ── Non-vacuous #2: a doctored envelope missing `generator` fails ajv ────
    // Proves the schema is load-bearing: a shape regression the writer might ship
    // (dropped/renamed field) is rejected, not rubber-stamped.
    await R.expectBlocked('envelope-missing-generator-fails-schema', async () => {
      const obj = JSON.parse(buffer.toString('utf-8')) as Record<string, unknown>;
      delete obj.generator;
      const ok = validate(obj);
      return { blocked: ok === false, schemaValid: ok, errorCount: validate.errors?.length ?? 0 };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .json envelope; validated it against an ` +
        `independent ajv schema and confirmed the schema rejects a dropped field.`,
    );
  });
});
