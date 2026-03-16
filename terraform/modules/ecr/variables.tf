variable "prefix" {
  type        = string
  description = "Prefix for repository names (e.g. c2c-prod)"
}

variable "repository_names" {
  type        = list(string)
  description = "List of image names to create repos for"
  default     = ["api", "worker"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
