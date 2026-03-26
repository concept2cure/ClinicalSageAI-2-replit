import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import {
  COMMAND_REGISTRY,
  parseCommandBlocks,
  exportPersonalData,
  erasePersonalData,
} from '../../services/ana-ri/command-executor';

const { executeCommandsMock } = vi.hoisted(() => ({
  executeCommandsMock: vi.fn(),
}));

vi.mock('../../services/ana-ri/command-executor.js', async () => {
  const actual = await vi.importActual<any>('../../services/ana-ri/command-executor');
  return {
    ...actual,
    COMMAND_REGISTRY: [
      { name: 'export_personal_data' },
      { name: 'erase_personal_data' },
    ],
    executeCommands: (...args: any[]) => executeCommandsMock(...args),
  };
});

describe('AnA RI GDPR command wiring', () => {
  beforeEach(() => {
    executeCommandsMock.mockReset();
  });

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

  it('executes GDPR command through /api/ana-ri/execute dynamic dispatcher', async () => {
    executeCommandsMock.mockResolvedValue([
      { success: true, action: 'export_personal_data', message: 'ok' },
    ]);

    const mod = await import('../../routes/ana-ri');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).tenantId = 2;
      (req as any).user = { id: 10, role: 'admin', name: 'QA' };
      next();
    });
    app.use('/api/ana-ri', mod.default);

    const res = await request(app)
      .post('/api/ana-ri/execute')
      .send({ command: 'export_personal_data', params: { dataSubjectId: 10 } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(executeCommandsMock).toHaveBeenCalledTimes(1);
    expect(executeCommandsMock.mock.calls[0][0]).toEqual([
      { command: 'export_personal_data', params: { dataSubjectId: 10 } },
    ]);
  });

  it('returns unknown command error when command is not in registry', async () => {
    const mod = await import('../../routes/ana-ri');
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).tenantId = 2;
      (req as any).user = { id: 10, role: 'admin' };
      next();
    });
    app.use('/api/ana-ri', mod.default);

    const res = await request(app)
      .post('/api/ana-ri/execute')
      .send({ command: 'non_existent_command', params: {} });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('UNKNOWN_COMMAND');
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
