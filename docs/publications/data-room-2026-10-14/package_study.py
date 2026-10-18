from pathlib import Path
import subprocess, hashlib, json, zipfile, argparse, re

ROOT = Path(__file__).resolve().parents[3]
PUBLICATION = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description='Rebuild a canonical review bundle from an explicit Git baseline after evidence is frozen.')
parser.add_argument('--baseline', required=True, help='Existing Git commit/ref to compare with the current working tree.')
parser.add_argument('--check', action='store_true', help='Check source selection and reverse patch application without writing artifacts or reading execution logs.')
args = parser.parse_args()
OUT = PUBLICATION / 'exports' / 'rebuilt'
EVIDENCE = ROOT / 'docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14'
CODE_ROOTS = ('server/', 'client/', 'shared/', 'scripts/', 'migrations/', 'tests/db/', 'tests/schema-contract/')


def git(*arguments, check=True, input=None):
    return subprocess.run(['git', *arguments], cwd=ROOT, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check)


# Resolve the user-supplied ref once, after an explicit end-of-options marker.
# Every later command receives its exact immutable SHA, never an option-like ref.
resolved = git('rev-parse', '--verify', '--end-of-options', args.baseline + '^{commit}', check=False)
baseline = resolved.stdout.decode().strip()
if resolved.returncode or not re.fullmatch(r'[0-9a-f]{40,64}', baseline):
    parser.error('baseline must resolve to one existing Git commit')


def nul_paths(data):
    return [name.decode('utf-8') for name in data.split(b'\0') if name]


tracked = nul_paths(git('diff', '--no-ext-diff', '--no-textconv', baseline, '--name-only', '-z', '--', *CODE_ROOTS).stdout)
untracked = [name for name in nul_paths(git('ls-files', '--others', '--exclude-standard', '-z').stdout) if name.startswith(CODE_ROOTS)]
changed = sorted(set(tracked + untracked))
deleted = sorted(name for name in tracked if not (ROOT / name).exists())
code_files = sorted(set(changed) - set(deleted))
if not changed:
    parser.error('baseline contains no changed sources in the selected code scope')
tracked_patch = git('diff', '--no-ext-diff', '--no-textconv', baseline, '--binary', '--', *CODE_ROOTS).stdout
patch = tracked_patch
for filename in untracked:
    extra = git('diff', '--no-index', '--no-ext-diff', '--no-textconv', '--binary', '--', '/dev/null', filename, check=False)
    if extra.returncode not in (0, 1):
        raise RuntimeError(extra.stderr.decode())
    patch += extra.stdout
reverse = git('apply', '--reverse', '--check', '-', input=patch, check=False)
if reverse.returncode:
    raise RuntimeError('Read-only patch check failed: ' + reverse.stderr.decode())
if args.check:
    print(json.dumps({'baseline': baseline, 'codeFiles': len(code_files), 'deletedFiles': len(deleted), 'patchBytes': len(patch), 'patchReverseCheck': 'passed', 'writes': False}, indent=2))
    raise SystemExit(0)


def read_repository_file(name):
    path = ROOT / name
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('Bundle input must be a regular repository file: ' + name)
    path.resolve().relative_to(ROOT)
    return path.read_bytes()


# Do not run the artifact-writing mode while tests or execution logs are
# active. Freeze the entire selected file set into private bytes, then verify
# those files are unchanged before replacing any final bundle/manifest.
sources = {name: read_repository_file(name) for name in code_files}
manifest = {
    'branch': git('branch', '--show-current').stdout.decode().strip(),
    'baseline': baseline,
    'head': git('rev-parse', 'HEAD').stdout.decode().strip(),
    'scope': 'Application/operator/migration sources and tests changed from the explicit baseline; current canonical working tree; proof scopes recorded separately.',
    'files': {name: hashlib.sha256(data).hexdigest() for name, data in sources.items()},
    'deletedFiles': deleted,
    'patch': {'filename': 'Concept2Cure-data-room-enhancements.patch', 'sha256': hashlib.sha256(patch).hexdigest()},
    'readOnlyPatchReverseCheck': 'passed',
}
manifest_name = 'docs/evidence/D2-CANONICAL-PUBLICATION/2026-10-14/final-source-manifest.json'
manifest_data = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
repo_files = set(code_files)
for directory in [ROOT/'docs/reports/data-room-research-2026-10-14', ROOT/'docs/evidence/D2-STORAGE-READ-INTEGRITY', ROOT/'docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION', ROOT/'docs/evidence/D2-PROCESSING-RECOVERY-STUDY', ROOT/'docs/evidence/D2-PROCESSING-RECOVERY', ROOT/'docs/evidence/D2-SCIENTIFIC-CATALOG', ROOT/'docs/evidence/D2-ANA-SOURCE-ACCESS', ROOT/'docs/evidence/D2-ANA-DURABLE-RECEIPTS', EVIDENCE, PUBLICATION/'authored-history']:
    repo_files.update(file.relative_to(ROOT).as_posix() for file in directory.rglob('*') if file.is_file() and not file.name.endswith('.tmp'))
