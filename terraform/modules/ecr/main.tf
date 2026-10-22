// ECR repositories for C2C container images

resource "aws_ecr_repository" "this" {
  for_each = toset(var.repository_names)

  name                 = "${var.prefix}-${each.value}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(var.tags, { Component = each.value })
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 tagged images"
        selection = {
          tagStatus = "tagged"
          # sha-<12>: every image the deploy pushes or promotes since MR-03
          # Stage 4 (the staging-verified- tag rides on the same image).
          tagPrefixList = ["sha-", "v", "rc-"]
          countType     = "imageCountMoreThan"
          countNumber   = 20
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}

# Another account may read these images (MR-03 Stage 4): production promotes
# the image staging verified, by digest, out of staging's repository. Read only,
# and only for the accounts named. None by default.
resource "aws_ecr_repository_policy" "readers" {
  for_each   = length(var.reader_account_ids) == 0 ? {} : aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PromotionReadsVerifiedImages"
      Effect    = "Allow"
      Principal = { AWS = [for id in var.reader_account_ids : "arn:aws:iam::${id}:root"] }
      Action    = ["ecr:DescribeImages", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    }]
  })
}

