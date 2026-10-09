# D6: repair the Handlebars dependency blocker

The Security Scan in [CI run 37983068656](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068656)
failed the dependency-risk gate in [job 113998152917](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068656/job/113998152917).
This repair upgrades the existing transitive development dependency
`ts-jest@29.4.12 > handlebars@4.7.9` to `handlebars@4.7.10`, within
ts-jest's existing `^4.7.9` range. No production dependency, risk decision,
exception, scanner suppression, UI, or application runtime code is added.

## Exact finding and source verification

`remote-before-audit.json` is the unmodified JSON from GitHub Actions artifact
`npm-audit-lockfile-evidence`, ID `11642540473`, from the failed run. It records
Node `v22.23.3`, npm `10.9.9`, and lockfile SHA-256
`7c0d06115423cbdc307cb6cbf6b2818fdab4af95e817ea11eef0e4a4dbf6d488`.
The unchanged gate rejects that report against the exact pre-change
lockfile/manifest/ledger in `exact-remote-before-gate-replay.txt` (exit 1).

The maintainer published these advisories on 2026-10-05; all affect versions
through 4.7.9 and identify 4.7.10 as patched:

| Advisory | Severity | Defect |
| --- | --- | --- |
| [GHSA-8r5x-fm3f-whwj](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-8r5x-fm3f-whwj) | Critical | Incomplete AST validation can emit injected JavaScript. |
| [GHSA-p8wg-vrv2-v86f](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-p8wg-vrv2-v86f) | Critical | Special own properties can bypass constructor access restrictions. |
| [GHSA-xw65-4hp5-5hc7](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-xw65-4hp5-5hc7) | Moderate | Precompiled template text can close an inline script element. |

The [maintainer's 4.7.10 release](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10)
contains the corresponding fixes. The npm registry independently returned
4.7.10 with integrity
`sha512-P5VJMVM7qgBn6vjXMw8WG9uVI+ncf2pi72j4de4yz5ZULLj2RGqLYaKOYGsgyrViQ0tePOVlN1tDCCXXtFqXKg==`,
matching the updated lock entry. The package's minimist requirement changes
from `^1.2.5` to `^1.2.8`; the already-installed minimist version satisfies it.
No unrelated package entry changed.

## Verification

Executed on Node `v22.23.3` / npm `11.9.0`, honoring the repository's Node 22
engine gate. `npm ci --no-fund` completed successfully (2,421 packages).

| Check | Evidence | Result |
| --- | --- | --- |
| Old package security behavior | `semantics-before-4.7.9.txt` | Three advisory-specific tests fail against the actual 4.7.9 tarball; ordinary rendering passes. |
| Patched behavior and existing gate failure cases | `dependency-risk-self-tests.txt` | All 36 tests pass, including four installed-package Handlebars tests. |
| Dependency chain | `dependency-chain.txt` | `ts-jest@29.4.12 > handlebars@4.7.10`. `npm ls handlebars --omit=dev --all` is empty. |
| ts-jest transformer | `ts-jest-compatibility.txt` | Actual installed transformer compiles typed source to CommonJS successfully. |
| Mechanical ledger reseal | `live-reseal.txt` | Existing three reviewed High/Critical advisory occurrences unchanged; only seal metadata updates. |
| Live lockfile audit | `live-after-audit.json`, `live-after-gate.txt` | Gate passes; Handlebars absent, zero Critical findings. |

The four permanent dependency tests execute through `npm run test:dependency-risk`,
which the existing Security Scan already runs. The AST probe only sets an
in-memory marker, the constructor probe only performs lookup, and the inline
script probe inspects generated text; none executes commands or accesses
external resources. The same test file was replayed against the unpacked
4.7.9 npm tarball for the failure evidence.

Reproduce the compatible dependency installation, reviewed finding-set seal,
live scan, and all regression checks:

```sh
npm ci --no-fund
npm run ci:dependency-risk:reseal
NPM_AUDIT_OUTPUT=dependency-audit-results.json npm run ci:dependency-risk
npm run test:dependency-risk
npm ls ts-jest handlebars --all
npm ls handlebars --omit=dev --all
```

The live scan still reports 76 vulnerability wrappers: 2 Low, 43 Moderate,
31 High, and 0 Critical. Its High wrappers resolve to the existing reviewed
`braces` advisory and two `image-size` advisories. Their dispositions,
evidence, owners and expirations are unchanged. This repair does not claim a
zero-vulnerability platform or clear the overall release. The old CI run
remains failed; a fresh run must verify the pushed implementation.
