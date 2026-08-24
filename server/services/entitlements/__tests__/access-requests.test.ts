/**
 * Module access requests — the rules, as a truth table.
 *
 * WHY THESE TESTS EXIST. Everything a member can reach through this feature is
 * governed by four small predicates. Two of them are the whole security
 * boundary:
 *
 *   · `denyDecision` decides whether the person pressing Approve may hand a
 *     paid module to a workspace. If it ever answers `null` for an org admin
 *     looking at another organization's request, one customer's administrator
 *     can grant capability inside a different customer's tenant. Nothing else
 *     in the stack would catch that: the request id is the only input, the
 *     grant is written to the organization named on the ROW, and the audit
 *     entry would record a perfectly well-formed decision.
 *   · `denyQueueRead` decides who sees other workspaces' asks at all.
 *
 * They are pure functions here precisely so both can be asserted directly,
 * including the case that only shows up under two administrators pressing at
 * once, and the case that only shows up across a tenant boundary.
 *
 * There is no grant test here because there is no grant writer here. Approving
 * writes through `writeModuleGrant` in ../module-grants, which has its own
 * tests; the route's contract WITH it — enabled, and an explicitly unbounded
 * expiry — is asserted in server/routes/__tests__/module-access-requests.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_NOTE_CHARS,
  denyCreate,
  denyDecision,
  denyQueueRead,
  isDecision,
  mapRow,
  normalizeModuleId,
  normalizeNote,
  normalizeReason,
  toIso,
  toStatus,
  type AccessRequestRow,
  type RequestActor,
} from '../access-requests.js';

const MEMBER: RequestActor = {
  userId: 43,
  organizationId: 7,
  isOrgAdmin: false,
  isMasterAdmin: false,
};
const ORG_ADMIN: RequestActor = { ...MEMBER, userId: 42, isOrgAdmin: true };
const OTHER_ORG_ADMIN: RequestActor = { ...ORG_ADMIN, userId: 99, organizationId: 8 };
const MASTER: RequestActor = {
  userId: 1,
  organizationId: 1,
  isOrgAdmin: false,
  isMasterAdmin: true,
};
const ANONYMOUS: RequestActor = {
  userId: null,
  organizationId: null,
  isOrgAdmin: false,
  isMasterAdmin: false,
};

describe('normalizeReason — the governed floor', () => {
  it('accepts three characters and rejects two', () => {
    expect(normalizeReason('abc')).toBe('abc');
    expect(normalizeReason('ab')).toBeNull();
  });

  it('trims before measuring, so whitespace is not a reason', () => {
    expect(normalizeReason('   ab   ')).toBeNull();
    expect(normalizeReason('  approved for the filing  ')).toBe('approved for the filing');
  });

  it('rejects anything that is not a string', () => {
    expect(normalizeReason(undefined)).toBeNull();
    expect(normalizeReason(null)).toBeNull();
    expect(normalizeReason(123)).toBeNull();
    expect(normalizeReason({ reason: 'ok' })).toBeNull();
  });
});

describe('normalizeNote — optional, but never silently cut', () => {
  it('treats an absent or blank note as no note, not as a bad request', () => {
    expect(normalizeNote(undefined)).toEqual({ note: null });
    expect(normalizeNote('   ')).toEqual({ note: null });
  });

  it('keeps the words the requester actually wrote', () => {
    expect(normalizeNote('  needed for the March filing ')).toEqual({
      note: 'needed for the March filing',
    });
  });

  /* Truncation would show an administrator less than the requester wrote, with
     no sign that anything was removed. Refusing is the honest outcome. */
  it('refuses an over-long note rather than truncating it', () => {
    expect(normalizeNote('x'.repeat(MAX_NOTE_CHARS))).toEqual({
      note: 'x'.repeat(MAX_NOTE_CHARS),
    });
    expect(normalizeNote('x'.repeat(MAX_NOTE_CHARS + 1))).toEqual({ tooLong: true });
  });
});

describe('normalizeModuleId / isDecision', () => {
  it('requires a non-blank id', () => {
    expect(normalizeModuleId('  pv-cockpit ')).toBe('pv-cockpit');
    expect(normalizeModuleId('   ')).toBeNull();
    expect(normalizeModuleId(7)).toBeNull();
  });

  it('accepts only the two decisions the table can hold', () => {
    expect(isDecision('approved')).toBe(true);
    expect(isDecision('declined')).toBe(true);
    expect(isDecision('open')).toBe(false);
    expect(isDecision('granted')).toBe(false);
  });
});

describe('denyCreate — any member of a workspace may ask', () => {
  it('lets an ordinary member through', () => {
    expect(denyCreate(MEMBER)).toBeNull();
  });

  it('does not require an administrator — that is the point of the feature', () => {
    expect(denyCreate({ ...MEMBER, isOrgAdmin: false })).toBeNull();
  });

  it('refuses an unauthenticated caller', () => {
    expect(denyCreate(ANONYMOUS)?.status).toBe(401);
  });

  it('refuses an account with no workspace', () => {
    expect(denyCreate({ ...MEMBER, organizationId: null })?.status).toBe(401);
  });
});

