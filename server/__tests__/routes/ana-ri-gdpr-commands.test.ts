import { describe, it, expect, vi } from 'vitest';

// Stub the db facade so transitive command-executor / ana-ri service
// imports don't hit a real Postgres pool init at load time. Without
// DATABASE_URL these imports throw 'Database connection not available'
// before any test runs.
vi.mock('../../db', () => ({
  db: {},
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }),
  getDb: () => ({}),
}));

import fs from 'fs';
import path from 'path';
import {
  COMMAND_REGISTRY,
  parseCommandBlocks,
  exportPersonalData,
  erasePersonalData,
} from '../../services/ana-ri/command-executor';

describe('AnA RI GDPR command wiring', () => {
  it('registers personal data GDPR commands for AnA prompt context', () => {
    const names = COMMAND_REGISTRY.map((c) => c.name);
    expect(names).toContain('export_personal_data');
    expect(names).toContain('erase_personal_data');
  });

  it('parses GDPR command blocks', () => {
    const response = [
      'I will process this request now.',
      '```command',
      '{"command":"export_personal_data","params":{"dataSubjectId":42}}',
      '```',
    ].join('\n');

    const parsed = parseCommandBlocks(response);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].command).toBe('export_personal_data');
    expect(parsed[0].params).toEqual({ dataSubjectId: 42 });
  });

  it('uses dynamic executeCommands routing in /api/ana-ri/execute handler', () => {
    // The execute route was moved out of server/routes/ana-ri.ts into the
    // ./ana-ri/generate-execute.ts submodule (the main file now just
    // imports `mountGenerateExecuteRoutes`). Assert against the new
    // submodule location.
    const repoRoot = path.resolve(__dirname, '../../..');
    const executeSource = fs.readFileSync(
      path.join(repoRoot, 'server/routes/ana-ri/generate-execute.ts'),
      'utf8',
    );
    expect(executeSource).toContain('executor.executeCommands');
    expect(executeSource).toContain('Unknown command: ${command}');
  });

  it('forbids cross-subject GDPR commands without admin/privacy role', async () => {
    const exportResult = await exportPersonalData(
      { userId: 5, organizationId: 2, userRole: 'user' },
      { dataSubjectId: 6 }
    );
    expect(exportResult.success).toBe(false);
    expect(exportResult.message).toContain('Forbidden');

    const eraseResult = await erasePersonalData(
      { userId: 5, organizationId: 2, userRole: 'user' },
      { dataSubjectId: 6 }
    );
    expect(eraseResult.success).toBe(false);
    expect(eraseResult.message).toContain('Forbidden');
  });
});
