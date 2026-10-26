"""Read-only proof against an actual Git revision; optional receipt for code publication."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--revision', default='HEAD')
parser.add_argument('--receipt')
parser.add_argument('--require-artifacts', action='store_true')
args = parser.parse_args()
packet = Path(__file__).resolve().parent
root = packet.parents[3]
relative = packet.relative_to(root).as_posix()


def git(*argv):
    return subprocess.check_output(['git', *argv], cwd=root)


def digest(data):
    return hashlib.sha256(data).hexdigest()


revision = git('rev-parse', args.revision).decode().strip()
inputs = json.loads((packet / 'final-qualified-inputs.json').read_text())['files']
for name, expected in inputs.items():
    assert digest(git('show', f'{revision}:{name}')) == expected, name
    assert digest((root / name).read_bytes()) == expected, name
source = json.loads((packet / 'source-commit.json').read_text())['head']
subprocess.run(['git', 'merge-base', '--is-ancestor', source, revision], cwd=root, check=True)
artifacts = None
if args.require_artifacts:
    manifest = json.loads(git('show', f'{revision}:{relative}/artifact-manifest.json'))['files']
    for name, expected in manifest.items():
        assert digest(git('show', f'{revision}:{relative}/{name}')) == expected, name
        assert digest((packet / name).read_bytes()) == expected, name
    tracked = set(git('ls-files', '-z', '--', relative).decode().split('\0'))
    all_files = {f.relative_to(root).as_posix() for f in packet.rglob('*') if f.is_file()}
    assert all_files <= tracked, sorted(all_files - tracked)
    assert {f.relative_to(packet).as_posix() for f in packet.rglob('*') if f.is_file()} == set(manifest) | {'artifact-manifest.json'}
    artifacts = len(manifest) + 1
result = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'verifiedRevision': revision, 'sourceCommit': source,
          'qualifiedGitInputBlobs': len(inputs), 'allQualifiedInputsMatch': True,
          'publishedEvidenceArtifacts': artifacts, 'sourceCommitIsAncestor': True}
if args.receipt:
    (packet / args.receipt).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
