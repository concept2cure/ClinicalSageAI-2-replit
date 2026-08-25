/**
 * The allowlist that decides whether a caller-supplied path may be read.
 *
 * Two defects are pinned here, and the second is the one that mattered:
 *
 *   1. `startsWith(root)` is not containment — `/app/storage-evil` genuinely
 *      does start with `/app/storage`.
 *   2. The old allowlist included `storage`, and the per-tenant vault lives at
 *      `storage/vault/{orgId}/…`, so one customer could name another customer's
 *      regulatory document in a request body and read it back.
 *
 * The fix for the second is that `storage` left the allowlist. `resolveDocumentPath`
 * also checks the vault explicitly, but be clear about what that buys: with the
 * root already gone the check is unreachable, and deleting it leaves this file
 * green. The assertion that actually holds the invariant is the structural one
 * below — it fails the moment a root containing the vault is re-added.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  ALLOWED_DOCUMENT_ROOTS,
  TENANT_VAULT_ROOT,
  isPathWithin,
  resolveDocumentPath,
} from '../document-file-roots';

describe('isPathWithin', () => {
  it('accepts the root itself and real descendants', () => {
    expect(isPathWithin('/app/storage', '/app/storage')).toBe(true);
    expect(isPathWithin('/app/storage', '/app/storage/a/b.txt')).toBe(true);
  });

  it('REJECTS a sibling that merely shares the prefix', () => {
    // The bug in one line. `/app/storage-evil` passes a naive startsWith.
    expect(isPathWithin('/app/storage', '/app/storage-evil/secret')).toBe(false);
    expect(isPathWithin('/app/storage', '/app/storage2')).toBe(false);
  });

  it('normalises traversal before comparing', () => {
    expect(isPathWithin('/app/storage', '/app/storage/../etc/passwd')).toBe(false);
  });
});

describe('the tenant vault is not reachable by arbitrary path', () => {
  it('refuses a path inside another organization’s vault', () => {
    // The cross-tenant read this closes: an authenticated user of org 101
    // naming org 202's file in a request body.
    const victim = path.join(TENANT_VAULT_ROOT, '202', 'proj-1', 'versions', 'x', 'ind.pdf');
    expect(resolveDocumentPath(victim)).toBeNull();
  });

  it('refuses the vault root and the caller’s OWN vault path too', () => {
    // Deliberately including the caller's own org: this helper does not know
    // who is asking, so it cannot safely say yes to any vault path. Tenant bytes
    // have one accessor, and it is the one that takes an organization.
    expect(resolveDocumentPath(TENANT_VAULT_ROOT)).toBeNull();
    expect(resolveDocumentPath(path.join(TENANT_VAULT_ROOT, '101', 'p', 'v', 'own.pdf'))).toBeNull();
  });

  it('refuses a vault path reached by traversal from an allowed root', () => {
    const sneaky = path.join(path.resolve('uploads'), '..', 'storage', 'vault', '202', 'f.pdf');
    expect(resolveDocumentPath(sneaky)).toBeNull();
  });

  it('keeps the vault out of the allowlist itself', () => {
    // THIS is the assertion that enforces the invariant — structural, not
    // behavioural. If `storage` (or any root containing the vault) returns to
    // the list, this fails immediately rather than waiting for someone to guess
    // the right path.
    //
    // Worth being precise about what the tests above do and do not prove:
    // with `storage` already off the list, the explicit vault check inside
    // resolveDocumentPath is redundant, and deleting it leaves this whole file
    // green (mutation-tested). Those cases pass because of the allowlist, not
    // because of that check. The check is a second belt for the window between
    // a bad edit and CI; this test is the belt that actually holds.
    for (const root of ALLOWED_DOCUMENT_ROOTS) {
      expect(isPathWithin(root, TENANT_VAULT_ROOT), `${root} contains the tenant vault`).toBe(false);
    }
  });
});

describe('ordinary platform files still resolve', () => {
  // The negative control. Without it, a helper that refused everything would
  // satisfy every assertion above.
  it.each(['uploads', 'exports', 'generated_documents', 'csrs', 'ectd'])(
    'allows a file under %s',
    root => {
      const p = path.join(path.resolve(root), 'report.pdf');
      expect(resolveDocumentPath(p)).toBe(p);
    }
  );

  it('accepts a relative path and returns it resolved', () => {
    expect(resolveDocumentPath('uploads/report.pdf')).toBe(
      path.join(path.resolve('uploads'), 'report.pdf')
    );
  });
});

describe('hostile input', () => {
  it.each([
    ['absolute system path', '/etc/passwd'],
    ['traversal out of a root', 'uploads/../../etc/passwd'],
    ['empty', ''],
    ['whitespace only', '   '],
    ['a NUL byte, which truncates the path in some syscalls', 'uploads/ok.pdf\0.png'],
  ])('rejects %s', (_label, input) => {
    expect(resolveDocumentPath(input)).toBeNull();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { toString: () => '/etc/passwd' }],
    ['an array', ['uploads/ok.pdf']],
  ])('rejects a non-string: %s', (_label, input) => {
    // An object with a toString would be coerced by a naive path.resolve.
    expect(resolveDocumentPath(input)).toBeNull();
  });
});
