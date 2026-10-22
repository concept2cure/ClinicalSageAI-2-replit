# The public subnets hand no address to whatever is launched in them (MR-02
# hand-on to MR-03; Semgrep aws-subnet-has-public-ip-address,
# docs/evidence/MR-02/2026-10-22-trunk-green/05-semgrep.md).
#
# They hold only the internet-facing ALB, whose nodes AWS addresses itself, and
# the NAT gateway, on its own Elastic IP. With map_public_ip_on_launch = true,
# anything else placed there by mistake (an instance, a task with a default
# network configuration) would be reachable from the internet on launch.
#
# Offline: the AWS provider is mocked. Run from this module's directory:
#   terraform init -backend=false && terraform test

mock_provider "aws" {}

variables {
  eks_workloads_sg = "sg-0123456789abcdef0"
}

run "no_subnet_hands_out_a_public_address" {
  command = apply

  assert {
    condition     = alltrue([for s in concat(aws_subnet.public, aws_subnet.private) : s.map_public_ip_on_launch == false])
    error_message = "A subnet assigns public IPs on launch; the ALB and the NAT gateway need none."
  }

  # The NAT keeps its own Elastic IP, so egress from the private subnets does
  # not depend on the subnet setting.
  assert {
    condition     = aws_nat_gateway.this.subnet_id == aws_subnet.public[0].id && aws_eip.nat.domain == "vpc"
    error_message = "The NAT gateway must sit in a public subnet on its own Elastic IP."
  }
}
