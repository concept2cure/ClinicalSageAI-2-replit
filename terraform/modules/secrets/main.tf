// AWS Secrets Manager — application secrets for ECS tasks

# The secret NAMES are not secret, the values are. Terraform refuses a
# sensitive map as a for_each source ("Invalid for_each argument"), so the
# production environment could not be planned at all (found 2026-09-23 by
# `terraform validate`). Iterate the names; read the values by key, where they
# stay sensitive.
locals {
  secret_names = nonsensitive(toset(keys(var.secrets)))
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secret_names

  name        = "${var.prefix}/${each.key}"
  description = nonsensitive(var.secrets[each.key].description)

  tags = merge(var.tags, { SecretName = each.key })
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = local.secret_names

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = var.secrets[each.key].value
}
