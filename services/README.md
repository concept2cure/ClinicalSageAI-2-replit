# services/ — Python eCTD generator (E2E / staging only)

This directory is a FastAPI + Celery pipeline (`api.py`, `worker.py`,
`celery_app.py`, `ectd_generator.py`, `secure_runner.py`) used to generate
DOCX/eCTD artifacts inside containers.

**It is not part of the production Node application.** It is built and run
only by:

- `docker-compose.e2e.yml` (E2E test stack: `services/api.Dockerfile`,
  `services/worker.Dockerfile`)
- `.github/workflows/test_generator.yml` (CI: `pytest services/tests/`)
- `docker-compose.staging.yml` (staging stack)

The main server (`server/index.ts`) does not import or spawn anything from
this directory. If you wire it into production, document the dependency in
the deployment manifests and remove this notice.
