// VPC Secure module for Part 11 compliance
// Creates VPC, public/private subnets, NAT gateway, endpoints for S3/KMS, security groups

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(var.tags, { Name = "ros-part11-vpc" })
}

# ── Public subnets (ALB) ────────────────────────────────────────────────────

resource "aws_subnet" "public" {
  count             = length(var.public_subnets)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.public_subnets[count.index]
  availability_zone = element(var.azs, count.index)
  # Nothing here needs an address from the subnet: the internet-facing ALB's
  # nodes are addressed by AWS, the NAT gateway has its own EIP. Anything else
  # launched here by mistake stays unreachable (MR-02 hand-on, Semgrep
  # aws-subnet-has-public-ip-address; tests/public_subnets.tftest.hcl).
  map_public_ip_on_launch = false
  tags                    = merge(var.tags, { Name = "ros-part11-public-${count.index}" })
}

# ── Private subnets (ECS tasks, RDS) ────────────────────────────────────────

resource "aws_subnet" "private" {
  count                   = length(var.private_subnets)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.private_subnets[count.index]
  availability_zone       = element(var.azs, count.index)
  map_public_ip_on_launch = false
  tags                    = merge(var.tags, { Name = "ros-part11-private-${count.index}" })
}

# ── Internet gateway ────────────────────────────────────────────────────────

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "ros-part11-igw" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(var.tags, { Name = "ros-part11-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(var.public_subnets)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── NAT gateway (private subnet egress) ─────────────────────────────────────

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(var.tags, { Name = "ros-part11-nat-eip" })
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = merge(var.tags, { Name = "ros-part11-nat" })
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = merge(var.tags, { Name = "ros-part11-private-rt" })
}

resource "aws_route_table_association" "private" {
  count          = length(var.private_subnets)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# VPC endpoints: private paths to S3 and KMS (D1, 2026-10-01,
# docs/evidence/W2/2026-10-01-vpc-private-paths/). Until then both were declared
# and neither could carry traffic: the S3 gateway endpoint was on no route table,
# and the KMS endpoint admitted nothing and had private DNS off, so Vault bytes,
# evidence and every release signature went out through the NAT gateway.
# tests/private_paths.tftest.hcl holds each of these.

# A gateway endpoint works only through the route tables it is associated with.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = merge(var.tags, { Name = "ros-part11-s3-endpoint" })
}

# Private DNS makes the SDK's ordinary kms.<region>.amazonaws.com resolve to this
# endpoint inside the VPC, so no client configuration changes.
resource "aws_vpc_endpoint" "kms" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.region}.kms"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = true
  tags                = merge(var.tags, { Name = "ros-part11-kms-endpoint" })
}

resource "aws_security_group" "endpoint" {
  name        = "ros-part11-endpoint-sg"
  description = "SG for interface endpoints"
  vpc_id      = aws_vpc.this.id
  ingress {
    description = "HTTPS from inside the VPC to the interface endpoints"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.this.cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }
  tags = var.tags
}

resource "aws_security_group" "rds_part11" {
  name_prefix = "rds-part11-"
  description = "PostgreSQL for regulatory data - 21 CFR Part 11"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "EKS workloads only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_workloads_sg]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
  }

  tags = merge(var.tags, { Part11Control = "NetworkBoundary", ComplianceScope = "ElectronicRecords" })
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "vpc_cidr" {
  value = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "rds_sg_id" {
  value = aws_security_group.rds_part11.id
}

# ── Flow logs (MR-04 Stage 3 step 4; OPS-15, SEC-11, CIS 3.7) ───────────────
#
# Every accepted and rejected connection in the VPC, to a CloudWatch log group
# kept a year and encrypted under its own key. Without it an exfiltration, or a
# scan of the private subnets, leaves nothing to investigate.
# tests/flow_logs.tftest.hcl asserts it.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  flow_log_group     = "/aws/vpc/${var.name}/flow-logs"
  flow_log_group_arn = "arn:${data.aws_partition.current.partition}:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:${local.flow_log_group}"
}

resource "aws_kms_key" "flow_logs" {
  description             = "${var.name}: VPC flow logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministersAndGrantsThroughIam"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogsEncryptsTheFlowLogGroupOnly"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = { ArnEquals = { "kms:EncryptionContext:aws:logs:arn" = local.flow_log_group_arn } }
      },
    ]
  })
  tags = var.tags
}

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = local.flow_log_group
  retention_in_days = var.flow_log_retention_days
  kms_key_id        = aws_kms_key.flow_logs.arn
  tags              = var.tags
}

resource "aws_iam_role" "flow_logs" {
  name = "${var.name}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "deliver-to-the-flow-log-group"
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = [aws_cloudwatch_log_group.flow_logs.arn, "${aws_cloudwatch_log_group.flow_logs.arn}:*"]
    }]
  })
}

resource "aws_flow_log" "this" {
  vpc_id                   = aws_vpc.this.id
  traffic_type             = "ALL"
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn             = aws_iam_role.flow_logs.arn
  max_aggregation_interval = 60
  tags                     = merge(var.tags, { Name = "${var.name}-vpc-flow-log" })
}

# The stack's detective-controls test reads it (terraform/stack/tests/detective_controls.tftest.hcl).
output "flow_log" {
  value = {
    id                = aws_flow_log.this.id
    traffic_type      = aws_flow_log.this.traffic_type
    log_group         = aws_cloudwatch_log_group.flow_logs.name
    retention_in_days = aws_cloudwatch_log_group.flow_logs.retention_in_days
  }
}
