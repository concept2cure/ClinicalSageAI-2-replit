#!/bin/bash
set -euo pipefail

awslocal s3api create-bucket --bucket ros-staging-evidence-store
awslocal s3api put-object-lock-configuration \
    --bucket ros-staging-evidence-store \
    --object-lock-configuration ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=GOVERNANCE,Days=2555}}  # 7 years

awslocal kms create-key --description "Staging ROS Signing Key"
awslocal iam create-role --role-name ros-staging-role --assume-role-policy-document "{}"
