import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { referencedTables, relationsIn, sqlishSegments } from '../../scripts/ci/check-migration-reachability.mjs';

const blueprint = 'server/services/regulatory/registry/blueprints/usIndAmendmentBlueprint.ts';
const references = (source: string): string[] => [...new Set<string>(
  sqlishSegments(source).flatMap((segment: string) => [...relationsIn(segment)]),
)];

describe('IND amendment guidance cannot introduce phantom SQL relations', () => {
  // The live-schema parser read this prose as SQL ("affected" became a table) until 51391d195f
  // (2026-10-30) made a lower-case verb count only where a string starts like a query. It now reads
  // the prose as prose, and still finds the same word as a relation in a real query.
  it('reads the prior prose false positive as prose, and the same relation in a query as SQL', () => {
    const historical = "const guidance = 'For a CMC amendment only, update affected quality sections. Select drug-substance information according to the actual change.';";
    expect(references(historical)).not.toContain('affected');
    expect(references("const q = 'SELECT id FROM affected WHERE section_code = $1';")).toContain('affected');
  });

  it('keeps the actual authoring scaffold free of SQL relation references', () => {
    expect(references(readFileSync(blueprint, 'utf8'))).toEqual([]);
  });

  it('does not leave an affected-table reference anywhere in the server scan', () => {
    expect(referencedTables().has('affected')).toBe(false);
  });
});
