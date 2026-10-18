# D1: keep the pinned PDF/A validator available without weakening verification

Status: implemented and locally checked; image build, strict validator execution,
production boot/sign-in and hosted qualification remain pending in this phase.
Only `concept2cure-v2` is used. The frozen source inputs and exact artifact
hashes are recorded in [manifest.json](manifest.json).

Published CI run `38522415630`, Production Image Boot job `115722968368`,
failed at the production image's veraPDF download: nine HTTP 404 responses
exhausted the repo1 retry sequence over 255.5 seconds. The job therefore never
reached PostgreSQL provisioning, production boot or sign-in. The bounded,
credential-redacted excerpt is retained; this record does not infer the
underlying edge, origin or egress cause of those HTTP responses.

The existing version and checksum are correct. Both official Central endpoints
currently returned the same 16,038,834-byte released veraPDF 1.30.2 JAR, with
SHA256 `287cc9c9757f99dcff4a2d39b68268245b48103fb6af443162d5a29df2afa332`.
Canonical Central's published checksum sidecar agrees. Official Maven metadata
lists releases 1.30.1, 1.30.2 and 1.30.3; this change preserves the already pinned
1.30.2 bytes. Official Maven documentation identifies
[repo.maven.apache.org as the default Central repository](https://maven.apache.org/guides/introduction/introduction-to-repositories.html).

## Resulting behavior

One shared POSIX shell helper, `scripts/ops/fetch-verapdf.sh`, downloads from
canonical Central first and official repo1 only after transport failure. Each
endpoint retains HTTPS-only redirects, TLS verification, request timeouts and
finite retries. A successful response must match the pinned SHA256 before a
same-directory atomic rename installs the JAR. A corrupt successful response
fails immediately; total unavailability also fails. Existing destination bytes
survive transport or integrity failure. The installed JAR is readable at 0644
by the production application user.

`Dockerfile.optimized` consumes that helper. Version, checksum, launcher and the
entire subsequent production stage are unchanged, including the mandatory
strict real PDF/A positive and negative checks. `.dockerignore` includes the
new helper's COPY source. The two new files are stageable and await the root
agent's index/commit; no claim is made that a clean checkout already contains
this uncommitted increment.

Production Image Boot now runs ten dependency-free Node regression cases before
building both images. Existing provisioning, health/readiness and sign-in steps
remain present. No package, baseline, PDF/A enforcement flag or validator policy
was changed. The deployment guide documents the downloader contract.

## Local evidence

| Check | Actual outcome | Qualification |
|---|---|---|
| Published downloader counterfactual | 9 failures, 1 pass; 0 skips | Same published curl/checksum commands, redirected only into controlled local fixture inputs. Canonical available plus repo1 refusal reproduces the observed inability to obtain the pinned artifact. |
| Shared downloader regression suite | 10/10, 0 skips, 1.24 seconds | Controlled transport responses; real shared shell, SHA256 verification, file cleanup, permissions and rename. This does not independently exercise curl's retry implementation. |
| Actual official download through shared helper | 16,038,834 bytes, exact pinned SHA256, mode 0644 | Real HTTPS request using inherited proxy/CA; the validator was not executed. |
| POSIX shell | dash syntax exit 0; suite executed actual `/bin/sh` helper | BusyBox ash is absent locally and was not executed. The helper uses POSIX syntax and standard utilities. |
| Explicit new Node test lint | 0 errors, 0 warnings | `--no-ignore` inspects the file despite the existing global scripts ignore; no lint policy changed. |
| Existing image document-runtime gate and counterfactuals | gate exit 0; 8/8 Node tests, 0 skips | Existing runtime installation/COPY contract still passes. |
| Existing image runtime-assets gate | exit 1: stale `logs` and `output` classifications | No missing COPY or new-helper finding. That scanner and its classifications were left unchanged and the finding was reported to root. |
| Docker image, strict PDF/A round-trip, boot/sign-in | not executed in this phase | Awaiting root resource coordination and hosted proof for the resulting commit. |

The initial counterfactual run inherited the private workspace umask 077 and
also failed some successful fixture writes on permissions. Its exact log is
retained separately. The controlled curl fixture now models the image's ordinary
umask 022 for new files, while an existing `mktemp` candidate retains 0600 until
the actual helper makes it readable. The final counterfactual above is the
result after that fixture correction; the integrity and admission contract was
not relaxed.

All eleven filed artifacts are byte-exact copies of their recorded originals.
The official JAR remains private, with digest and size filed. No credentials,
raw process environment, browser session, registry configuration or private
client data is included. Earlier sealed image-download evidence was preserved.

These checks qualify the download implementation and local regression behavior.
They do not establish a completed production deployment, a passing hosted image
boot, PDF/A compliance of client exports, clinical validity or agency acceptance.
