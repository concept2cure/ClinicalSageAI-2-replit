/**
 * A specification's limits must be editable.
 *
 * ## The defect
 *
 * `quality_specifications` holds four `jsonb` columns — `test_parameters`,
 * `acceptance_criteria`, `test_methods`, `regulatory_basis` — and three text
 * ones. The CREATE encodes all four unconditionally
 * (`JSON.stringify(data.acceptanceCriteria || null)`). The UPDATE encoded a
 * value only when it was an OBJECT:
 *
 *     typeof val === 'object' && val !== null ? JSON.stringify(val) : val
 *
 * So a caller that sends a plain criterion could CREATE a specification and
 * then not EDIT it: the new string reached a jsonb column as raw text, Postgres
 * answered 22P02 (`Token "-" is invalid`), and the route returned
 * `500 Failed to update specification · Operation failed`.
 *
 * ## Who that caller is — corrected after review
 *
 * NOT the Specifications tab. `specUpdateBody` always sends `{release, shelf}`,
 * `{method}` and `{ich}` objects, so the form took the object branch and
 * worked; the 500 first reproduced here came from a `curl` sending a shape the
 * form never sends. (What was broken from the tab is a different defect fixed
 * in the same change — `CmcSpecRow.id` was `Number()` of a uuid, so every Edit,
 * Approve and History addressed `/api/cmc/specifications/NaN`. See
 * `client/src/concept2cure/v2/__tests__/cmcSpecRowIdentity.test.ts`.) This
 * branch is reached by any other caller of the same route — an AnA tool, a
 * script, an integration.
 *
 * Found by making the edit against the running server, not by reading the code
 * — which is the point: both branches type-check, and the create and the
 * update sit three screens apart in one file.
 *
 * ## What these cases hold
 *
 * The encoding follows the COLUMN, not the value's JavaScript type. A jsonb
 * column always receives JSON; a text column never does — encoding
 * `justification` would store a quoted string and show the quotes to the next
 * reader.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAW = fs.readFileSync(path.join(process.cwd(), 'server/api/cmc/specificationRoutes.ts'), 'utf8');
/**
 * The route file with its comments blanked.
 *
 * Needed because the fix DOCUMENTS the expression it replaced, quoting it so
 * the next reader knows what went wrong — and a grep over raw source reports
 * that prose as if it were code. This test's own first run did exactly that
 * and failed on the comment explaining the bug it was asserting was gone.
 * Three separate instruments in this repository's audits have been wrong in
 * the same way (scripts/ci/check-client-api-calls-resolve.mjs).
 */
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * `buildSpecUpdate` is module-private, so it is exercised through its source.
 * Behaviour is asserted by re-deriving it: the column map is read out of the
 * file and the rule applied to it, so a column that changes side here fails
 * the case rather than quietly changing what is written.
 */
function columnMap(): Array<{ key: string; column: string; json: boolean }> {
  const block = /const SPEC_COLUMNS: Record<string, \{ column: string; json: boolean \}> = \{([\s\S]*?)\n\};/.exec(SOURCE);
  if (!block) return [];
  return [...block[1].matchAll(/(\w+): \{ column: '(\w+)', json: (true|false) \}/g)].map((m) => ({
    key: m[1], column: m[2], json: m[3] === 'true',
  }));
}

/** The jsonb columns of `quality_specifications`, per the schema that creates it. */
const JSONB_COLUMNS = ['test_parameters', 'acceptance_criteria', 'test_methods', 'regulatory_basis'];
const TEXT_COLUMNS = ['material_type', 'material_name', 'justification'];

describe('an edit encodes each column the way the column is typed', () => {
  it('describes every column the edit can write', () => {
    const map = columnMap();
    expect(map.map((c) => c.column).sort()).toEqual([...JSONB_COLUMNS, ...TEXT_COLUMNS].sort());
  });

  it('marks exactly the jsonb columns as json', () => {
    const map = columnMap();
    expect(map.filter((c) => c.json).map((c) => c.column).sort()).toEqual([...JSONB_COLUMNS].sort());
    expect(map.filter((c) => !c.json).map((c) => c.column).sort()).toEqual([...TEXT_COLUMNS].sort());
  });

  it('no longer decides by the value’s JavaScript type', () => {
    /* The exact expression that shipped the bug. A plain string bound for a
       jsonb column took the `: val` branch and reached Postgres as raw text. */
    expect(SOURCE).not.toContain("typeof val === 'object' && val !== null ? JSON.stringify(val) : val");
    expect(SOURCE).toMatch(/values\.push\(json \? JSON\.stringify\(val \?\? null\) : val\)/);
  });

  it('encodes the same columns the create encodes', () => {
    /* The asymmetry WAS the defect: one statement in this file encoded four
       columns and another encoded none of them for a string. */
    const create = /INSERT INTO quality_specifications[\s\S]*?RETURNING \*`,\s*\[([\s\S]*?)\]\s*\);/.exec(SOURCE);
    expect(create).not.toBeNull();
    const encodedOnCreate = [...create![1].matchAll(/JSON\.stringify\(data\.(\w+)/g)].map((m) => m[1]).sort();
    const encodedOnUpdate = columnMap().filter((c) => c.json).map((c) => c.key).sort();
    expect(encodedOnUpdate).toEqual(encodedOnCreate);
  });

  it('leaves justification as text, so a reader never sees its quotes', () => {
    const justification = columnMap().find((c) => c.column === 'justification');
    expect(justification?.json).toBe(false);
  });
});

describe('the encoding rule itself', () => {
  /** The shipped rule, applied as the route applies it. */
  const encode = (value: unknown, json: boolean) => (json ? JSON.stringify(value ?? null) : value);

  it('makes a plain limit valid JSON for a jsonb column', () => {
    /* The literal failing case: `90.0 - 110.0 %` is not JSON, and `"90.0 -
       110.0 %"` is. */
    expect(encode('90.0 - 110.0 %', true)).toBe('"90.0 - 110.0 %"');
    expect(() => JSON.parse(String(encode('90.0 - 110.0 %', true)))).not.toThrow();
    expect(() => JSON.parse('90.0 - 110.0 %')).toThrow();
  });

  it('still encodes a structured criterion', () => {
    expect(encode({ lower: 90, upper: 110, unit: '%' }, true)).toBe('{"lower":90,"upper":110,"unit":"%"}');
  });

  it('writes SQL NULL rather than the string "null" when a field is cleared', () => {
    /* A cleared jsonb field becomes JSON null; a cleared text field stays
       null. Neither becomes the four characters n-u-l-l. */
    expect(encode(null, true)).toBe('null');
    expect(encode(null, false)).toBeNull();
  });

  it('does not quote a text value', () => {
    expect(encode('Revalidated per REV-2026-031', false)).toBe('Revalidated per REV-2026-031');
  });
});
