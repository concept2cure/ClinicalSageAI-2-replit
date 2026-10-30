/**
 * A member's QMS approver designation, in the member drawer of Admin and
 * access (decision D-Q of docs/design/REVIEW_ROUTING_2026-10-23.md, §7.8; RR4).
 *
 * QMS controlled documents are approved by the organization's designated QMS
 * approvers (NEW-4). An administrator designates a member, or removes the
 * designation, with a reason, through PUT
 * /api/tenant-users/:organizationId/:userId/qms-approver; the server writes the
 * membership and its governed ledger row on one transaction, and refuses a
 * member without signing authority, the administrator's own row, and a
 * non-administrator, each in its own words. Until anyone is designated,
 * members with the Approver role stand in; the drawer says which applies.
 *
 * This file only calls the route; the route decides.
 */
import React, { useRef, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import type { ToastTone } from '../toast';

export interface QmsApproverTarget {
  name: string;
  userId?: number;
  self?: boolean;
  /** Counts as a QMS approver now (designated, or the Approver role while nobody is). */
  qmsApprover?: boolean;
  /** Designated by an administrator. */
  qmsApproverDesignated?: boolean;
}

/** The member's standing, in the drawer's words. */
export function qmsApproverStanding(m: QmsApproverTarget, standIn: boolean | undefined): string {
  if (m.qmsApproverDesignated) return 'Designated';
  if (standIn && m.qmsApprover) return 'Yes, as an Approver until QMS approvers are designated';
  return 'No';
}

const form = (m: QmsApproverTarget, designate: boolean, standIn: boolean | undefined): C2CFormConfig => ({
  eyebrow: 'Members · QMS approver',
  title: designate ? `Designate ${m.name} as a QMS approver?` : `Remove ${m.name}'s QMS approver designation?`,
  governed: designate
    ? `${m.name} can then be named to approve controlled documents, and approve them. They need signing authority.` +
      (standIn ? ' This is the first designation: from now on only designated members approve controlled documents, not every Approver.' : '') +
      ' The designation is recorded in the audit trail against you, with your reason.'
    : `${m.name} can no longer be named to approve controlled documents, and a route that names them waits for reassignment. The removal is recorded in the audit trail against you, with your reason.`,
  submitLabel: designate ? 'Designate' : 'Remove designation',
  fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true, rows: 3 }],
});

export function AdminQmsApprover({ member, organizationId, standIn, onChanged, toast }: {
  member: QmsApproverTarget;
  organizationId?: number;
  /** True while the organization has designated nobody (GET /api/mdx/admin `qmsApprovers.standIn`). */
  standIn?: boolean;
  onChanged: () => void;
  toast: (m: string, tone?: ToastTone) => void;
}) {
  const [open, setOpen] = useState(false);
  const sending = useRef(false);
  const identified = Number.isInteger(organizationId) && Number.isInteger(member.userId);
  const designated = member.qmsApproverDesignated === true;
  const unavailable = member.self
    ? 'Your own QMS approver designation is changed by another administrator.'
    : identified ? null : 'This member could not be identified from the admin read, so no change is offered. Reload the page.';
  const submit = async (v: Record<string, string>) => {
    if (sending.current || unavailable) return;
    sending.current = true;
    try {
      const res = await apiRequest('PUT', `/api/tenant-users/${organizationId}/${member.userId}/qms-approver`, { designated: !designated, reason: v.reason.trim() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast(`Designation not changed — ${serverMessage(body) ?? `the server refused it (HTTP ${res.status})`}`, 'error');
        return;
      }
      toast(designated
        ? `${member.name} is no longer a QMS approver. The change and your reason are recorded in the audit trail.`
        : `${member.name} is now a designated QMS approver. The designation and your reason are recorded in the audit trail.`);
      setOpen(false);
      onChanged();
    } catch (e) {
      toast(`Designation not changed — ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      sending.current = false;
    }
  };
  return (
    <>
      <button className="btn ghost small" data-testid="member-qms-approver" disabled={Boolean(unavailable)}
        title={unavailable ?? (designated ? `Remove ${member.name}'s QMS approver designation` : `Designate ${member.name} as a QMS approver`)}
        onClick={() => setOpen(true)}>
        {designated ? 'Remove QMS approver designation' : 'Designate as QMS approver'}
      </button>
      {open && <C2CForm config={form(member, !designated, standIn)} onCancel={() => setOpen(false)} onSubmit={(v) => void submit(v)} />}
    </>
  );
}
