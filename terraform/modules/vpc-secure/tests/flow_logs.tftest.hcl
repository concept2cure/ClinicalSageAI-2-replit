# Every packet decision in the VPC is recorded (MR-04 Stage 3 step 4; OPS-15,
# SEC-11).
#
# Until this file the VPC had no flow log. Nothing recorded which addresses
# the tasks, the database or the endpoints talked to, so an exfiltration, or a
# scan of the private subnets, would leave nothing to investigate. CIS AWS
# Foundations 3.7 asks for flow logs on every VPC.
#
# The log group is encrypted under its own key, which CloudWatch Logs may use
# for this group only, and is kept at least a year. Delivery runs as a role
# that only the flow-logs service, in this account, can assume.
#
# Offline: the AWS provider is mocked. Run from this module's directory:
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/flow-logs" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/flow-logs" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/vpc/c2c-production/flow-logs" }
  }
}

variables {
  eks_workloads_sg = "sg-0123456789abcdef0"
  name             = "c2c-production"
}

run "the_vpc_records_all_traffic" {
  command = apply

  assert {
    condition     = aws_flow_log.this.vpc_id == aws_vpc.this.id && aws_flow_log.this.traffic_type == "ALL"
    error_message = "The VPC must carry a flow log of ALL traffic, accepted and rejected (CIS 3.7)."
  }
  assert {
    condition     = aws_flow_log.this.log_destination_type == "cloud-watch-logs" && aws_flow_log.this.log_destination == aws_cloudwatch_log_group.flow_logs.arn
    error_message = "The flow log must deliver to its own CloudWatch log group."
  }
  assert {
    condition     = aws_flow_log.this.iam_role_arn == aws_iam_role.flow_logs.arn
    error_message = "The flow log must deliver as its own role."
  }
}

run "the_log_is_encrypted_and_kept_a_year" {
  command = apply

  assert {
    condition     = aws_cloudwatch_log_group.flow_logs.retention_in_days >= 365
    error_message = "Flow logs are kept at least 365 days."
  }
  assert {
    condition     = aws_cloudwatch_log_group.flow_logs.kms_key_id == aws_kms_key.flow_logs.arn && aws_kms_key.flow_logs.enable_key_rotation
    error_message = "The flow-log group must be encrypted under its own rotating key."
  }
  assert {
    condition = length([for s in jsondecode(aws_kms_key.flow_logs.policy).Statement : s
      if try(s.Principal.Service, "") == "logs.us-east-1.amazonaws.com" &&
    try(s.Condition.ArnEquals["kms:EncryptionContext:aws:logs:arn"], "") == "arn:aws:logs:us-east-1:123456789012:log-group:/aws/vpc/c2c-production/flow-logs"]) == 1
    error_message = "CloudWatch Logs may use the key for the flow-log group only."
  }
}

run "only_the_flow_logs_service_delivers" {
  command = apply

  assert {
    condition = (jsondecode(aws_iam_role.flow_logs.assume_role_policy).Statement[0].Principal.Service == "vpc-flow-logs.amazonaws.com" &&
    jsondecode(aws_iam_role.flow_logs.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012")
    error_message = "Only vpc-flow-logs.amazonaws.com, for this account, may assume the delivery role."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.flow_logs.policy).Statement :
    alltrue([for r in flatten([s.Resource]) : startswith(r, aws_cloudwatch_log_group.flow_logs.arn)])])
    error_message = "The delivery role may write to the flow-log group and nothing else."
  }
}

run "a_shorter_retention_is_refused" {
  command = plan

  variables {
    flow_log_retention_days = 90
  }

  expect_failures = [var.flow_log_retention_days]
}
