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