repo_files.update(['docs/reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md', 'docs/plans/DATA_ROOM_ENHANCEMENT_DELIVERY_PLAN_2026-10-14.md', 'docs/reports/data-room-catalog-context-probe.mjs', 'EVALIDATOR_INTEGRATION_SPEC.md', 'docs/architecture/PROOF_HIERARCHY.md', 'docs/architecture/DATA_ROOM_SQL_COMPOSITION_REVIEW_2026-10-14.md'])
repo_files.update((PUBLICATION/file).relative_to(ROOT).as_posix() for file in ['README.md', 'external-artifact-manifest.json', 'render_study.py', 'package_study.py'])
repo_files.discard(manifest_name)
for name in sorted(repo_files):
    if name not in sources:
        sources[name] = read_repository_file(name)
artifacts = ['Concept2Cure-bundle-README.md', 'PR-148-targeted-review.md']
for stem in ['Concept2Cure-data-room-study-2026-10-14', 'Concept2Cure-enhancement-delivery-plan-2026-10-14']:
    artifacts.extend(stem + extension for extension in ['.pdf', '.docx', '.md'])
artifact_sources = {}
for name in artifacts:
    path = (OUT/name) if (OUT/name).is_file() else (PUBLICATION/'exports'/name)
    if path.is_symlink() or not path.is_file():
        raise RuntimeError('Missing regular exported artifact: ' + name)
    artifact_sources[name] = (path, path.read_bytes())
for stem, source in [
    ('Concept2Cure-data-room-study-2026-10-14', 'docs/reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md'),
    ('Concept2Cure-enhancement-delivery-plan-2026-10-14', 'docs/plans/DATA_ROOM_ENHANCEMENT_DELIVERY_PLAN_2026-10-14.md'),
]:
    if artifact_sources[stem + '.md'][1] != sources[source]:
        raise RuntimeError('Exported Markdown differs from its repository source; render the study again: ' + stem)
OUT.mkdir(parents=True, exist_ok=True)
bundle_path = OUT/'Concept2Cure-data-room-study-2026-10-14-complete.zip'
temporary = bundle_path.with_suffix('.zip.tmp')
try:
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, (_, data) in sorted(artifact_sources.items()):
            bundle.writestr(name, data)
        bundle.writestr('Concept2Cure-data-room-enhancements.patch', patch)
        for name, data in sorted(sources.items()):
            bundle.writestr('repository/' + name, data)
        bundle.writestr('repository/' + manifest_name, manifest_data)
    with zipfile.ZipFile(temporary) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError('ZIP integrity check failed')
        count = len(bundle.namelist())
    changed_during_packaging = [name for name, data in sources.items() if read_repository_file(name) != data]
    changed_during_packaging.extend(str(path.relative_to(ROOT)) for path, data in artifact_sources.values() if path.read_bytes() != data)
    if changed_during_packaging:
        raise RuntimeError('Bundle inputs changed during packaging; wait for evidence freeze: ' + ', '.join(changed_during_packaging))
    if git('diff', '--no-ext-diff', '--no-textconv', baseline, '--binary', '--', *CODE_ROOTS).stdout != tracked_patch:
        raise RuntimeError('Source diff changed during packaging')
    current_untracked = [name for name in nul_paths(git('ls-files', '--others', '--exclude-standard', '-z').stdout) if name.startswith(CODE_ROOTS)]
    if current_untracked != untracked:
        raise RuntimeError('Untracked source selection changed during packaging')
    (OUT/'Concept2Cure-data-room-enhancements.patch').write_bytes(patch)
    (ROOT/manifest_name).write_bytes(manifest_data)
    temporary.replace(bundle_path)
except BaseException:
    temporary.unlink(missing_ok=True)
    raise
print(json.dumps({'codeFiles': len(code_files), 'deletedFiles': len(deleted), 'bundleFiles': count, 'patchBytes': len(patch), 'bundleBytes': bundle_path.stat().st_size, 'zipIntegrity': 'passed', 'patchReverseCheck': 'passed', 'inputStability': 'passed'}, indent=2))
