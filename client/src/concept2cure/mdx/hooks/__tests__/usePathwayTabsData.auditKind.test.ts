/**
 * @vitest-environment jsdom
 */
/**
 * WO-16C finding 107 — the pathway Audit trail tab (labelled "21 CFR Part 11")
 * showed every real audit row as a READ.
 *
 * `adaptAudit` used the row's `action` string only as a key into a 21-entry
 * lookup and then threw it away: the kit `AuditEvent` had no `action` field, and
 * anything absent from the table became kind `'access'` — rendered as a neutral
 * "Access" chip. The server writes its canonical vocabulary verbatim
 * (`signature_apply`, `data_modify`, `section.delete`, `esignature.sign`,
 * `generate_document`, …) and not one of those strings is a key of that table,
 * so a document deletion, a data modification and an applied e-signature were
 * all indistinguishable from someone opening a page, with the recorded action
 * shown nowhere on screen. The same function also derived `signed` from that
 * invented kind and published the row's `sha256_chain` link as `sig` — a
 * tamper-evidence hash rendered under "Signature · WP-21 CFR Part 11".
 *
 * The failure is injected at the dependency: `useAuditTrail` (the react-query
 * hook that owns GET /api/mdx/audit) is mocked to return the rows the route
 * actually emits for real `audit_logs` content. Nothing under test is mocked.
 *
 * Fixed shape: an action the client has no category for gets the third state —
 * kind `'unclassified'`, with the recorded action carried through and shown
 * verbatim — never a category the client invented; and a narrow filter that
 * cannot speak for those rows says so instead of answering "no events match".
 */

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const refetch = vi.fn();

/** Rows exactly as GET /api/mdx/audit emits them for real audit_logs content. */
const SERVER_EVENTS = [
  {
    id: 'A-101', when: '2026-09-01T10:00:00.000Z', actor: 'u-7', actorName: 'Jordan Chen',
    role: 'Reg Lead', action: 'signature_apply', resource: 'documents', target: '412',
    resourceId: '412', reason: '', sha: 'aa11bb22cc33', prev: '', prevAvailable: false,
    chain: 'sealed',
  },
  {
    id: 'A-102', when: '2026-09-01T10:05:00.000Z', actor: 'u-7', actorName: 'Jordan Chen',
    role: 'Reg Lead', action: 'section.delete', resource: 'sections', target: '§11.4',
    resourceId: '11.4', reason: '', sha: 'dd44ee55ff66', prev: '', prevAvailable: false,
    chain: 'chained',
  },
  {
    id: 'A-103', when: '2026-09-01T10:09:00.000Z', actor: 'u-9', actorName: 'Sara Okafor',
    role: 'QA', action: 'data_modify', resource: 'projects', target: 'PRJ-1',
    resourceId: 'PRJ-1', reason: '', sha: '778899aabbcc', prev: '', prevAvailable: false,
    chain: 'chained',
  },
  {
    id: 'A-104', when: '2026-09-01T10:12:00.000Z', actor: 'u-9', actorName: 'Sara Okafor',
    role: 'QA', action: 'approve', resource: 'documents', target: '412',
    resourceId: '412', reason: '', sha: 'cafebabe0001', prev: '', prevAvailable: false,
    chain: 'chained',
  },
  {
    id: 'A-105', when: '2026-09-01T10:20:00.000Z', actor: 'u-9', actorName: 'Sara Okafor',
    role: 'QA', action: 'data_access', resource: 'documents', target: '412',
    resourceId: '412', reason: '', sha: 'beadfeed0002', prev: '', prevAvailable: false,
    chain: 'chained',
  },
  {
    id: 'A-106', when: '2026-09-01T10:24:00.000Z', actor: 'u-9', actorName: 'Sara Okafor',
    role: 'QA', action: 'view', resource: 'documents', target: '412',
    resourceId: '412', reason: '', sha: 'beadfeed0003', prev: '', prevAvailable: false,
    chain: 'chained',
  },
];

vi.mock('../../../hooks/useProgramTabs', () => ({
  useAuditTrail: () => ({ data: { events: SERVER_EVENTS }, isLoading: false, error: null, refetch }),
  useCorrespondence: () => ({ data: undefined, isLoading: false, error: null, refetch }),
  useApprovalsPending: () => ({ data: undefined, isLoading: false, error: null, refetch }),
}));

import { usePathwayTabsData } from '../usePathwayTabsData';
import {
  AUDIT_KIND_META,
  auditChipMeta,
  unclassifiedFilterCaveat,
} from '../../data/pathwayTabs';

function audit() {
  const { result } = renderHook(() => usePathwayTabsData('k510', 'PRJ-1'));
  return result.current.audit;
}

