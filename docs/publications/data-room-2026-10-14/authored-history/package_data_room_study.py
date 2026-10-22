from pathlib import Path
import subprocess, hashlib, json, zipfile

ROOT = Path('/workspace/Concept2Cure')
OUT = Path('/workspace/reports')
EVIDENCE = ROOT / 'docs/evidence/D2-ANA-DURABLE-RECEIPTS/2026-10-14'
CODE_ROOTS = ('server/', 'client/', 'shared/', 'scripts/', 'migrations/', 'tests/db/', 'tests/schema-contract/')
def git(*args, check=True):
    return subprocess.run(['git', *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check)
tracked = git('diff', '--name-only', '--', *CODE_ROOTS).stdout.decode().splitlines()
untracked = [p for p in git('ls-files', '--others', '--exclude-standard').stdout.decode().splitlines() if p.startswith(CODE_ROOTS)]
code_files = sorted(set(tracked + untracked))
patch = git('diff', '--binary', '--', *CODE_ROOTS).stdout
for filename in untracked:
    extra = git('diff', '--no-index', '--binary', '--', '/dev/null', filename, check=False)
    if extra.returncode not in (0, 1):
        raise RuntimeError(extra.stderr.decode())
    patch += extra.stdout
patch_path = OUT / 'Concept2Cure-data-room-enhancements.patch'
patch_path.write_bytes(patch)
reverse = git('apply', '--reverse', '--check', str(patch_path), check=False)
if reverse.returncode:
    raise RuntimeError('Read-only patch check failed: ' + reverse.stderr.decode())
manifest = {
    'branch': git('branch', '--show-current').stdout.decode().strip(),
    'baseline': git('rev-parse', 'HEAD').stdout.decode().strip(),
    'scope': 'Changed application/operator sources and tests; local/uncommitted; no full repository qualification.',
    'files': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in code_files},
    'patch': {'filename': patch_path.name, 'sha256': hashlib.sha256(patch).hexdigest()},
    'readOnlyPatchReverseCheck': 'passed',
}
(EVIDENCE/'final-source-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
repo_files = set(code_files)
for directory in [ROOT/'docs/reports/data-room-research-2026-10-14', ROOT/'docs/evidence/D2-STORAGE-READ-INTEGRITY', ROOT/'docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION', ROOT/'docs/evidence/D2-PROCESSING-RECOVERY-STUDY', ROOT/'docs/evidence/D2-PROCESSING-RECOVERY', ROOT/'docs/evidence/D2-SCIENTIFIC-CATALOG', ROOT/'docs/evidence/D2-ANA-SOURCE-ACCESS', ROOT/'docs/evidence/D2-ANA-DURABLE-RECEIPTS']:
    for file in directory.rglob('*'):
        if file.is_file():
            repo_files.add(file.relative_to(ROOT).as_posix())
repo_files.update(['docs/reports/DATA_ROOM_AI_MOAT_STUDY_2026-10-14.md', 'docs/plans/DATA_ROOM_ENHANCEMENT_DELIVERY_PLAN_2026-10-14.md', 'docs/reports/data-room-catalog-context-probe.mjs', 'EVALIDATOR_INTEGRATION_SPEC.md', 'docs/architecture/PROOF_HIERARCHY.md'])
artifacts = ['Concept2Cure-bundle-README.md','PR-148-targeted-review.md',patch_path.name]
for stem in ['Concept2Cure-data-room-study-2026-10-14', 'Concept2Cure-enhancement-delivery-plan-2026-10-14']:
    artifacts.extend(stem+extension for extension in ['.pdf','.docx','.md'])
bundle_path = OUT/'Concept2Cure-data-room-study-2026-10-14-complete.zip'
with zipfile.ZipFile(bundle_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for name in artifacts:
        bundle.write(OUT/name, name)
    for name in sorted(repo_files):
        bundle.write(ROOT/name, 'repository/'+name)
with zipfile.ZipFile(bundle_path) as bundle:
    assert bundle.testzip() is None
    count = len(bundle.namelist())
print(json.dumps({'codeFiles':len(code_files),'bundleFiles':count,'patchBytes':len(patch),'bundleBytes':bundle_path.stat().st_size,'zipIntegrity':'passed','patchReverseCheck':'passed'},indent=2))
