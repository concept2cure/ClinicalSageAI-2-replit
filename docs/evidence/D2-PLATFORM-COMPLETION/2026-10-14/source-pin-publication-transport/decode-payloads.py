"""Reconstruct exact sealed JSON virtual paths in a separate local review directory."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import shutil
import tempfile

base = Path(__file__).resolve().parent
repo = base.parents[4]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, help='An empty local output directory; defaults to a new temporary directory.')
args = parser.parse_args()
output = args.output or Path(tempfile.mkdtemp(prefix='c2c-sealed-proof-review-'))
if output.exists() and any(output.iterdir()):
    raise SystemExit('Refusing a nonempty output directory.')
output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((base / 'transport-manifest.json').read_text())
roots = set()
for record in manifest['records']:
    path = Path(record['originalPath'])
    if path.is_absolute() or '..' in path.parts or path.parts[:3] != ('docs', 'evidence', 'D2-PLATFORM-COMPLETION'):
        raise SystemExit('Invalid sealed payload path.')
    roots.add(Path(*path.parts[:5]))
for directory in sorted(roots):
    shutil.copytree(repo / directory, output / directory, dirs_exist_ok=True)
for record in manifest['records']:
    encoded = (repo / record['archivedPath']).read_bytes()
    if hashlib.sha256(encoded).hexdigest() != record['archivedHexDigest']:
        raise SystemExit('Encoded payload hash does not match.')
    raw = gzip.decompress(encoded)
    if len(raw) != record['decodedBytes'] or hashlib.sha256(raw).hexdigest() != record['decodedHexDigest']:
        raise SystemExit('Original sealed payload bytes do not match.')
    destination = output / record['originalPath']
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
print(f"Reconstructed {len(manifest['records'])} exact original JSON files: {output}")
