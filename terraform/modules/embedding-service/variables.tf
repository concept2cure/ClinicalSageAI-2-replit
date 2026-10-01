variable "name" {
  type        = string
  description = "Name prefix (the stack's cluster name, e.g. c2c-production)."
}

variable "region" {
  type = string
}

variable "cluster_id" {
  type        = string
  description = "The ECS cluster the service runs in (the stack's own)."
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "client_security_group_ids" {
  type        = list(string)
  description = "The only security groups admitted to the serving port: the application tasks'."
  validation {
    condition     = length(var.client_security_group_ids) > 0
    error_message = "Name the security group of the tasks that embed; with none, nothing can reach the service."
  }
}

variable "image" {
  type        = string
  description = "Text Embeddings Inference (CPU), pinned by digest."
  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.image))
    error_message = "image must be pinned by digest (…@sha256:<64 hex>): a tag can be moved under a running deployment."
  }
}

variable "model_id" {
  type    = string
  default = "BAAI/bge-m3"
}

variable "model_revision" {
  type        = string
  default     = null
  description = "The model's Hugging Face commit. Null serves the hub's current main."
  validation {
    condition     = var.model_revision == null || can(regex("^[0-9a-f]{40}$", var.model_revision))
    error_message = "model_revision must be a 40-character commit id: a branch moves, and the stored vectors would then mix two models."
  }
}

variable "port" {
  type    = number
  default = 8080
}

variable "cpu" {
  type = number
}

variable "memory" {
  type = number
}

variable "desired_count" {
  type = number
}

variable "max_client_batch_size" {
  type    = number
  default = 128
}

variable "payload_limit_bytes" {
  type    = number
  default = 16000000
}

variable "log_retention_days" {
  type    = number
  default = 90
}

variable "tags" {
  type    = map(string)
  default = {}
}
