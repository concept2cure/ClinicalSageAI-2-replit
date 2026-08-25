# services/ — shared TypeScript service modules

TypeScript service modules imported by the Node server (`server/`): `ai/`
(predictive intelligence + detectors), `compliance/`, `documents/`, `proof/`
(21 CFR Part 11 proof system — `server/startup/services.ts` initializes
`proof/database-setup`), `regulatory/` (submission pyramids), `workflow/`.

## Removed: the Python eCTD generator stack (D9, 2026-08-13)

This directory previously also carried a FastAPI + Celery pipeline
(`api.py`, `worker.py`, `celery_app.py`, `ectd_generator.py`,
`secure_runner.py`, `job_store.py`, `services/*.Dockerfile`,
`services/docker-compose.yml`, `services/tests/`). It was deleted because it
was dead from the product's perspective:

- The Node server never imported or spawned it (`startPythonBackend()` was a
  stub that always resolved `null`; it has been removed too).
- It was never deployed — `.github/workflows/deploy-aws.yml` documents that
  the ECS worker path was removed and the Python worker "was never the
  NODE_ENV=production image".
- Its only executions were its own self-referential CI harness
  (`docker-compose.e2e.yml`, `.github/workflows/test_generator.yml`,
  `.github/workflows/debug_celery.yml`), deleted with it.

The ONLY live Node→Python bridge is `workers/artifact-compute/`
(`docx-python-runtime.py` and sibling runtimes), whose Python dependencies
live in the ROOT `requirements.txt`. Other live Python (`server/scripts/`,
`ingestion/`, etc.) is unrelated to the removed stack.
