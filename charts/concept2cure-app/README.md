# concept2cure-app Helm chart

Deploys the Concept2Cure.RI application server for private / single-tenant
Kubernetes installs.

> **Status: starter chart — not yet cluster-validated.** It was authored to the
> conventions of `charts/trialsage-cer/` but has not been run through
> `helm lint` / `helm template` / a dry-run install in this environment. Validate
> it against a cluster before production use.

## Prerequisites

- A built application image (`Dockerfile.optimized`) pushed to a registry you
  set in `image.repository`.
- A **pgvector-capable** PostgreSQL reachable from the cluster (RDS PostgreSQL
  15.2+, Cloud SQL, or a `pgvector/pgvector` image). Migration 0005 runs
  `CREATE EXTENSION vector`.
- Optionally Redis (the app degrades gracefully without it).

## Quick start

```sh
helm dependency build charts/concept2cure-app   # only if bundling postgresql/redis
helm lint charts/concept2cure-app
# Supply secrets from your shell env (do not hardcode them):
helm template demo charts/concept2cure-app \
  --set image.repository=YOUR_REGISTRY/clinicalsage-ri \
  --set secret.data.DATABASE_URL="$DATABASE_URL" \
  --set secret.data.JWT_SECRET="$JWT_SECRET" | kubectl apply --dry-run=client -f -
```

## Secrets

Provide secrets either by referencing a pre-synced Secret
(`secret.existingSecret`, recommended) or by setting `secret.data.*` (never
commit real values). Required: `DATABASE_URL`, `JWT_SECRET`. Recommended:
`SESSION_SECRET`, `REFRESH_TOKEN_SECRET`, `REDIS_URL`, and the LLM keys.

## First-run admin

Private installs ship with no demo admin (`SEED_DEMO_USER=false`). After the
pod is ready, create the first admin once via `POST /api/setup/initialize`
(see `NOTES.txt`). The endpoint self-closes after the first user exists.

## Migrations

Set `migrations.enabled=true` and `migrations.command` to your migration
entrypoint to run schema migrations in an init container before the app starts.

## Notable values

| Key | Default | Notes |
|-----|---------|-------|
| `image.repository` | `REPLACE_WITH_IMAGE_REPO` | set this |
| `containerPort` | `5000` | app `PORT` |
| `env.SEED_DEMO_USER` | `false` | no public demo admin |
| `env.SINGLE_TENANT_MODE` | `true` | enterprise tier for the one tenant |
| `env.STRIPE_DISABLED` | `true` | billing off |
| `postgresql.enabled` | `false` | prefer external managed pgvector DB |
| `redis.enabled` | `false` | prefer external Redis |
