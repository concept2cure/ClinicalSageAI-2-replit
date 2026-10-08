import React, { useRef, useState } from 'react';
import { I } from '../icons';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import type { ToastTone } from '../toast';
import { ASSIGNABLE_ORG_ROLES } from '@shared/constants/org-roles';

/**
 * Change a member's role, or remove them from the organization — the two
 * membership acts of Admin and access (QA 2026-10-08, j9 finding 1, blocker).
 *
 * The member drawer offered only "Grant access" and "Audit activity", both of
 * which typed a sentence into AnA, while the server's own routes for these acts
 * had no caller: PATCH and DELETE /api/tenant-users/:organizationId/:userId.
 * They are org-admin gated against the TARGET organization (authorizeOrgAccess),
 * refuse an administrator's change to their own membership, refuse a change
 * that would leave the organization with no administrator, require a reason,
 * and write the change and its chained audit row in one transaction
 * (services/tenant/membership-change.ts). This file only calls them.
 *
 * Each act opens a governed form that is also its confirmation: the reason is
 * required, the consequence is stated, and the server's answer is shown in its
 * own words. A refusal leaves the form open with what was typed.
 *
 * Neither act is offered on the administrator's own row (the route refuses
 * it), nor when the payload did not name the organization and the member's
 * user id — the ids are never guessed from a display id (fail closed).
 *
 * A member who has not set a password yet (state 'invited') can be sent a new
 * setup link (QA 2026-10-08, j9 finding 5): the drawer re-invites them through
 * the invitation route, POST /api/tenant-users, which replaces their setup
 * token — the previous link stops working — and hands the new one over the way
 * the first was (setupLinkHandover).
 */

export interface MemberActionTarget {
  name: string;
  email?: string;
  /** Display role ("Admin"); the route takes the lowercase value. */
  role: string;
  /** users.id, as GET /api/mdx/admin sends it. */
  userId?: number;
  /** The signed-in administrator's own row. */
  self?: boolean;
  /** 'invited' until the setup link is redeemed (mdx-admin.ts memberStateOf). */
  state?: string;
}

/** The invitation part of a POST /api/tenant-users answer (invitation-delivery.ts). */
export interface InvitationReply {
  delivery?: string;
  setupUrl?: string;
  expiresAt?: string | null;
}

/**
 * How the invitee gets their setup link, as one sentence for the administrator.
 * When this server sends no email the link is copied to the clipboard — and the
 * clipboard is named only when the copy succeeded; otherwise the link is shown.
 * It used to say "on your clipboard" whenever the browser had no clipboard to
 * write to, so the one copy of the link was lost while the page said it was
 * kept.
 */
export async function setupLinkHandover(inv: InvitationReply | undefined): Promise<string> {
  if (inv?.delivery !== 'link' || !inv.setupUrl) {
    return 'An invitation email with their password setup link was sent.';
  }
  const left = inv.expiresAt ? Date.parse(inv.expiresAt) - Date.now() : NaN;
  const days = Number.isFinite(left) ? Math.max(1, Math.round(left / 86_400_000)) : 21;
  let copied = false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(inv.setupUrl);
      copied = true;
    }
  } catch {
    copied = false;
  }
  return (
    `This server sends no email, so ${copied ? 'their password setup link is on your clipboard' : `share this setup link with them: ${inv.setupUrl}`}` +
    ` — it expires in ${days} day${days === 1 ? '' : 's'}.`
  );
}

/** The roles an administrator assigns (shared/constants/org-roles.ts), labelled as the page labels them. */
export const ROLE_OPTIONS = ASSIGNABLE_ORG_ROLES.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

/** What the two signing roles are (P-18), said where a role is chosen. */
const SIGNING_ROLES_NOTE =
  'Approver: everything a manager may, and signs. Reviewer: everything a member may, and signs. ' +
  'Only an admin, an approver or a reviewer can sign; an author cannot approve their own document.';
const roleLabel = (value: string) => ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value;

/** A server sentence, ended once. */
const sentence = (m: string) => (/[.!?]$/.test(m.trim()) ? m.trim() : `${m.trim()}.`);

type Act = 'role' | 'remove' | 'reissue';

type Answer = Record<string, unknown> | null;

/** One membership request, and the server's refusal in its own words. */
async function membershipRequest(
  method: 'PATCH' | 'DELETE' | 'POST',
  url: string,
  body: Record<string, string>,
): Promise<{ ok: true; answer: Answer } | { ok: false; why: string }> {
  try {
    const res = await apiRequest(method, url, body);
    const answer = (await res.json().catch(() => null)) as Answer;
    if (!res.ok) return { ok: false, why: sentence(serverMessage(answer) ?? `the server refused it (HTTP ${res.status})`) };
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, why: sentence(e instanceof Error ? e.message : String(e)) };
  }
}

/** The new setup link's confirmation: the previous link stops working. */
const reissueForm = (member: MemberActionTarget): C2CFormConfig => ({
  eyebrow: 'Members · setup link',
  title: `Issue a new setup link for ${member.name}?`,
  governed:
    `${member.name} has not set a password yet. A new link replaces the one they were sent: the previous link stops working. ` +
    'Issuing it is recorded in the audit trail against you.',
  submitLabel: 'Issue new link',
  fields: [],
});

