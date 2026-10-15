#!/usr/bin/env python3
"""Undo each D8 fix in turn, run the tests that pin it, restore. Every mutation must turn something red."""
import os, re, shutil, subprocess, sys

REPO = '/home/user/ClinicalSageAI-2-replit'
OUT = sys.argv[1]
os.chdir(REPO)
env = dict(os.environ, TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_d8_dbtest')

DB = ['npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', 'server/mcp/__tests__/mcp-account-standing.dbtest.ts']
UNIT = ['npx', 'vitest', 'run', 'server/mcp/__tests__/mcp-standing-unreadable.test.ts',
        'server/__tests__/security/security-swarm-hardening.test.ts']

MUTATIONS = [
    ('M1 the connector verifier skips the live-token check (finding #6, P0-2c)',
     'server/mcp/auth/platform-token.ts',
     '    await verifyLiveToken(token);\n', '    void verifyLiveToken;\n', [DB, UNIT]),
    ('M2 the /token exchanges skip the account standing (finding #6, P0-2c)',
     'server/mcp/auth/provider.ts',
     '      active = await isAccountActiveBeforeTenant(grant.userId);\n', '      active = true;\n', [DB, UNIT]),
    ('M3 fail-open: an unreadable standing at /mcp admits the session',
     'server/mcp/auth/platform-token.ts',
     "    throw new ServerError('The session could not be checked. Try again.');\n", '    return claims;\n', [UNIT]),
    ('M4 fail-open: an unreadable standing at /token admits the grant',
     'server/mcp/auth/provider.ts',
     "      throw new ServerError('The account could not be checked. Try again.');\n", '      active = true;\n', [UNIT]),
    ('M5 the token-class rule ignores token_use (P0-2a)',
     'server/middleware/tokenType.ts',
     "  if (use === undefined || use === null) return null;\n", '  return null;\n', [DB, UNIT]),
    ('M6 consent reports an unreadable standing as a bad sign-in',
     'server/mcp/auth/consent.ts',
     '      if (err instanceof ServerError) {\n', '      if (false as boolean) {\n', [UNIT]),
    ('M7 the grant store runs in the pre-auth scope again (grant store under RLS)',
     'server/mcp/auth/store.ts', None, None, [DB]),
]

def run(cmd):
    p = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=600)
    text = p.stdout + p.stderr
    summary = [l.strip() for l in text.splitlines() if re.search(r'^\s*Tests\s', l)]
    failed = [re.sub(r'^\s*×\s*', '', l).replace('server/mcp/__tests__/', '').replace('server/__tests__/security/', '')[:170]
              for l in text.splitlines() if re.match(r'^\s*×', l)]
    return p.returncode, summary, failed

lines = []
all_red = True
for label, path, old, new, suites in MUTATIONS:
    backup = open(path).read()
    try:
        if old is None:
            # Whole-file revert of the store to trunk's version, then the store's
            # callers are unchanged: the grant secrets revert to unprefixed.
            # The version before the fix: its parent, never HEAD (which, once the fix is
            # committed, IS the fix, and the mutation would change nothing).
            base = os.environ.get('D8_PRE_FIX_REF', 'HEAD')
            subprocess.run(['git', 'show', f'{base}:{path}'], stdout=open(path, 'w'), check=True)
            if open(path).read() == backup:
                raise SystemExit(f'{label}: the revert changed nothing ({base} holds the fix) — set D8_PRE_FIX_REF')
        else:
            assert backup.count(old) == 1, f'{label}: anchor not found exactly once'
            open(path, 'w').write(backup.replace(old, new))
        lines.append(f'## {label}\n   file: {path}')
        any_red = False
        for cmd in suites:
            code, summary, failed = run(cmd)
            name = 'dbtest' if 'vitest.db.config.ts' in cmd else 'unit'
            lines.append(f'   [{name}] exit {code}; {" ".join(summary)}')
            for f in failed:
                lines.append(f'      × {f}')
            any_red = any_red or code != 0
        lines.append(f'   => {"RED (the tests catch it)" if any_red else "GREEN — NOT CAUGHT"}\n')
        all_red = all_red and any_red
    finally:
        open(path, 'w').write(backup)

lines.append('ALL MUTATIONS CAUGHT' if all_red else 'SOME MUTATION WAS NOT CAUGHT')
open(OUT, 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
