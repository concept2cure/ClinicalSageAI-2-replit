variable "prefix" {
  type        = string
  description = "Prefix for repository names (e.g. c2c-prod)"
}

variable "repository_names" {
  type        = list(string)
  description = "List of image names to create repos for"
  default     = ["api"]
}

variable "reader_account_ids" {
  type        = list(string)
  description = "AWS accounts that may read (never push) these repositories' images: staging names production's, which promotes from it."
  default     = []
  validation {
    condition     = alltrue([for id in var.reader_account_ids : can(regex("^[0-9]{12}$", id))])
    error_message = "reader_account_ids must be 12-digit AWS account IDs."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