/** The role change's form: the new role and the reason, both required. */
const roleForm = (member: MemberActionTarget): C2CFormConfig => ({
  eyebrow: 'Members · change role',
  title: `Change ${member.name}'s role`,
  sub: `Current role: ${member.role}.`,
  governed:
    'The new role applies from their next request. The change is recorded in the audit trail against you, with the role before and after and your reason.',
  submitLabel: 'Change role',
  fields: [
    { key: 'role', label: 'New role', type: 'select', options: ROLE_OPTIONS, required: true, default: member.role.toLowerCase(), desc: SIGNING_ROLES_NOTE },
    { key: 'reason', label: 'Reason for the change', type: 'textarea', required: true, rows: 3 },
  ],
});

/** The removal's confirmation: what removal does, and the required reason. */
const removeForm = (member: MemberActionTarget): C2CFormConfig => ({
  eyebrow: 'Members · remove',
  title: `Remove ${member.name} from this organization?`,
  governed:
    `${member.name} loses access to this organization at their next request and cannot sign in to it. ` +
    'Their account and everything they recorded are kept. The removal is recorded in the audit trail against you, with the role they held and your reason.',
  submitLabel: 'Remove member',
  fields: [{ key: 'reason', label: 'Reason for removal', type: 'textarea', required: true, rows: 3 }],
});

export function AdminMemberActions({
  member,
  organizationId,
  onChanged,
  toast,
}: {
  member: MemberActionTarget;
  organizationId?: number;
  onChanged: () => void;
  toast: (m: string, tone?: ToastTone) => void;
}) {
  const [open, setOpen] = useState<Act | null>(null);
  /* One request at a time: the form has no busy state, and a second click on
     "Remove member" must not send a second DELETE. */
  const sending = useRef(false);

  const identified = Number.isInteger(organizationId) && Number.isInteger(member.userId);
  const unavailable = member.self
    ? 'Your own role and membership are changed by another administrator, not from your own row.'
    : identified
      ? null
      : 'This member could not be identified from the admin read, so no change is offered. Reload the page.';
  const path = `/api/tenant-users/${organizationId}/${member.userId}`;

  const send = async (
    request: Parameters<typeof membershipRequest>,
    refused: string,
    done: (answer: Answer) => string | Promise<string>,
  ) => {
    if (sending.current || unavailable) return;
    sending.current = true;
    try {
      const r = await membershipRequest(...request);
      if (!r.ok) {
        toast(`${refused} — ${r.why}`, 'error');
        return;
      }
      toast(await done(r.answer));
      setOpen(null);
      onChanged();
    } finally {
      sending.current = false;
    }
  };

  const changeRole = (v: Record<string, string>) =>
    void send(['PATCH', path, { role: v.role, reason: v.reason.trim() }], 'Role not changed', (answer) =>
      answer?.unchanged === true
        ? `${member.name} already holds the ${roleLabel(v.role)} role — nothing changed.`
        : `${member.name} is now ${roleLabel(v.role)}. The change and your reason are recorded in the audit trail.`,
    );

  const remove = (v: Record<string, string>) =>
    void send(
      ['DELETE', path, { reason: v.reason.trim() }],
      'Member not removed',
      () => `${member.name} was removed from this organization. The removal and your reason are recorded in the audit trail.`,
    );

  const reissue = () =>
    void send(
      ['POST', '/api/tenant-users', { name: member.name, email: member.email ?? '', role: member.role.toLowerCase() }],
      'No new setup link',
      async (answer) =>
        `A new setup link for ${member.name} was issued; the previous one no longer works. ` +
        (await setupLinkHandover((answer?.invitation ?? undefined) as InvitationReply | undefined)),
    );
  const canReissue = member.state === 'invited' && !unavailable && Boolean(member.email);

  return (
    <>
      <button
        className="btn ghost small"
        data-testid="member-change-role"
        disabled={Boolean(unavailable)}
        title={unavailable ?? `Change ${member.name}'s role`}
        onClick={() => setOpen('role')}
      >
        {I.penLine} Change role
      </button>
      <button
        className="btn ghost small"
        data-testid="member-remove"
        disabled={Boolean(unavailable)}
        title={unavailable ?? `Remove ${member.name} from this organization`}
        onClick={() => setOpen('remove')}
      >
        {I.close} Remove from organization
      </button>
      {canReissue && (
        <button
          className="btn ghost small"
          data-testid="member-reissue"
          title={`Issue ${member.name} a new password setup link`}
          onClick={() => setOpen('reissue')}
        >
          {I.key} Issue a new setup link
        </button>
      )}
      {unavailable && <div className="adm-muted adm-sub">{unavailable}</div>}
      {open === 'role' && <C2CForm config={roleForm(member)} onCancel={() => setOpen(null)} onSubmit={changeRole} />}
      {open === 'remove' && <C2CForm config={removeForm(member)} onCancel={() => setOpen(null)} onSubmit={remove} />}
      {open === 'reissue' && <C2CForm config={reissueForm(member)} onCancel={() => setOpen(null)} onSubmit={reissue} />}
    </>
  );
}
