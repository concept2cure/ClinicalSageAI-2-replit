import sys, subprocess, hashlib, shutil, datetime
name, path, test, filt, a, b = sys.argv[1:7]
import os; out = os.path.join(os.environ.get("MUT_EV", "/tmp"), f"mutation-{name}.txt")
orig = open(path).read(); h0 = hashlib.sha256(orig.encode()).hexdigest()
assert orig.count(a) == 1, 'anchor not unique: ' + a
open(path, 'w').write(orig.replace(a, b))
try:
    r = subprocess.run(['timeout', '600', 'npx', 'vitest', 'run', test, '-t', filt], capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).splitlines() if any(k in l for k in ('✓', '×', 'Tests '))][:40]
finally:
    open(path, 'w').write(orig)
h1 = hashlib.sha256(open(path).read().encode()).hexdigest()
with open(out, 'w') as f:
    f.write(f"MUTATION {name} in {path} (on the final code and tests, {datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat()}Z): replaced [{a}] with [{b}]\n")
    f.write('\n'.join(lines) + '\n')
    f.write(f"restored sha256 {h1} (expected {h0})\n")
print(open(out).read()[-400:])
