import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { referencedTables, relationsIn, sqlishSegments } from '../../scripts/ci/check-migration-reachability.mjs';

const blueprint = 'server/services/regulatory/registry/blueprints/usIndAmendmentBlueprint.ts';
const references = (source: string): string[] => [...new Set<string>(
  sqlishSegments(source).flatMap((segment: string) => [...relationsIn(segment)]),
)];

describe('IND amendment guidance cannot introduce phantom SQL relations', () => {
  it('reproduces the prior prose false positive through the existing live-schema parser', () => {
    const historical = "const guidance = 'For a CMC amendment only, update affected quality sections. Select drug-substance information according to the actual change.';";
    expect(references(historical)).toContain('affected');
  });

  it('keeps the actual authoring scaffold free of SQL relation references', () => {
    expect(references(readFileSync(blueprint, 'utf8'))).toEqual([]);
  });

  it('does not leave an affected-table reference anywhere in the server scan', () => {
    expect(referencedTables().has('affected')).toBe(false);
  });
});
