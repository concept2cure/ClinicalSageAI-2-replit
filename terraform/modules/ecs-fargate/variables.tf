variable "cluster_name" {
  type = string
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "api_target_group_arn" {
  type = string
}

# ── Container images ─────────────────────────────────────────────────────────

variable "api_image" {
  type        = string
  description = "Full ECR image URI for the API"
}

variable "worker_image" {
  type        = string
  description = "Full ECR image URI for the Worker"
}

# ── Resource sizing ─────────────────────────────────────────────────────────

variable "api_cpu" {
  type    = number
  default = 1024 # 1 vCPU
}

variable "api_memory" {
  type    = number
  default = 2048 # 2 GB
}

variable "worker_cpu" {
  type    = number
  default = 1024
}

variable "worker_memory" {
  type    = number
  default = 2048
}

variable "api_container_port" {
  type    = number
  default = 5000
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

# ── Secrets ──────────────────────────────────────────────────────────────────

variable "secret_arns" {
  type        = list(string)
  description = "Secrets Manager ARNs the execution role can read"
  default     = ["*"]
}

variable "api_secrets" {
  type = list(object({
    name       = string
    value_from = string
  }))
  description = "Secrets injected into the API container"
  default     = []
}

variable "worker_secrets" {
  type = list(object({
    name       = string
    value_from = string
  }))
  description = "Secrets injected into the Worker container"
  default     = []
}

# ── S3 access ────────────────────────────────────────────────────────────────

variable "s3_bucket_arns" {
  type        = list(string)
  description = "S3 bucket ARNs the task role can access"
  default     = []
}

# ── Logging ──────────────────────────────────────────────────────────────────

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "tags" {
  type    = map(string)
  default = {}
}
