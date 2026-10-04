# D1 — the production image can run AnA's document tools

Row **D1** (hosted production). AnA local-safe-AI plan **WS4**, image half ("the
production image can import what the tools import"). Session `…01SuVLo2`, 2026-10-01.

## The defect

`insert_document_content`, `surgical_docx_xml_edit`, `validate_docx` and the DOCX
runtime spawn `python3 workers/artifact-compute/<runtime>.py`
(`server/services/compute/scriptWorker.ts`, `workerClient.ts`). Those runtimes import
`docx` (python-docx) and `lxml`. `Dockerfile.optimized`'s production stage:

- never copied `workers/` — the scripts did not exist in the image;
- never installed python-docx or lxml for them (CI installs both in its own step, with a
  comment saying it pins them "so CI exercises the same runtime AnA uses in prod").

So every test passed and every production call failed.

## The fix

- The production stage creates a virtualenv `/opt/docx-runtime` and installs python-docx
  and lxml at the versions **`requirements.txt` pins** (read from that file, so the image
  and CI cannot drift), then runs an import probe — an image that cannot import them is
  not built. A virtualenv leaves ocrmypdf's apt-installed lxml alone. `python3-venv` is
  added to the apt list; `python3` itself already came with ocrmypdf.
- It copies `workers/artifact-compute` into `/app`, where the spawners resolve it.
- `ENV ANA_DOCX_PYTHON=/opt/docx-runtime/bin/python`; both spawners run that interpreter,
  and plain `python3` where it is unset (dev, CI — unchanged).
- A static gate, `npm run ci:image-document-runtime`
  (`scripts/ci/check-image-document-runtime.mjs`), checks the production stage against the
  spawners, the runtimes' imports and `requirements.txt`. Its self-test
  (`scripts/ci/__tests__/image-document-runtime.test.mjs`, run by CI with every
  `scripts/ci/__tests__` suite) removes each line it depends on from the real files and
  shows the gate failing.

## Red and green

| What | Red | Green |
|---|---|---|
| The gate on the repository | `red/gate-on-repo.txt` at `1a314819`: 12 problems — four runtimes not copied, neither package installed or probed, versions not from requirements.txt, no `ANA_DOCX_PYTHON`, both spawners on plain python3 | `green/gate.txt`: OK; self-test 8 of 8, each mutation of the real Dockerfile, spawners and requirements.txt failing the gate |
| The install step, built | `red/image-import.txt`: in the built image, plain `python3` (what the spawners used) — `ModuleNotFoundError: No module named 'docx'` | `green/image-build.txt` (`green/Dockerfile.green`): the production stage's step verbatim builds; lxml 6.1.1; every runtime's imports resolve under the virtualenv; `red/image-import.txt` second half: the `ANA_DOCX_PYTHON` interpreter imports both |

**Not built here:** the full production image. This sandbox's proxy refuses Debian's apt
mirrors inside a build (403), so `node:22-slim` + LibreOffice + ocrmypdf could not be
installed; the proof uses `python:3.11-slim` (the same Debian Python 3.11 the production
stage's apt `python3` provides) for the step this change adds. The deploy pipeline's
image build runs the import probe for real.

## Not done here

- The non-launch Python callers (`trialsage/*.py` from `analytics-routes.ts`,
  `cer_tasks.py` from `pdf-task-routes.ts`, the trials importer) — same class of gap,
  outside the launch catalog.
- The DOCX runtime that exec()s AnA-authored code (`docx-python-runtime.py`) runs as a
  host subprocess with a scrubbed environment; isolating it is plan WS16 (sandbox
  backends).
