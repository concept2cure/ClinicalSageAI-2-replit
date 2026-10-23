"""Validate fixed-byte historical evidence before the runtime-only diff scan.

The separate full Semgrep scan still reads every file. This does not approve
application source, a directory, changed evidence, or a future path.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

RULES = {
    'third_party_html': {
        'html.security.audit.missing-integrity.missing-integrity',
        'html.security.plaintext-http-link.plaintext-http-link',
        'python.django.security.django-no-csrf-token.django-no-csrf-token',
    },
    'historical_test_output': {'generic.secrets.security.detected-jwt-token.detected-jwt-token'},
    'historical_fixture_bootstrap': {
        'python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected',
        'python.lang.security.audit.insecure-transport.urllib.insecure-urlopen.insecure-urlopen',
    },
    'historical_probe': {
        'javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring',
    },
}


def reviewed_paths(repo_root, manifest):
    if not isinstance(manifest, dict) or manifest.get('schemaVersion') != 1:
        raise ValueError('unsupported evidence review schema')
    entries = manifest.get('entries')
    if not isinstance(entries, list) or not entries:
        raise ValueError('missing exact evidence reviews')
    root = repo_root.resolve()
    accepted = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('malformed evidence review')
        name = entry.get('file')
        if (not isinstance(name, str) or not re.fullmatch(r'docs/evidence/[A-Za-z0-9_./-]+', name)
                or '..' in name.split('/') or name in accepted):
            raise ValueError('evidence path must be an exact, unique historical file')
        kind = entry.get('kind')
        rules = entry.get('reviewedRules')
        if (kind not in RULES or not isinstance(rules, list) or not rules
                or any(not isinstance(rule, str) or rule not in RULES[kind] for rule in rules)
                or not isinstance(entry.get('reason'), str) or not entry['reason'].strip()):
            raise ValueError('missing bounded classification and review reason: ' + name)
        expected = entry.get('sha256')
        if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
            raise ValueError('invalid source fingerprint: ' + name)
        source = root / name
        source.resolve().relative_to(root)
        if any(parent.is_symlink() for parent in [source, *source.parents] if parent != root):
            raise ValueError('reviewed evidence cannot use symbolic links: ' + name)
        if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != expected:
            raise ValueError('reviewed evidence changed or disappeared: ' + name)
        accepted.append(name)
    return accepted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--write-excludes', type=Path, required=True)
    args = parser.parse_args()
    manifest_path = args.manifest or args.root / 'scripts/ci/semgrep-reviewed-evidence.json'
    try:
        paths = reviewed_paths(args.root, json.loads(manifest_path.read_text()))
        # Write only after every entry passes. The shell supplies each path as
        # one quoted argument; no glob, command, or shell expansion is emitted.
        args.write_excludes.write_text(''.join(name + '\n' for name in paths))
    except (OSError, ValueError, TypeError) as error:
        print('Semgrep evidence review refused: ' + str(error), file=sys.stderr)
        return 1
    print('Reviewed fixed-byte historical evidence: ' + str(len(paths))
          + ' files; the complete Security-tab scan remains unchanged.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
