import { useEffect, useState } from 'react';
import { ASSIGNABLE_ORG_ROLES } from '@shared/constants/org-roles';
import { liveGetOrNull, type ListState, type ShapeGuard } from './dataConnect';
import { captureOrganizationOwner, ORGANIZATION_SESSION_CHANGED, type OrganizationOwner } from './switchOrganization';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positiveId = (v: unknown): boolean => (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
export interface Invitation {
  id: number; organizationId: number; organizationName?: string | null; email: string; role: string; status: 'pending';
}
export function isInvitationList(v: unknown): v is Invitation[] {
  return Array.isArray(v) && v.every(row => isObject(row) && positiveId(row.id) && positiveId(row.organizationId) &&
    typeof row.email === 'string' && row.email.trim() && row.status === 'pending' &&
    (ASSIGNABLE_ORG_ROLES as readonly unknown[]).includes(row.role) &&
    (row.organizationName == null || typeof row.organizationName === 'string')) &&
    new Set(v.map(row => String(row.id))).size === v.length;
}
export const invitationName = (invitation: Invitation) => invitation.organizationName?.trim() || null;
/** Confirm the actual preserved membership role, not an invitation's suggestion. */
export function acceptedMembershipRole(data: unknown, invitation: Invitation, userId: string): string | null {
  if (!isObject(data) || String(data.invitationId) !== String(invitation.id) ||
      String(data.organizationId) !== String(invitation.organizationId) || String(data.userId) !== userId ||
      data.status !== 'accepted' || typeof data.role !== 'string' || !data.role.trim()) return null;
  return data.role.trim();
}
export function invitationResponseNote(invitation: Invitation, action: 'accept' | 'decline', role: string | null): string {
  const name = invitationName(invitation);
  const preservedRole = action === 'accept' && role !== invitation.role ? ` Your existing membership role remains ${role}.` : '';
  return `Invitation ${action === 'accept' ? 'accepted' : 'declined'}${name ? ` for ${name}` : ''}.${preservedRole} Your current workspace remains active.`;
}

export interface Membership { id: number; name: string; role: string; status: string }
export function isMembershipList(value: unknown): value is Membership[] {
  return Array.isArray(value) && value.every(row => Number.isSafeInteger(row?.id) && row.id > 0 &&
    typeof row.name === 'string' && row.name.trim() && typeof row.role === 'string' && row.role.trim() && typeof row.status === 'string' && row.status.trim()) &&
    new Set(value.map(row => row.id)).size === value.length;
}
export type OwnedList<T> = ListState<T> & { owner?: OrganizationOwner };
/** A retained choice keeps the same read owner through its confirmation form. */
export function useOrganizationAccessRows<T>(path: string | null, epoch: number, guard: ShapeGuard<T[]>): OwnedList<T> {
  const [state, setState] = useState<OwnedList<T>>({ rows: [], loading: Boolean(path), empty: false });
  useEffect(() => {
    let retired = false;
    setState({ rows: [], loading: Boolean(path), empty: false });
    if (!path) return;
    const load = async () => {
      try {
        const owner = captureOrganizationOwner();
        const result = await liveGetOrNull<T[]>(path, guard, owner.headers);
        if (retired) return;
        if (!owner.current()) throw new Error(ORGANIZATION_SESSION_CHANGED);
        if (result.error || !result.data || result.meta?.pendingStore === true) throw new Error('Your organization access could not be read. Retry to read the current records.');
        setState({ rows: result.data, loading: false, empty: result.data.length === 0, owner });
      } catch (failure) {
        if (!retired) setState({ rows: [], loading: false, empty: false, error: failure instanceof Error ? failure.message : 'Your organization access could not be read.' });
      }
    };
    void load();
    return () => { retired = true; };
  }, [path, epoch, guard]);
  return state.owner && !state.owner.current() ? { rows: [], loading: false, empty: false, error: ORGANIZATION_SESSION_CHANGED } : state;
}
