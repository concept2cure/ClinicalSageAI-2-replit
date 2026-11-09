"""P-99 C1 real-PostgreSQL mutation: the refusal dropped from the compile route, the dbtest case run on the
throwaway deploy-shaped database as app_service with RLS on, the file restored by SHA-256. Run from the repo root.
Env: P99_DB (database name), P99_APP_PW_FILE (the app_service password file; read, never printed), MUT_EV (out dir)."""
import datetime, hashlib, os, subprocess
P = 'server/routes/ectd-compile.ts'
A = "      if (req.body?.rehearsal !== true && await refuseCompileOfSequenceOnFile(res, spine.sequence, orgId)) return;\n"
B = ""
db = os.environ['P99_DB']; pw = open(os.environ['P99_APP_PW_FILE']).read().strip()
env = dict(os.environ, CI='true', NODE_ENV='test', RLS_ENFORCE='on',
           DATABASE_URL=f'postgresql://postgres@127.0.0.1:5432/{db}', TEST_DATABASE_URL=f'postgresql://postgres@127.0.0.1:5432/{db}',
           APP_DATABASE_URL=f'postgresql://app_service:{pw}@127.0.0.1:5432/{db}')
orig = open(P).read(); h0 = hashlib.sha256(orig.encode()).hexdigest()
assert orig.count(A) == 1, 'anchor not unique'
open(P, 'w').write(orig.replace(A, B))
try:
    r = subprocess.run(['timeout', '600', 'npx', 'vitest', 'run', '--config', 'vitest.db.config.ts', 'tests/db/ectd-filed-state-view.dbtest.ts',
                        '-t', 'already on file'], capture_output=True, text=True, env=env)
    out = r.stdout + r.stderr
finally:
    open(P, 'w').write(orig)
h1 = hashlib.sha256(open(P).read().encode()).hexdigest()
keep = [l for l in out.splitlines() if any(k in l for k in ('✓', '×', '→', 'Tests ', 'Expected', 'Received', 'AssertionError'))][:30]
dst = os.path.join(os.environ['MUT_EV'], 'mutation-refusal-dropped.txt')
with open(dst, 'w') as f:
    f.write(f"MUTATION refusal-dropped in {P} ({datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat()}Z): the on-file refusal's call removed; "
            f"tests/db/ectd-filed-state-view.dbtest.ts -t 'already on file', on PostgreSQL as app_service with RLS_ENFORCE=on\n")
    f.write('\n'.join(keep) + '\n')
    f.write(f"restored sha256 {h1} (expected {h0})\n")
print(open(dst).read())
