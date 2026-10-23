variable "prefix" {
  type        = string
  description = "Secret name prefix (e.g. c2c/production)"
}

variable "secrets" {
  type = map(object({
    description = string
    value       = string
  }))
  description = "Map of secret name → {description, value}"
  sensitive   = true
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "kms_key_id" {
  type        = string
  description = "Customer-managed KMS key ARN for every secret. Null: the AWS-managed aws/secretsmanager key."
  default     = null
}

variable "recovery_window_in_days" {
  type        = number
  description = "Days a deleted secret can be recovered before it is gone; 0 deletes at once, so the same name can be created again (a re-applied staging)."
  default     = 30
  validation {
    condition     = var.recovery_window_in_days == 0 || (var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30)
    error_message = "Secrets Manager accepts 0, or 7 to 30 days."
  }
}
