import type { ModuleType, ProjectModule } from '@/concept2cure/hooks/useEnterprise';

export function parseNumericProjectId(projectId: string | number | null | undefined): number | undefined {
  if (projectId === null || projectId === undefined) return undefined;
  const parsed = Number(projectId);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function parseModuleInstanceId(value: string): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function hasExistingModuleLink(
  linkedModules: ProjectModule[],
  moduleType: ModuleType,
  moduleInstanceId: number
): boolean {
  return linkedModules.some(
    item => item.moduleType === moduleType && Number(item.moduleInstanceId) === Number(moduleInstanceId)
  );
}

export function formatModuleTypeLabel(moduleType: string): string {
  return moduleType.replace(/_/g, ' ');
}

export function buildProjectSharePath(projectId: string | number): string {
  return `/concept2cure/project/${encodeURIComponent(String(projectId))}`;
}
