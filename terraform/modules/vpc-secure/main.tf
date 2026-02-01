// Minimal VPC Secure module for Part 11 staging
// Creates a VPC, private subnets, endpoints for S3/KMS, and a restricted RDS security group

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags = merge(var.tags, { Name = "ros-part11-vpc" })
}

resource "aws_subnet" "private" {
  count                   = length(var.private_subnets)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.private_subnets[count.index]
  availability_zone       = element(var.azs, count.index)
  map_public_ip_on_launch = false
  tags = merge(var.tags, { Name = "ros-part11-private-${count.index}" })
}

# VPC Endpoints - S3 and KMS (interface endpoints for KMS)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.this.id
  service_name = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
}

resource "aws_vpc_endpoint" "kms" {
  vpc_id       = aws_vpc.this.id
  service_name = "com.amazonaws.${var.region}.kms"
  vpc_endpoint_type = "Interface"
  subnet_ids = aws_subnet.private[*].id
  security_group_ids = [aws_security_group.endpoint.id]
}

resource "aws_security_group" "endpoint" {
  name        = "ros-part11-endpoint-sg"
  description = "SG for interface endpoints"
  vpc_id      = aws_vpc.this.id
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

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "rds_sg_id" {
  value = aws_security_group.rds_part11.id
}