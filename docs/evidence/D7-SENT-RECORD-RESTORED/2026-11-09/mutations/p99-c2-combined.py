"""P-99 C2: C2M07 and C2M13 together (no CAS on the row AND not judged again under the lock), T10's race run, the file
restored by SHA-256. Shows the pair is needed: either alone is caught by the other (C2M07 survives, C2M13 is red on
its words). Run from the repo root. Env: MUT_EV."""
import datetime, hashlib, os, subprocess
P = 'server/services/submission-service/submission-service.ts'
EDITS = [
  ("            WHERE id = $1 AND organization_id = $2 AND NOT (metadata ? 'leafManifest') AND NOT (metadata ? 'sentRecordStatement')\n",
   "            WHERE id = $1 AND organization_id = $2\n"),
  ("        if (changed) throw sentRecordRefused(changed);\n        if (again.transmittal?.id !== t.id)", "        if (again.transmittal?.id !== t.id)"),
]
T = 'server/services/submission-service/__tests__/sent-record-rederive.pglite.test.ts'
orig = open(P).read(); h0 = hashlib.sha256(orig.encode()).hexdigest()
s = orig
for a, b in EDITS:
    assert s.count(a) == 1, 'anchor not unique: ' + a
    s = s.replace(a, b)
open(P, 'w').write(s)
try:
    r = subprocess.run(['timeout', '600', 'npx', 'vitest', 'run', T, '-t', 'T10'], capture_output=True, text=True)
    out = r.stdout + r.stderr
finally:
    open(P, 'w').write(orig)
h1 = hashlib.sha256(open(P).read().encode()).hexdigest()
keep = [l for l in out.splitlines() if any(k in l for k in ('✓', '×', '→', 'Tests ', 'Expected', 'Received', 'AssertionError'))][:40]
dst = os.path.join(os.environ['MUT_EV'], 'mutation-C2M21-no-cas-and-not-rejudged.txt')
with open(dst, 'w') as f:
    f.write(f"MUTATION C2M21-no-cas-and-not-rejudged in {P} ({datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat()}Z): C2M07 and C2M13 applied together; {T} -t 'T10'\n")
    f.write('\n'.join(keep) + '\n')
    f.write(f"restored sha256 {h1} (expected {h0})\n")
print(open(dst).read())
