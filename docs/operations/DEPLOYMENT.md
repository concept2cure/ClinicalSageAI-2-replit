# Deployment

> **Canonical path (2026-09-20).** The production deployment is the AWS/ECS
> pipeline in `.github/workflows/deploy-aws.yml` building `Dockerfile.optimized`,
> with the database provisioned by `node scripts/db/provision.mjs` and migrated
> on every deploy by `scripts/db/deploy-migrate.mjs`. The Helm/Kubernetes
> section further down describes a `trialsage/trialsage-cer` chart that is
> **not in this repository**; it is retained as history, not as instructions.

## 1. Database: one command from empty to `/readyz` `schema: ok`

```bash
DATABASE_OWNER_URL='postgresql://<owner>@<host>/<db>' \
APP_DATABASE_URL='postgresql://app_service:<pw>@<host>/<db>' \
APP_SERVICE_DB_PASSWORD='<pw>' \
node scripts/db/provision.mjs        # npm run db:provision
```

Runs install-fresh then deploy-migrate as the OWNER, mints the non-superuser
`app_service` role (or, without `APP_SERVICE_DB_PASSWORD`, grants an existing
runtime role named by `APP_DATABASE_URL` / `RUNTIME_DB_ROLE` — it is never left
ungranted, 2026-09-21 IQ-DEV-001), and verifies the `/readyz` schema contract
**as the app role**, including the grant audit over every application relation
(reachable, and append-only on the audit store). Refuses — before the first write — when pgvector is not available on
the server (exit 4, names the apt package), when the owner cannot CREATE ROLE /
CREATE EXTENSION (exit 5), or when the two URLs name different databases
(exit 2). Full contract, exit codes, roles and proof:
`docs/operations/DB_READINESS.md`. Every later deploy runs deploy-migrate only
— as the owner (`DATABASE_OWNER_URL`, else `DATABASE_URL`); it refreshes the
runtime role's grants and refuses to report success while the role cannot reach
a table or holds more than append-only on `audit.tamper_proof_log`.
`node scripts/db/audit-runtime-grants.mjs` re-checks that at any time.

Runs from a repository checkout (install-fresh needs `drizzle-kit`, a
devDependency the image prunes). In AWS that is the one-off provisioning task;
the recurring `migrate` job runs from the image.

## 2. Image: `Dockerfile.optimized`

`docker build -f Dockerfile.optimized .` — the same command deploy-aws.yml
runs. Since 2026-09-20 the production stage also carries the toolchain the
eCTD pipeline shells out to (runbook blocker B15):

| Binary | Provided by | Called from |
|---|---|---|
| `gs` | `ghostscript` (apt) | `server/services/ectd/pdfa-pipeline.ts` — PDF/A-1b conversion |
| `verapdf` | `/usr/local/bin/verapdf` → `java -jar /opt/verapdf/verapdf-cli.jar`; **org.verapdf.apps:cli:1.30.2** from Maven Central, sha256-pinned (`ARG VERAPDF_SHA256`) to the checksum the veraPDF Consortium publishes beside the artifact; `default-jre-headless` (apt) | `pdfa-pipeline.ts` validation; `scripts/ops/pilot-go-no-go.mjs` gate 7 |
| `xmllint` | `libxml2-utils` (apt) | `server/services/ectd/xml-validator.ts` |

The build then **runs** `scripts/ops/check-pdfa-toolchain.sh`: version probes
for all three, then a real render → Ghostscript PDF/A-1b (with an sRGB
OutputIntent) → veraPDF `PASS`, and a `FAIL` on the unconverted source so a
validator that passes everything cannot pass. An image that cannot do this is
not built. Run the same script on any host before setting
`ECTD_REQUIRE_PDFA=true` (B20: flag after artifact).

**Known product defect the check reports (not a toolchain gap):** the argument
list in `pdfa-pipeline.ts convertToPdfA1bWithGhostscript` carries no
OutputIntent, so its output fails PDF/A-1b clause 6.2.3.3 in veraPDF while the
packager records `converted: true`. The check prints a ⚠ for it on every run and
fails under `PDFA_CHECK_STRICT_PIPELINE_ARGS=1`; fix the argument list (add the
sRGB OutputIntent prelude the check itself uses) and flip strict mode on.

To bump veraPDF: change `VERAPDF_VERSION` and `VERAPDF_SHA256` together (the
sidecar is `…/cli/<version>/cli-<version>.jar.sha256` on Maven Central).

## 3. AI content-safety posture in production (B19 / B20)

