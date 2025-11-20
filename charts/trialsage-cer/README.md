# TrialSage CER Helm Chart

This Helm chart deploys the TrialSage Clinical Evaluation Report (CER) generation system on Kubernetes.

## Introduction

The TrialSage CER system is a comprehensive solution for generating Clinical Evaluation Reports with AI-powered document intelligence. It consists of two main components:

- **API Server**: Handles HTTP requests, manages user authentication, and coordinates job processing
- **Worker**: Processes CER generation jobs, including PDF rendering and data analysis

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)
- PostgreSQL database (can be deployed as a dependency)
- Redis (can be deployed as a dependency)

## Installing the Chart

1. Add the TrialSage Helm repository:

```bash
helm repo add trialsage https://charts.trialsage.com
helm repo update
```

2. Install the chart:

```bash
# Basic installation
helm install cer trialsage/trialsage-cer

# Installation with custom values
helm install cer trialsage/trialsage-cer -f values.yaml
```

## Configuration

### Global Parameters

| Name                | Description              | Value |
| ------------------- | ------------------------ | ----- |
| `nameOverride`      | Override chart name      | `""`  |
| `fullnameOverride`  | Override full chart name | `""`  |
| `namespaceOverride` | Override namespace       | `""`  |

### API Server Parameters

| Name                          | Description                   | Value               |
| ----------------------------- | ----------------------------- | ------------------- |
| `api.enabled`                 | Enable API server             | `true`              |
| `api.replicaCount`            | Number of API replicas        | `1`                 |
| `api.image.repository`        | API image repository          | `trialsage/cer-api` |
| `api.image.tag`               | API image tag                 | `latest`            |
| `api.image.pullPolicy`        | API image pull policy         | `IfNotPresent`      |
| `api.service.type`            | API service type              | `ClusterIP`         |
| `api.service.port`            | API service port              | `80`                |
| `api.service.metricsPort`     | API metrics port              | `9090`              |
| `api.ingress.enabled`         | Enable API ingress            | `false`             |
| `api.resources`               | API resource requests/limits  | See values.yaml     |
| `api.autoscaling.enabled`     | Enable API autoscaling        | `true`              |
| `api.autoscaling.minReplicas` | Minimum API replicas          | `1`                 |
| `api.autoscaling.maxReplicas` | Maximum API replicas          | `5`                 |
| `api.env`                     | Environment variables for API | See values.yaml     |

### Worker Parameters

| Name                             | Description                      | Value                  |
| -------------------------------- | -------------------------------- | ---------------------- |
| `worker.enabled`                 | Enable worker                    | `true`                 |
| `worker.replicaCount`            | Number of worker replicas        | `1`                    |
| `worker.image.repository`        | Worker image repository          | `trialsage/cer-worker` |
| `worker.image.tag`               | Worker image tag                 | `latest`               |
| `worker.image.pullPolicy`        | Worker image pull policy         | `IfNotPresent`         |
| `worker.service.type`            | Worker service type              | `ClusterIP`            |
| `worker.service.port`            | Worker service port              | `80`                   |
| `worker.service.metricsPort`     | Worker metrics port              | `9090`                 |
| `worker.resources`               | Worker resource requests/limits  | See values.yaml        |
| `worker.autoscaling.enabled`     | Enable worker autoscaling        | `true`                 |
| `worker.autoscaling.minReplicas` | Minimum worker replicas          | `1`                    |
| `worker.autoscaling.maxReplicas` | Maximum worker replicas          | `10`                   |
| `worker.env`                     | Environment variables for worker | See values.yaml        |

### Storage Configuration

| Name                                    | Description               | Value  |
| --------------------------------------- | ------------------------- | ------ |
| `storage.enabled`                       | Enable persistent storage | `true` |
| `storage.persistentVolume.enabled`      | Enable persistent volume  | `true` |
| `storage.persistentVolume.size`         | Persistent volume size    | `10Gi` |
| `storage.persistentVolume.storageClass` | Storage class name        | `""`   |

### Security Parameters

| Name                    | Description                                 | Value  |
| ----------------------- | ------------------------------------------- | ------ |
| `serviceAccount.create` | Create service account                      | `true` |
| `serviceAccount.name`   | Service account name                        | `""`   |
| `rbac.create`           | Create RBAC resources                       | `true` |
| `secrets.create`        | Create secrets                              | `true` |
| `secrets.stringData`    | Secret values (see values.yaml for details) | `{}`   |

### Monitoring Parameters

| Name                                 | Description             | Value           |
| ------------------------------------ | ----------------------- | --------------- |
| `monitoring.enabled`                 | Enable monitoring       | `true`          |
| `monitoring.serviceMonitor.enabled`  | Enable ServiceMonitor   | `true`          |
| `monitoring.serviceMonitor.selector` | ServiceMonitor selector | See values.yaml |

### Database Configuration

| Name                       | Description         | Value       |
| -------------------------- | ------------------- | ----------- |
| `postgresql.enabled`       | Deploy PostgreSQL   | `false`     |
| `postgresql.auth.username` | PostgreSQL username | `trialsage` |
| `postgresql.auth.password` | PostgreSQL password | `""`        |
| `postgresql.auth.database` | PostgreSQL database | `cer`       |

### Redis Configuration

| Name            | Description  | Value   |
| --------------- | ------------ | ------- |
| `redis.enabled` | Deploy Redis | `false` |

## External Dependencies

This chart can either deploy its dependencies (PostgreSQL, Redis) or connect to existing services:

### Using External PostgreSQL

Set `postgresql.enabled=false` and provide the connection string in `secrets.stringData.database_url`.

### Using External Redis

Set `redis.enabled=false` and provide the connection string in `secrets.stringData.redis_url`.

## Common Configurations

### Production Deployment

```yaml
# values-production.yaml
api:
  replicaCount: 2
  resources:
    limits:
      cpu: 2000m
      memory: 2Gi
    requests:
      cpu: 500m
      memory: 1Gi
  autoscaling:
    minReplicas: 2
    maxReplicas: 10

worker:
  replicaCount: 3
  resources:
    limits:
      cpu: 4000m
      memory: 4Gi
    requests:
      cpu: 1000m
      memory: 2Gi
  autoscaling:
    minReplicas: 3
    maxReplicas: 20

storage:
  persistentVolume:
    size: 50Gi

monitoring:
  enabled: true

# Deploy dependencies
postgresql:
  enabled: true
  auth:
    password: 'your-secure-password'

redis:
  enabled: true
```

### Development/Testing

```yaml
# values-dev.yaml
api:
  replicaCount: 1
  autoscaling:
    enabled: false

worker:
  replicaCount: 1
  autoscaling:
    enabled: false

storage:
  persistentVolume:
    size: 5Gi

monitoring:
  enabled: false

# Deploy dependencies
postgresql:
  enabled: true

redis:
  enabled: true
```

## Upgrading

### From 1.0.0 to 2.0.0

- The minimum supported Kubernetes version is now 1.19+
- The API service structure has changed; update ingress rules if necessary
- Worker now requires explicit service account permissions

## Uninstalling the Chart

```bash
helm uninstall cer
```

> **Note**: This does not delete persistent volume claims, you will need to delete them manually if desired:
>
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=cer
> ```
