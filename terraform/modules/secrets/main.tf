// AWS Secrets Manager — application secrets for ECS tasks

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets

  name        = "${var.prefix}/${each.key}"
  description = each.value.description

  tags = merge(var.tags, { SecretName = each.key })
}

resource "aws_secretsmanager_secret_version" "this" {
  for_each = var.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value.value
}