describe('denyQueueRead — who sees whose asks', () => {
  it('lets an org admin read their own workspace', () => {
    expect(denyQueueRead(ORG_ADMIN, 'organization')).toBeNull();
  });

  it('refuses an ordinary member the queue', () => {
    expect(denyQueueRead(MEMBER, 'organization')?.status).toBe(403);
  });

  it('lets the platform owner read every workspace', () => {
    expect(denyQueueRead(MASTER, 'all')).toBeNull();
  });

  /* Refused, not narrowed. A console headed "every workspace" that quietly
     shows one workspace is lying about its own scope. */
  it('refuses an org admin the all-workspaces scope outright', () => {
    expect(denyQueueRead(ORG_ADMIN, 'all')?.status).toBe(403);
  });

  /* Authentication is answered before authority, in both scopes: "sign in" is
     the actionable sentence, and "you are not the platform owner" told to
     nobody in particular is not. */
  it('refuses an unauthenticated caller either scope, as not-signed-in', () => {
    expect(denyQueueRead(ANONYMOUS, 'organization')?.status).toBe(401);
    expect(denyQueueRead(ANONYMOUS, 'all')?.status).toBe(401);
  });
});

describe('denyDecision — the tenant boundary', () => {
  const OPEN_IN_ORG_7 = { organizationId: 7, status: 'open' as const };

  it('lets the workspace own administrator answer', () => {
    expect(denyDecision(ORG_ADMIN, OPEN_IN_ORG_7)).toBeNull();
  });

  it('refuses an ordinary member of the same workspace', () => {
    expect(denyDecision(MEMBER, OPEN_IN_ORG_7)?.status).toBe(403);
  });

  /* THE ONE THAT MATTERS. An administrator of workspace 8 must not be able to
     grant a module inside workspace 7 by naming its request id. */
  it('refuses an administrator of a different workspace', () => {
    const denial = denyDecision(OTHER_ORG_ADMIN, OPEN_IN_ORG_7);
    expect(denial?.status).toBe(403);
    expect(denial?.error).toMatch(/another workspace/i);
  });

  it('lets the platform owner answer across workspaces', () => {
    expect(denyDecision(MASTER, OPEN_IN_ORG_7)).toBeNull();
  });

  /* The boundary is checked BEFORE the state, so probing ids across a tenant
     boundary returns the same answer for every id rather than revealing which
     ones have already been answered. */
  it('tells an outsider they are an outsider, not that the request is closed', () => {
    const denial = denyDecision(OTHER_ORG_ADMIN, { organizationId: 7, status: 'approved' });
    expect(denial?.status).toBe(403);
  });

  it('refuses a second answer on an already-answered request', () => {
    expect(denyDecision(ORG_ADMIN, { organizationId: 7, status: 'approved' })?.status).toBe(409);
    expect(denyDecision(ORG_ADMIN, { organizationId: 7, status: 'declined' })?.status).toBe(409);
  });

  it('refuses an unauthenticated caller', () => {
    expect(denyDecision(ANONYMOUS, OPEN_IN_ORG_7)?.status).toBe(401);
  });
});

describe('mapRow — the client contract', () => {
  const ROW: AccessRequestRow = {
    id: '12',
    organization_id: '7',
    module_id: 'pv-cockpit',
    requested_by: '43',
    requester_email: 'member@example.test',
    requester_name: 'A Member',
    note: 'needed for the March filing',
    status: 'open',
    decided_by: null,
    decided_by_email: null,
    decided_at: null,
    decision_reason: null,
    created_at: '2026-03-01T09:30:00.000Z',
    updated_at: '2026-03-01T09:30:00.000Z',
    module_name: 'PV cockpit',
    organization_name: 'Northwind Bio',
  };

  it('narrows the numeric keys and carries the joined names', () => {
    const mapped = mapRow(ROW);
    expect(mapped.id).toBe(12);
    expect(mapped.organizationId).toBe(7);
    expect(mapped.requestedBy).toBe(43);
    expect(mapped.moduleName).toBe('PV cockpit');
    expect(mapped.organizationName).toBe('Northwind Bio');
    expect(mapped.createdAt).toBe('2026-03-01T09:30:00.000Z');
  });

  /* A status the table should never hold must not read as actionable. */
  it('reads an unknown status as open rather than inventing a fourth state', () => {
    expect(toStatus('granted')).toBe('open');
    expect(toStatus(undefined)).toBe('open');
    expect(toStatus('declined')).toBe('declined');
  });

  it('returns null for an unreadable instant instead of a date-shaped string', () => {
    expect(toIso('not a date')).toBeNull();
    expect(toIso(null)).toBeNull();
    expect(toIso(new Date('2026-03-01T09:30:00.000Z'))).toBe('2026-03-01T09:30:00.000Z');
  });
});
