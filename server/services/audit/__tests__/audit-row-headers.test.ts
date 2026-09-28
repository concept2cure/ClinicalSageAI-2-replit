/**
 * setAuditRowHeaders — the one writer of the X-Audit-Row-* header pair.
 *
 * Five hand-written copies of this existed (client-branding, device-projects,
 * ivd-assessments, predicate-intelligence, and inline in submissions). The
 * client transport reads the pair; one definition keeps what it reads and what
 * every route writes from drifting apart.
 */
import { describe, it, expect } from 'vitest';
import { setAuditRowHeaders } from '../audit-write-outcome';

function res() {
  const h: Record<string, string> = {};
  return { h, setHeader: (k: string, v: string) => { h[k] = v; } };
}

describe('setAuditRowHeaders', () => {
  it('a lost row: persisted false and the stable code, never the store text', () => {
    const r = res();
    setAuditRowHeaders(r, { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'm' });
    expect(r.h).toEqual({ 'X-Audit-Row-Persisted': 'false', 'X-Audit-Row-Code': 'AUDIT_ROW_NOT_PERSISTED' });
  });
  it('a written row: persisted true and no code', () => {
    const r = res();
    setAuditRowHeaders(r, { persisted: true, chained: true });
    expect(r.h).toEqual({ 'X-Audit-Row-Persisted': 'true' });
  });
  it('no outcome (no audited write happened): no headers', () => {
    const r = res();
    setAuditRowHeaders(r, undefined);
    expect(r.h).toEqual({});
  });
});
