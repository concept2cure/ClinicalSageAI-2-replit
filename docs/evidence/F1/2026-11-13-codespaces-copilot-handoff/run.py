"""Retain actual exits and redacted output for this owned rehearsal packet."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

packet = Path(__file__).resolve().parent
repo = packet.parents[3]
label, *command = sys.argv[1:]
if command and command[0] == '--':
    command = command[1:]
assert command
manifest_name = os.environ.get('C2C_HANDOFF_INPUT_MANIFEST', 'inputs.json')
assert Path(manifest_name).name == manifest_name and manifest_name.endswith('.json')
manifest = packet / manifest_name
if not manifest.exists():
    names = subprocess.check_output(['git', 'ls-files', '.devcontainer', 'scripts', 'server', 'shared',
        'client', 'migrations', 'db', 'package.json', 'package-lock.json', '.nvmrc', '.npmrc'], cwd=repo, text=True).splitlines()
    files = {name: hashlib.sha256((repo / name).read_bytes()).hexdigest() for name in names if (repo / name).is_file()}
    manifest.write_text(json.dumps({'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip(),
        'scope': 'Named tracked product, bootstrap, migration and package inputs; not all system or dynamic inputs.',
        'files': files}, indent=2) + '\n')
expected = json.loads(manifest.read_text())['files']
def hashes():
    return {name: hashlib.sha256((repo / name).read_bytes()).hexdigest() for name in expected}
before = hashes()
execution_paths = [Path(__file__).resolve()]
for argument in command:
    candidate = (repo / argument).resolve()
    if candidate.suffix in {'.cjs', '.js', '.mjs', '.py', '.sh', '.json'} and candidate.is_file() and candidate.is_relative_to(repo):
        execution_paths.append(candidate)
execution_before = {str(path.relative_to(repo)): hashlib.sha256(path.read_bytes()).hexdigest() for path in execution_paths}
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(command, cwd=repo, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
raw = result.stdout
private = Path('/workspace/scratch') / (label + '.private.log')
private.write_bytes(raw)
private.chmod(0o600)
text = raw.decode(errors='replace')
text = re.sub(r'(postgres(?:ql)?://[^:\s/@]+:)[^@\s]+(@)', r'\1***\2', text)
text = re.sub(r'(?i)(Bearer\s+)[A-Za-z0-9._-]+', r'\1***', text)
text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted JWT]', text)
text = re.sub(r'(?m)^((?:JWT_SECRET|SESSION_SECRET|REFRESH_TOKEN_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEMO_SIGNER_PASSWORD|APP_SERVICE_DB_PASSWORD|DATABASE_OWNER_URL|APP_DATABASE_URL)=).*$', r'\1[redacted]', text)
compressed = gzip.compress(text.encode(), mtime=0)
output = label + '.txt.gz'
(packet / output).write_bytes(compressed)
after = hashes()
drift = [name for name, value in expected.items() if before[name] != value or after[name] != value]
execution_drift = [name for name, value in execution_before.items() if hashlib.sha256((repo / name).read_bytes()).hexdigest() != value]
receipt = {'startedAt': started, 'elapsedSeconds': round(time.monotonic() - clock, 3), 'argv': command,
    'exitCode': result.returncode, 'sourceDrift': drift, 'inputs': manifest.name, 'inputCount': len(expected),
    'executionInputs': execution_before, 'executionInputDrift': execution_drift,
    'harnessSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'output': output, 'outputSha256': hashlib.sha256(compressed).hexdigest(),
    'rawLogRetainedPrivately': True, 'outputRedacted': text.encode() != raw}
(packet / (label + '.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
if result.returncode:
    print('\n'.join(text.splitlines()[-18:]))
sys.exit(result.returncode or bool(drift) or bool(execution_drift))
