/** The existing project intake's creator-bound workspace directory and receipt. */
export interface ProjectIntakeActor { actorUserId: number; organizationId: number }
export interface ProjectIntakeWorkspace { id: string; name: string; organizationId: string; status: 'active' }
export interface ProjectIntakeWorkspaces {
  success: true;
  clients: ProjectIntakeWorkspace[];
  meta: ProjectIntakeActor & { purpose: 'project-intake' };
}
export interface ProjectIntakeReceipt {
  data: { id: string; title?: string; code?: string; ws?: string; status?: string };
  meta: ProjectIntakeActor & {
    created: true; projectAnchorId: number; clientWorkspaceId: number; clientWorkspaceName: string;
    scaffoldSkipped?: string; scaffoldDetail?: string;
  };
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function projectIntakeId(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}
export function isProjectIntakeWorkspaces(value: unknown, actor: ProjectIntakeActor): value is ProjectIntakeWorkspaces {
  if (!object(value) || value.success !== true || !object(value.meta) || value.meta.purpose !== 'project-intake' ||
      value.meta.actorUserId !== actor.actorUserId || value.meta.organizationId !== actor.organizationId || !Array.isArray(value.clients)) return false;
  const seen = new Set<string>();
  return value.clients.every((row: unknown) => {
    if (!object(row) || typeof row.id !== 'string' || projectIntakeId(row.id) === null || seen.has(row.id) ||
        row.organizationId !== String(actor.organizationId) || row.status !== 'active' || typeof row.name !== 'string' || !row.name.trim()) return false;
    seen.add(row.id);
    return true;
  });
}
export function isProjectIntakeReceipt(value: unknown, actor: ProjectIntakeActor, workspace: ProjectIntakeWorkspace): value is ProjectIntakeReceipt {
  if (!object(value) || !object(value.data) || !object(value.meta)) return false;
  const { data, meta } = value;
  return typeof data.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.id) &&
    meta.created === true && typeof meta.projectAnchorId === 'number' && projectIntakeId(meta.projectAnchorId) !== null &&
    meta.actorUserId === actor.actorUserId && meta.organizationId === actor.organizationId &&
    meta.clientWorkspaceId === Number(workspace.id) && meta.clientWorkspaceName === workspace.name &&
    ['title', 'code', 'ws', 'status'].every(key => data[key] === undefined || typeof data[key] === 'string') &&
    ['scaffoldSkipped', 'scaffoldDetail'].every(key => meta[key] === undefined || typeof meta[key] === 'string');
}
