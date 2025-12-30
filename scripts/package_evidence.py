#!/usr/bin/env python3
"""Package evidence for submission: create zip of dataset, analysis outputs, CSR, and manifest with SHA256 checksums."""
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            chunk = fh.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def collect(files, out_dir='evidence_package'):
    os.makedirs(out_dir, exist_ok=True)
    manifest = {'created_at': datetime.utcnow().isoformat()+'Z', 'files': []}
    for f in files:
        if not os.path.exists(f):
            print(f'Warning: {f} does not exist, skipping')
            continue
        dest = os.path.join(out_dir, os.path.basename(f))
        shutil.copy2(f, dest)
        manifest['files'].append({'path': os.path.basename(f), 'sha256': sha256_file(dest)})
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
    shutil.make_archive(out_dir, 'zip', out_dir)
    print(f'Created evidence package: {out_dir}.zip')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: package_evidence.py <file1> [file2 ...]')
        sys.exit(2)
    collect(sys.argv[1:])
