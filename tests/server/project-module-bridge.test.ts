import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteWhereSpy = vi.fn();
const updateWhereSpy = vi.fn();

const mockDb = {
  delete: vi.fn(() => ({
    where: deleteWhereSpy,
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: updateWhereSpy,
      returning: vi.fn(),
    })),
  })),
};

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

vi.mock('@shared/schema', () => ({
  projectModules: {
    projectId: { name: 'project_id' },
    organizationId: { name: 'organization_id' },
    moduleType: { name: 'module_type' },
    moduleInstanceId: { name: 'module_instance_id' },
  },
  projects: { id: { name: 'id' }, name: { name: 'name' }, status: { name: 'status' } },
  organizations: { id: { name: 'id' } },
  clientWorkspaces: { id: { name: 'id' } },
}));

describe('ProjectModuleBridge tenant safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes unlinkModule by organizationId', async () => {
    deleteWhereSpy.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    });

    const { ProjectModuleBridge } = await import('../../server/services/project-module-bridge');
    const bridge = new ProjectModuleBridge();

    const removed = await bridge.unlinkModule(11, 'cer', 22, 33);

    expect(removed).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhereSpy).toHaveBeenCalledTimes(1);

    const whereExpression = deleteWhereSpy.mock.calls[0][0] as { queryChunks?: unknown[] };
    const serialized = JSON.stringify(whereExpression);
    expect(serialized).toContain('organization_id');
    expect(serialized).toContain('project_id');
    expect(serialized).toContain('module_type');
    expect(serialized).toContain('module_instance_id');
    expect(serialized).toContain('33');
  });

  it('scopes updateModuleStatus by organizationId', async () => {
    updateWhereSpy.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValue([{ id: 2, status: 'completed' }]),
    });

    const { ProjectModuleBridge } = await import('../../server/services/project-module-bridge');
    const bridge = new ProjectModuleBridge();

    const updated = await bridge.updateModuleStatus(44, 'csr', 55, 'completed', 66);

    expect(updated).toEqual({ id: 2, status: 'completed' });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(updateWhereSpy).toHaveBeenCalledTimes(1);

    const whereExpression = updateWhereSpy.mock.calls[0][0] as { queryChunks?: unknown[] };
    const serialized = JSON.stringify(whereExpression);
    expect(serialized).toContain('organization_id');
    expect(serialized).toContain('project_id');
    expect(serialized).toContain('module_type');
    expect(serialized).toContain('module_instance_id');
    expect(serialized).toContain('66');
  });
});
