# Local scanner proof

The final candidate scan completed at **2026-10-10T06:11:46.576059+00:00** using temporary Semgrep CLI/core **1.177.0** and both complete, unchanged official registry packs. This is a check of the eight named final changed files; the future exact-commit GitHub run remains the authoritative whole-branch gate.

| Control | Targets scanned | Applicable rules run | Findings | Errors | Exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Base `2c9a4a5f` source fixtures | 7 | 210 | 7 | 0 | 1 |
| Final actual changed files | 8 | 210 | 0 | 0 | 0 |

The local scanner loaded the full packs (its log reports 1,075 Code rules), then applied the relevant JS/TS rules to these targets. No finding was filtered from the raw result. All eight source hashes and both config hashes remained unchanged during the final scan.

## Source and rule binding

`local-semgrep-red-metadata.json` records the exact seven base-commit blobs, SHA256 values, original command and exit. Each base blob equals its `88fa1606` blob from fresh failed GitHub Semgrep run `38028595000`, job `114144600069`. The local red independently reproduces all seven exact rule/path/line findings from that run. These are ordinary temporary read-only source fixtures; no branch, worktree or second repository was created.

`local-semgrep-green-metadata.json` binds the final eight real files by Git blob and SHA256. Its package fixture blob is `cbaeb73eacee11ed0a8feab7647a534b3d50ae64`, after the per-case private output-directory refinement. The earlier zero-finding scan is retained as `local-semgrep-intermediate-green.*` and explicitly does not bind the final candidate.

`local-scanner-tooling.json` records the CLI/core version, binary hash, temporary environment versions, unchanged workflow hash and pinned image declaration. The workflow container itself was not run locally. Both actual blocker rules in the registry exactly match every execution field in official Semgrep rules commit `9bbf021d0acffa3095fcffd17b2bc7787eb4796d`; only rule IDs and metadata enrichment differ. The exact official source YAML files are included and hashed in that record.

| Complete official pack | Original byte SHA256 | Lossless archived response |
| --- | --- | --- |
| `https://semgrep.dev/c/p/default` | `a0eb4b83d2d9adc52492caaf12b458498b8845e66aea6730e4d5b0d76330313d` | `registry-p-default.yaml.gz` |
| `https://semgrep.dev/c/p/ci` | `5af630531431137f01a1db909594a36876e02b2c78d361f2b6ab1c097ca4f148` | `registry-p-ci.yaml.gz` |

The archives preserve the full downloaded response bytes, with deterministic gzip mtime=0. The two official source YAML files were used for rule-source comparison; scanning used both complete registry responses.

## Commands and raw evidence

Both controls used `semgrep scan` with the two full local config snapshots, `--metrics=off --disable-version-check --error --no-rewrite-rule-ids`, plus the explicitly listed targets. There was no baseline comparison, additional ignore, `nosemgrep` addition, or edited rule pattern. `--no-rewrite-rule-ids` preserves official identifiers for exact pairing and does not change matching. The metadata files record the complete argument arrays and source/config pins.

The original combined scanner output and original JSON results are saved as `local-semgrep-red.txt` / `.json` and `local-semgrep-green.txt` / `.json`. Their SHA256 values are in their metadata. Raw red contains every finding; raw final green reports zero findings and zero errors with all eight paths scanned.

To reproduce, run from this checkout's root after installing the same temporary CLI:

```sh
uv venv /tmp/c2c-semgrep-1.177.0
uv pip install --python /tmp/c2c-semgrep-1.177.0/bin/python 'semgrep==1.177.0'
```

The following restores the exact archived packs, extracts the base source fixtures without a checkout change, verifies source hashes, and runs the recorded commands with temporary result destinations:

```python
import gzip, hashlib, json, pathlib, subprocess, tempfile
repo = pathlib.Path.cwd()
evidence = repo / 'docs/evidence/D9/2026-10-10-semgrep-blocker-repair'
tooling = json.loads((evidence / 'local-scanner-tooling.json').read_text())
for config in tooling['configs']:
    data = gzip.decompress((evidence / config['archive_file']).read_bytes())
    assert hashlib.sha256(data).hexdigest() == config['sha256']
    dest = pathlib.Path(config['temporary_original_path'])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
red = json.loads((evidence / 'local-semgrep-red-metadata.json').read_text())
green = json.loads((evidence / 'local-semgrep-green-metadata.json').read_text())
fixture = pathlib.Path(tempfile.mkdtemp(prefix='c2c-semgrep-red-'))
for source in red['source_manifest']['sources']:
    data = subprocess.check_output(['git', 'show',
        red['source_manifest']['base_commit'] + ':' + source['path']])
    assert hashlib.sha256(data).hexdigest() == source['sha256']
    dest = fixture / source['path']
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
for source in green['sources']:
    assert hashlib.sha256((repo / source['path']).read_bytes()).hexdigest() == source['sha256']
for label, meta, cwd, expected_count in [('red', red, fixture, 7), ('green', green, repo, 0)]:
    result = pathlib.Path(tempfile.mkstemp(prefix='c2c-semgrep-' + label + '-', suffix='.json')[1])
    args = [('--json-output=' + str(result)) if arg.startswith('--json-output=') else arg
            for arg in meta['command']]
    process = subprocess.run(args, cwd=cwd)
    output = json.loads(result.read_text())
    assert process.returncode == meta['exit_code']
    assert len(output['results']) == expected_count and output['errors'] == []
```

This proves the named scanner blockers were removed locally under the recorded complete configs. It does not clear broader CI, scientific source qualification, initial-IND applicability, live-model behavior, or the overall release. No source, dependency manifest, workflow, or security baseline was modified by the scanner-evidence work.