describe('adaptAudit — the recorded action, not a category the client invented', () => {
  it('does not label a signature, a deletion or a modification as a read', () => {
    const byId = Object.fromEntries(audit().map((e) => [e.id, e]));
    expect(byId['A-101'].kind).not.toBe('access'); // signature_apply
    expect(byId['A-102'].kind).not.toBe('access'); // section.delete
    expect(byId['A-103'].kind).not.toBe('access'); // data_modify
  });

  it('gives an action it has no category for the third state, not a guess', () => {
    const byId = Object.fromEntries(audit().map((e) => [e.id, e]));
    expect(byId['A-101'].kind).toBe('unclassified');
    expect(byId['A-102'].kind).toBe('unclassified');
    expect(byId['A-103'].kind).toBe('unclassified');
    // `data_access` is the server's canonical read action and is likewise not a
    // key of the table — so it too is unclassified rather than assumed.
    expect(byId['A-105'].kind).toBe('unclassified');
    // A row whose action IS in the table keeps its real category.
    expect(byId['A-106'].kind).toBe('access');
  });

  it('carries the recorded action through so the surface can show it', () => {
    const byId = Object.fromEntries(audit().map((e) => [e.id, e]));
    expect(byId['A-101'].action).toBe('signature_apply');
    expect(byId['A-102'].action).toBe('section.delete');
    expect(byId['A-103'].action).toBe('data_modify');
  });

  it('never publishes the row hash-chain link as an electronic signature', () => {
    const byId = Object.fromEntries(audit().map((e) => [e.id, e]));
    // 'approve' is one of the three strings the old table mapped to kind
    // 'sign', which is what turned `sha256_chain` into a Part 11 signature.
    expect(byId['A-104'].sig).toBeUndefined();
    expect(byId['A-104'].signed).toBeFalsy();
    for (const e of audit()) {
      expect(e.sig).toBeUndefined();
      expect(e.signed).toBeFalsy();
    }
  });

  it('still carries the chain link as the chain link', () => {
    const byId = Object.fromEntries(audit().map((e) => [e.id, e]));
    expect(byId['A-101'].hash).toBe('aa11bb22cc33');
    expect(byId['A-101'].chain).toBe('sealed');
  });
});

/* The display half of the same defect: what the pane is allowed to put on the
   chip, and what a narrow filter is allowed to conclude. Both live in
   data/pathwayTabs.ts, which PathwayPanes renders through. */
describe('auditChipMeta — the chip says what was recorded', () => {
  it('shows the recorded action verbatim when there is no category for it', () => {
    expect(auditChipMeta({ kind: 'unclassified', action: 'signature_apply' })).toEqual({
      label: 'signature_apply',
      tone: 'neutral',
    });
    expect(auditChipMeta({ kind: 'unclassified', action: 'section.delete' }).label).toBe(
      'section.delete',
    );
  });

  it('never labels an unclassified row "Access"', () => {
    for (const action of ['signature_apply', 'data_modify', 'section.delete', 'DOCUMENT_DELETED']) {
      expect(auditChipMeta({ kind: 'unclassified', action }).label).not.toBe('Access');
    }
  });

  it('says the action was not recorded rather than inventing one when it is absent', () => {
    expect(auditChipMeta({ kind: 'unclassified' }).label).toBe('Action not recorded');
  });

  it('keeps the closed-enum label for a kind it really did classify', () => {
    expect(auditChipMeta({ kind: 'sign', action: 'sign' })).toEqual(AUDIT_KIND_META.sign);
    expect(auditChipMeta({ kind: 'access', action: 'view' }).label).toBe('Access');
  });
});

describe('unclassifiedFilterCaveat — a narrow filter states what it cannot speak for', () => {
  it('is silent when every row in the window is classified', () => {
    expect(unclassifiedFilterCaveat(0, 12)).toBeNull();
  });

  it('reports the count it cannot answer for instead of implying none matched', () => {
    const note = unclassifiedFilterCaveat(11, 12) ?? '';
    expect(note).toContain('11 of 12');
    expect(note).toMatch(/cannot say/i);
  });
});

/* End-to-end through the adapter: the rows this feed really produces are the
   rows the filter cannot speak for. */
describe('the pane cannot silently answer "no e-signatures" for these rows', () => {
  it('has a caveat to show for the window adaptAudit produces', () => {
    const events = audit();
    const unclassified = events.filter((e) => e.kind === 'unclassified').length;
    expect(unclassified).toBeGreaterThan(0);
    expect(unclassifiedFilterCaveat(unclassified, events.length)).not.toBeNull();
  });
});
