# TrialSage CER Generator Deployment Guide

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
