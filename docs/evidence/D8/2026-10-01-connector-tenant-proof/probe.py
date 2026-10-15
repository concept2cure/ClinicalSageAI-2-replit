#!/usr/bin/env python3
"""Does the connector suite, as the runtime role, see the DATABASE contain a leak?

Mutation L: listPrograms (the service behind c2c_list_projects) loses its
organization condition — the "tool forgot its tenant filter" bug.
Posture S: the suite connects as the database owner (a superuser), as it did
before 2026-10-01.

  L under the runtime role  -> the cross-tenant case must stay GREEN: RLS contains it.
  L under the superuser     -> the cross-tenant case must go RED: the leak is real,
                               so what contained it above was the database.
Every file is restored afterwards.
"""
import os, re, subprocess, sys
REPO = '/home/user/ClinicalSageAI-2-replit'; os.chdir(REPO)
OUT = sys.argv[1]
SVC = 'server/services/regulatory-programs.service.ts'
TST = 'server/mcp/__tests__/mcp-connector.dbtest.ts'
LEAK = ('  const conditions = [eq(regulatoryPrograms.organizationId, orgId)];\n',
        '  const conditions: any[] = []; // PROBE: the organization condition is gone\n')
SUPER = ('  process.env.APP_DATABASE_URL = runtimeUrl.toString();\n',
         '  process.env.APP_DATABASE_URL = databaseUrl; // PROBE: the owner, a superuser\n')
CMD = ['npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', TST]

def run(label, muts):
    backups = {}
    try:
        for path, (old, new) in muts:
            b = backups.setdefault(path, open(path).read())
            cur = open(path).read()
            assert cur.count(old) == 1, f'{label}: anchor missing in {path}'
            open(path, 'w').write(cur.replace(old, new))
        p = subprocess.run(CMD, capture_output=True, text=True, timeout=900, env=dict(os.environ))
        t = p.stdout + p.stderr
        rows = [re.sub(r'^\s*', '', l).replace('server/mcp/__tests__/mcp-connector.dbtest.ts > ', '')[:150]
                for l in t.splitlines() if re.match(r'^\s*[✓×]', l)]
        summ = [l.strip() for l in t.splitlines() if re.search(r'^\s*Tests\s', l)]
        return [f'## {label}', f'   exit {p.returncode}; {" ".join(summ)}'] + [f'   {r}' for r in rows] + ['']
    finally:
        for path, b in backups.items(): open(path, 'w').write(b)

lines = []
lines += run('L under the runtime role (the suite as committed, filter removed)', [(SVC, LEAK)])
lines += run('L under the superuser (the pre-2026-10-01 posture, filter removed)', [(SVC, LEAK), (TST, SUPER)])
lines += run('control: the superuser, filter intact', [(TST, SUPER)])
open(OUT, 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
