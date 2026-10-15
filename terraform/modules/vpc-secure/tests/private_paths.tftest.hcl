# The VPC's private paths to S3 and KMS carry traffic (D1,
# docs/evidence/W2/2026-10-01-vpc-private-paths/).
#
# Until 2026-10-01 both endpoints were declared and neither could be used:
#   - the S3 gateway endpoint was associated with no route table, so Vault and
#     evidence bytes left through the NAT gateway, billed per GB;
#   - the KMS interface endpoint's security group admitted nothing and private
#     DNS was off, so every release signature also went out through the NAT,
#     while the endpoint itself was billed by the hour.
#
# Offline: the AWS provider is mocked. Run from this module's directory:
#   terraform init -backend=false && terraform test

mock_provider "aws" {}

variables {
  eks_workloads_sg = "sg-0123456789abcdef0"
}

run "s3_traffic_from_the_private_subnets_stays_inside_aws" {
  command = apply

  assert {
    condition     = contains(coalesce(aws_vpc_endpoint.s3.route_table_ids, []), aws_route_table.private.id)
    error_message = "The S3 gateway endpoint must be on the private route table, or Vault and evidence bytes leave through the NAT gateway."
  }
}

run "kms_calls_from_the_private_subnets_reach_the_endpoint" {
  command = apply

  assert {
    condition     = aws_vpc_endpoint.kms.private_dns_enabled == true
    error_message = "Without private DNS, kms.<region>.amazonaws.com resolves to the public endpoint and signing traffic goes through the NAT."
  }

  assert {
    condition = anytrue([
      for r in aws_security_group.endpoint.ingress :
      r.protocol == "tcp" && r.from_port <= 443 && r.to_port >= 443 && contains(coalesce(r.cidr_blocks, []), var.vpc_cidr)
    ])
    error_message = "The endpoint's security group must admit HTTPS from the VPC, or nothing can reach the KMS endpoint."
  }

  assert {
    condition = alltrue([
      for r in aws_security_group.endpoint.ingress :
      alltrue([for c in coalesce(r.cidr_blocks, []) : c == var.vpc_cidr])
    ])
    error_message = "The endpoint admits the VPC alone; no wider range."
  }

  assert {
    condition     = toset(aws_vpc_endpoint.kms.subnet_ids) == toset(aws_subnet.private[*].id)
    error_message = "The KMS endpoint must sit in every private subnet the tasks run in."
  }
}
