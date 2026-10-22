/**
 * db/migrations/100_regulatory_templates.sql cites ICH Q2(R2), not the
 * superseded Q2(R1). Until 2026-10-15 the 3.2.S.4.2 and 3.2.S.4.3 templates'
 * ich_guidance read "per ICH Q2(R1)"; Q2(R2) replaced it at Step 4 on 2023-11-01.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = fs.readFileSync(path.resolve(__dirname, '../../db/migrations/100_regulatory_templates.sql'), 'utf8');
const code = SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('100_regulatory_templates citation labels', () => {
  it('seeds no Q2(R1) citation', () => {
    expect(code).not.toMatch(/Q2\(R1\)/);
    expect(code.match(/per ICH Q2\(R2\)/g)).toHaveLength(2);
  });
});
