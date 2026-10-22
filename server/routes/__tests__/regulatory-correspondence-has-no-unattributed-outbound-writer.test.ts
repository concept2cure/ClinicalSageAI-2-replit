/**
 * Outbound regulatory correspondence has no second writer that names nobody as
 * the importer.
 *
 * What the code used to do (until 2026-10-15): routes/regulatory-correspondence.ts
 * exported persistOutboundCorrespondenceRecord, an outbound-letter writer with
 * no caller in server/, client/, scripts/ or tests/ (its own unit test aside).
 * It stamped every letter's parser metadata `importedByUserId: 'system'`, wrote
 * the letter and its timeline event outside a transaction, and swallowed its
 * learning-memory write. Outbound letters are written by report-os.ts
 * writeCorrespondence (POST /api/report-os/deliveries), inside the delivery's
 * transaction, as the session user.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = fs.readFileSync(path.join(process.cwd(), 'server/routes/regulatory-correspondence.ts'), 'utf8');

describe('routes/regulatory-correspondence.ts', () => {
  it('defines no uncalled outbound writer', () => {
    expect(SOURCE, 'persistOutboundCorrespondenceRecord is still defined').not.toMatch(/function\s+persistOutboundCorrespondenceRecord\b/);
  });

  it("stamps no correspondence as imported by 'system'", () => {
    expect(SOURCE).not.toMatch(/importedByUserId:\s*['"`]system['"`]/);
  });
});
