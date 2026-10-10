# Fresh remote security and stock TypeScript verification

Both checks below ran after publication against exact implementation
`88fa1606c5b50daf1cb50686d743fe26e041b441`, on `concept2cure-v2`, from a
`push` event, attempt 1. Run metadata and each job's actual checkout log
independently identify that SHA. No result from an earlier commit is used.

| Check | Run and job | Completed result |
|---|---|---|
| Security Scan | [CI 38028595001, job 114144600174](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001/job/114144600174) | Whole job **success**; dependency-risk gate, fail-closed tests, PPTX reachability, Trivy exception self-tests and both Trivy steps succeeded. |
| Ordinary stock TypeScript | [Validate & Audit 38028595017, job 114144600104](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595017/job/114144600104) | Whole job **success**. Actual `tsc --noEmit`: baseline **0**, errors **0**, compiler exit **0**; count matches baseline. |

## Dependency-risk evidence

At 2026-10-10T05:46:41Z, the gate reported PASS with exactly three reviewed
Critical/High advisory occurrences. All three listed occurrences were High:

| Advisory | Package | Recorded decision |
|---|---|---|
| GHSA-VFJ7-8CJW-P6XM | braces | unreachable |
| GHSA-5P2G-FCMC-QVQQ | image-size | unreachable |
| GHSA-W3RX-R6R6-PGPR | image-size | unreachable |

Handlebars is absent from that complete gate occurrence list. Its four
regression probes remain included in the actual **36 passing tests**, with
zero failures, cancellations or skips. The scanner was npm audit 10.9.9
under Node v22.23.3, against lockfile SHA-256
`529a8e5889cf500959484df70c561d27746437aa3a4c7d043cd70a5c551e3961`.
The npm installation summary still reports 76 vulnerability entries
(2 Low, 43 Moderate, 31 High); a passing reviewed-risk gate is not a
zero-vulnerability claim.

The [exact npm audit artifact](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001/artifacts/11660539493)
is ID **11660539493**, 6455 bytes. GitHub reports its ZIP SHA-256 as
`df55289ce8206e72bb8867222f3df9e7658ded7011d182a687998c1dbc3a8214`.
Artifact metadata also binds it to the same implementation SHA.

## Actual scanner coverage limits

The fresh Trivy log reports suppression of development/testing dependencies
and existing ignored/suppressed findings. It also logs a 14 MB secret-scan
file-size warning, unavailable Python site-packages for license detection,
and missing Terraform variable values that can limit evaluation. The size
warning alone does not establish that the file was skipped.

The Helm scanner reports **failed rendering** for `charts/concept2cure-app`
and `charts/trialsage-cer`: declared PostgreSQL and Redis chart dependencies
are absent. The successful config step therefore does not establish that
those Helm charts rendered or were completely evaluated. These limitations
are retained in the raw excerpts rather than inferred away from job success.

## Stock compiler and evidence provenance

The actual compiler log starts at 05:46:40Z with `running tsc --noEmit
(baseline: 0)` and ends at 05:49:45Z with `errors found: 0 (tsc exit 0)` and
the matching-baseline confirmation. This is the ordinary compiler path;
the optional memory-bounded worker mode was not used by this job.

The subsequent ESLint command is `npm run lint || true`. Its step success
is not counted here as an enforced lint gate.

- [Security job metadata and observations](remote-security-job.json)
- [Selected original security log lines](remote-security-scan-excerpts.txt)
- [Stock compiler job metadata and observations](remote-stock-typecheck-job.json)
- [Selected original compiler log lines](remote-stock-typecheck-excerpts.txt)
- [Full decoded-log and committed-excerpt digests](remote-security-typecheck-digests.json)

Excerpt files retain selected original lines in their original order; they
do not reproduce every omitted log line. Full-log digests identify the UTF-8
decoded logs fetched for these exact fresh job IDs, not GitHub's compressed
log archives. The full security log SHA-256 is
`69e5583b80de1b14026ab9dc86a0709c0ed152e11bdfd97fd08f554dff7d59eb`;
the full stock-compiler job log SHA-256 is
`64e89239f880a782a0e8f85b07d9b9db03ae65455cd4d1ab6662c9b9191d6f09`.
Earlier generic temporary log filenames were not used for these digests.

These are scoped successes. They do not establish that broader CI,
Semgrep, all IND content, scientific qualification or overall release
clearance passed. Those conclusions require their own evidence.
