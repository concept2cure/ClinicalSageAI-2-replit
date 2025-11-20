{{/*
Expand the name of the chart.
*/}}
{{- define "trialsage-cer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "trialsage-cer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "trialsage-cer.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "trialsage-cer.labels" -}}
helm.sh/chart: {{ include "trialsage-cer.chart" . }}
{{ include "trialsage-cer.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "trialsage-cer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "trialsage-cer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "trialsage-cer.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "trialsage-cer.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Get the namespace for all resources
*/}}
{{- define "trialsage-cer.namespace" -}}
{{- if .Values.namespaceOverride }}
{{- .Values.namespaceOverride }}
{{- else }}
{{- .Release.Namespace }}
{{- end }}
{{- end }}

{{/*
PostgreSQL connection string
*/}}
{{- define "trialsage-cer.postgresql.connectionString" -}}
{{- if and .Values.postgresql.enabled .Values.postgresql.auth .Values.postgresql.auth.username .Values.postgresql.auth.password .Values.postgresql.auth.database }}
{{- $port := "" }}
{{- if .Values.postgresql.primary.service.ports.postgresql }}
{{- $port = .Values.postgresql.primary.service.ports.postgresql }}
{{- else }}
{{- $port = "5432" }}
{{- end }}
{{- $host := printf "%s-postgresql.%s.svc.cluster.local" .Release.Name .Release.Namespace }}
{{- printf "postgresql://%s:%s@%s:%s/%s" .Values.postgresql.auth.username .Values.postgresql.auth.password $host $port .Values.postgresql.auth.database }}
{{- end }}
{{- end }}

{{/*
Redis connection string
*/}}
{{- define "trialsage-cer.redis.connectionString" -}}
{{- if .Values.redis.enabled }}
{{- $redisPort := .Values.redis.master.service.port | default 6379 }}
{{- $redisHost := printf "%s-redis-master.%s.svc.cluster.local" .Release.Name .Release.Namespace }}
{{- printf "redis://%s:%d/0" $redisHost $redisPort }}
{{- end }}
{{- end }}