Both gates default **strict** in production: `AI_PII_ENFORCEMENT` unset →
`block`; `AI_GROUNDEDNESS_ENFORCE` unset → enforced. An explicit permissive
value is handled like `AUDIT_SEAL_ACCEPT_UNSEALED` / `RLS_ENFORCE`, in this
order (`server/startup/ai-governance-posture.ts`, fired on import from
`server/config/environment.ts`):

1. `NODE_ENV != production` — nothing enforced, nothing warned (unchanged).
2. Both gates strict (by value or by default) — boots silently.
3. `AI_GOVERNANCE_REQUIRE_ENFORCE=true` — refuses to boot on any permissive
   gate, even with the acceptance set.
4. `AI_GOVERNANCE_ACCEPT_PERMISSIVE=true` — boots; one structured warning per
   boot naming the accepted risk.
5. Otherwise — **refuses to boot**, naming the gate and both exits.

Operator sequence: set a gate strict in the same change window as the artifact
it depends on; set `REQUIRE` only once both are strict; set `ACCEPT` only as a
dated, reviewed decision and clear it when the gate goes strict. As defence in
depth, `pii-screen.ts` resolves an unaccepted production permissive value to
`block` even if the boot gate did not fire.

## 4. Boot posture the image refuses without (unchanged, for reference)

`RLS_ENFORCE=on` on a non-superuser `APP_DATABASE_URL`; `JWT_SECRET`,
`REFRESH_TOKEN_SECRET`, `MFA_ENCRYPTION_KEY`, `AUDIT_HMAC_SECRET` (≥32 chars);
`AUDIT_HMAC_KEY` or `AUDIT_SEAL_ACCEPT_UNSEALED=true`;
`AI_SENSITIVE_DATA_POLICY_MODE=enforce` with a non-empty
`AI_PROVIDER_PLACEMENT_APPROVALS`. `/readyz` requires `database`, `schema`,
`ana` (an AI provider key, or deterministic mode) and, when Redis is
configured, `redis` and `worker`. See `.env.example`.

---

# TrialSage CER Generator Deployment Guide (legacy — Helm chart not in this repository)

This guide provides step-by-step instructions for deploying the TrialSage CER Generator system in various environments using Kubernetes and Helm.

## Architecture Overview

The TrialSage CER Generator consists of several components:

1. **API Server**: Handles HTTP requests, manages authentication, and coordinates job processing
2. **Worker**: Processes PDF generation jobs and interacts with OpenAI for document intelligence
3. **PostgreSQL Database**: Stores user data, job states, and system configuration
4. **Redis**: Provides queue functionality for job management with Bull
5. **Storage**: Persistent volume for storing generated PDF documents

## Prerequisites

- Kubernetes cluster (v1.19+)
- Helm (v3.2+)
- `kubectl` configured to communicate with your cluster
- Docker registry access (for custom image builds)
- Required secrets:
  - Database credentials
  - JWT secret
  - OpenAI API key (if using AI features)
  - AWS credentials (if using S3 storage)

## Deployment Options

### Option 1: Quick Start with Default Configuration

```bash
# Add the TrialSage Helm repository
helm repo add trialsage https://charts.trialsage.com
helm repo update

# Install with bundled PostgreSQL and Redis (for development/testing)
helm install cer trialsage/trialsage-cer \
  --set postgresql.enabled=true \
  --set postgresql.auth.password=strongpassword \
  --set redis.enabled=true
```

### Option 2: Production Deployment with External Dependencies

```bash
# Create namespace
kubectl create namespace trialsage-cer

# Create secrets
kubectl create secret generic cer-secrets \
  --namespace trialsage-cer \
  --from-literal=jwt_secret=your-jwt-secret \
  --from-literal=database_url=postgresql://user:pass@host:port/db \
  --from-literal=redis_url=redis://host:port/0 \
  --from-literal=openai_api_key=your-openai-key

# Install the Helm chart
helm install cer trialsage/trialsage-cer \
  --namespace trialsage-cer \
  --set postgresql.enabled=false \
  --set redis.enabled=false \
  --set secrets.create=false \
  --set api.replicaCount=3 \
  --set worker.replicaCount=5 \
  --set storage.persistentVolume.size=50Gi \
  --set api.ingress.enabled=true \
  --set api.ingress.hosts[0].host=cer.trialsage.com \
  --set api.ingress.hosts[0].paths[0].path=/
```

### Option 3: Custom Values File Deployment

Create a values file (e.g., `production-values.yaml`):

