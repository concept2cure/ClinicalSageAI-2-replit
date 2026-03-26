import { describe, it, expect } from 'vitest';
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
    const repoRoot = path.resolve(__dirname, '../../..');
    const routeSource = fs.readFileSync(path.join(repoRoot, 'server/routes/ana-ri.ts'), 'utf8');
    expect(routeSource).toContain('executor.executeCommands');
    expect(routeSource).toContain('Unknown command: ${command}');
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
