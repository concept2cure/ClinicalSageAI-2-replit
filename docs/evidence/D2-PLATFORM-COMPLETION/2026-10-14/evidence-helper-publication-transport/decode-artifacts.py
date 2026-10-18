"""Reconstruct exact evidence virtual files into an empty local review directory."""
from pathlib import Path
import argparse
import gzip
import hashlib
import json
import tempfile


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_relative(value):
    path = Path(value)
    if path.is_absolute() or '..' in path.parts or path.parts[:2] != ('docs', 'evidence'):
        raise SystemExit('Invalid evidence path.')
    return path


def read_verified(repo, path, digest):
    raw = (repo / safe_relative(path)).read_bytes()
    if sha256(raw) != digest:
        raise SystemExit('Evidence digest differs: ' + path)
    return raw


def main():
    base = Path(__file__).resolve().parent
    repo = base.parents[4]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Empty local output directory; defaults to a new temporary directory.')
    args = parser.parse_args()
    output = (args.output or Path(tempfile.mkdtemp(prefix='c2c-helper-evidence-review-'))).resolve()
    if output == repo or repo in output.parents or (output.exists() and any(output.iterdir())):
        raise SystemExit('Output must be an empty directory outside the repository.')
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((base / 'transport-manifest.json').read_bytes())
    prior = manifest['composedTransport']
    prior_raw = read_verified(repo, prior['manifestPath'], prior['manifestSha256'])
    read_verified(repo, prior['decoderPath'], prior['decoderSha256'])
    prior_records = json.loads(prior_raw)['records']
    if len(prior_records) != prior['recordCount']:
        raise SystemExit('Prior transport record count differs.')
    records = prior_records + manifest['records']
    decoded = {}
    for record in records:
        original = str(safe_relative(record['originalPath']))
        if original in decoded or record['encoding'] != 'gzip':
            raise SystemExit('Duplicate or unsupported transport record.')
        encoded = read_verified(repo, record['archivedPath'], record['archivedHexDigest'])
        raw = gzip.decompress(encoded)
        if len(raw) != record['decodedBytes'] or sha256(raw) != record['decodedHexDigest']:
            raise SystemExit('Decoded bytes differ: ' + original)
        decoded[original] = raw
        destination = output / original
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
    verified = []
    for seal in manifest['originalSeals']:
        seal_path = safe_relative(seal['path'])
        raw = read_verified(repo, seal['path'], seal['sha256'])
        parsed = json.loads(raw)
        destination = output / seal_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        entries = parsed['files']
        if isinstance(entries, dict):
            entries = [{'path': path, 'digest': digest} for path, digest in entries.items()]
        if len(entries) != seal['recordCount']:
            raise SystemExit('Original seal record count differs.')
        for entry in entries:
            relative = safe_relative(str(seal_path.parent / entry['path']))
            path = str(relative)
            content = decoded.get(path)
            if content is None:
                content = (repo / relative).read_bytes()
            if sha256(content) != entry['digest'] or ('bytes' in entry and len(content) != entry['bytes']):
                raise SystemExit('Original sealed artifact differs: ' + path)
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        verified.append({'manifestPath': seal['path'], 'manifestSha256': sha256(raw), 'verifiedRecords': len(entries)})
    for item in manifest['retainedAddenda']:
        raw = read_verified(repo, item['path'], item['sha256'])
        destination = output / safe_relative(item['path'])
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
    print(json.dumps({'decodedTransportRecords': len(records), 'originalSeals': verified, 'retainedAddenda': len(manifest['retainedAddenda']), 'output': str(output)}, indent=2))


if __name__ == '__main__':
    main()