```yaml
# PostgreSQL and Redis are externally managed
postgresql:
  enabled: false
redis:
  enabled: false

# Don't create secrets (using existing ones)
secrets:
  create: false

# API Server configuration
api:
  replicaCount: 3
  autoscaling:
    minReplicas: 3
    maxReplicas: 10
  resources:
    limits:
      cpu: 2000m
      memory: 2Gi
    requests:
      cpu: 500m
      memory: 1Gi
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: nginx
      cert-manager.io/cluster-issuer: letsencrypt-prod
    hosts:
      - host: cer.trialsage.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: cer-tls
        hosts:
          - cer.trialsage.com

# Worker configuration
worker:
  replicaCount: 5
  autoscaling:
    minReplicas: 5
    maxReplicas: 20
  resources:
    limits:
      cpu: 4000m
      memory: 4Gi
    requests:
      cpu: 1000m
      memory: 2Gi

# Storage configuration
storage:
  persistentVolume:
    size: 50Gi
    storageClass: 'standard'
```

Then deploy:

```bash
helm install cer trialsage/trialsage-cer \
  --namespace trialsage-cer \
  --values production-values.yaml
```

## Environment-specific Configurations

### Development

For development environments, we recommend:

- Single replicas for API and Worker
- Bundled PostgreSQL and Redis
- Disabling autoscaling
- Smaller resource requests/limits
- Enabling debugging logs

```bash
helm install cer-dev trialsage/trialsage-cer \
  --set postgresql.enabled=true \
  --set postgresql.auth.password=devpassword \
  --set redis.enabled=true \
  --set api.replicaCount=1 \
  --set api.autoscaling.enabled=false \
  --set worker.replicaCount=1 \
  --set worker.autoscaling.enabled=false \
  --set configMaps.app.data.LOG_LEVEL=debug
```

### Staging

For staging environments, we recommend:

- Moderate replica counts
- Testing with external dependencies
- Resource limits closer to production
- Realistic data volumes

### Production

For production environments, we recommend:

- Multiple replicas for high availability
- Properly sized persistent storage
- External dependencies with proper backups
- Ingress with TLS
- Monitoring enabled
- Appropriate resource requests/limits

## Scaling Considerations

The CER Generator is designed to scale horizontally. Consider these factors:

1. **Worker Concurrency**: Each worker pod can handle multiple concurrent PDF generation jobs. Adjust `worker.env.CONCURRENCY` based on pod resources.
2. **Memory Usage**: PDF generation can be memory-intensive. Ensure worker pods have sufficient memory.
3. **CPU Allocation**: When using AI features, both API and workers need adequate CPU resources.
4. **Database Connections**: Adjust PostgreSQL connection pools as you scale API and worker instances.
5. **Storage Capacity**: Ensure persistent volume has sufficient capacity for PDF files.

## Monitoring and Metrics

The Helm chart includes ServiceMonitor resources for Prometheus integration. Important metrics to monitor:

- Job queue length
- Job processing time
- PDF rendering failures
- API response times
- Memory and CPU usage

## Troubleshooting

### Common Issues

1. **Worker Pods Crashing**

   - Check memory limits - PDF rendering can consume significant memory
   - Verify Puppeteer configuration
   - Ensure all required fonts are installed

2. **Job Queue Backing Up**

   - Increase worker replica count
   - Increase worker concurrency
   - Check for slow database queries

3. **Database Connection Issues**

   - Verify connection string in secrets
   - Check PostgreSQL resource usage
   - Ensure connection pool is properly sized

4. **Authentication Failures**
   - Verify JWT secret is consistent
   - Check token expiration configuration

## Security Considerations

1. **Secrets Management**: Use Kubernetes secrets or external secret management solutions.
2. **Network Policies**: Implement Kubernetes network policies to restrict pod-to-pod communication.
3. **RBAC**: The chart includes RBAC resources for proper service account permissions.
4. **Ingress Security**: Configure TLS and consider web application firewall (WAF) protection.
5. **Pod Security**: Review pod security context settings as needed for your environment.

## Backup and Recovery

1. **Database Backups**: Implement regular PostgreSQL backups.
2. **PDF Storage**: Backup persistent volumes or use S3 with appropriate backup policies.
3. **Configuration Backups**: Maintain version control for Helm values files.

## Upgrade Procedure

When upgrading the CER Generator, follow these steps:

1. Review the release notes for breaking changes
2. Update Helm values file with new configurations
3. Perform a dry-run upgrade:
   ```bash
   helm upgrade --dry-run cer trialsage/trialsage-cer \
     --namespace trialsage-cer \
     --values production-values.yaml
   ```
4. Apply the upgrade:
   ```bash
   helm upgrade cer trialsage/trialsage-cer \
     --namespace trialsage-cer \
     --values production-values.yaml
   ```
5. Monitor logs and metrics during and after the upgrade

## Conclusion

This deployment guide provides the foundation for deploying the TrialSage CER Generator in various environments. Adjust configurations based on your specific requirements and infrastructure.
