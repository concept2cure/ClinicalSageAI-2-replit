# Concept2Cure deployment guide

Use the existing production image and database lifecycle. Earlier instructions here called deleted `deploy.sh`
and described a retired FastAPI/Celery stack; those are not deployment entrypoints.

- **Railway beta:** [assessment and operator sequence](DEPLOYMENT.md), including full topology, cost assumptions,
  AWS custody, verified DB TLS, privileged provisioning and pending hosted acceptance. Evaluation, not deployment.
- **AWS production:** [operations runbook](../operations/DEPLOYMENT.md) and existing
  `.github/workflows/deploy-aws.yml`. Build `Dockerfile.optimized`; provision empty DBs with
  `scripts/db/provision.mjs`, migrate later releases using `scripts/db/deploy-migrate.mjs` in privileged execution.
  The API holds only the nonowner runtime DB credential.
- **Codespaces demo:** existing `.devcontainer/` and `scripts/demo/` bootstrap/cache contracts. The founder
  reports successful real OpenAI drafting; hosting still needs its own credentials, dependencies and acceptance.

The same Node app serves the frontend. Python artifact tools use existing invocation paths in the production
image; do not launch a retired ASGI service. Use `/readyz`, preserve artifact/audit/model gates and record exact
image/source versions.
