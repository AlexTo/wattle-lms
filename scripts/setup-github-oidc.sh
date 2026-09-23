#!/usr/bin/env bash

#
# Copyright Wattle LMS Contributors. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
set -euo pipefail

# GitHub Actions OIDC setup for Wattle LMS.
#
# Run this once per deployment stage (as defined in
# packages/common/infra-config/src/stages.config.ts), from a clone of the
# repository that will run the deploy workflow — your fork, if you forked.
# It creates or updates:
# - the GitHub OIDC provider (shared by every stage in the account)
# - the GitHub deploy role assumed by the workflow
# - the CloudFormation execution role passed to `cdk deploy --role-arn`
#
# Stages may share an AWS account, so the stage is passed explicitly rather
# than inferred from the account ID. Each stage gets its own pair of roles, and
# the deploy role trusts only the GitHub environment of the same name.
#
# Usage:
#   1. pnpm install (the stage list and settings are read from stages.config.ts)
#   2. Authenticate the AWS CLI against the stage's target account
#   3. Run: ./scripts/setup-github-oidc.sh <stage>
#      e.g. ./scripts/setup-github-oidc.sh wattle-development
#   4. Add the printed values to the matching GitHub environment
#
# Overrides (environment variables):
#   GITHUB_REPOSITORY    owner/repo trusted by the deploy role (default: parsed
#                        from the `origin` remote)
#   AWS_REGION           used when the stage config sets no region (default:
#                        AWS_DEFAULT_REGION, then the AWS CLI's configured region)
#   CDK_QUALIFIER        CDK bootstrap qualifier (default: hnb659fds)
#   DEPLOY_ROLE_NAME, EXECUTION_ROLE_NAME
#
# This script is designed to be idempotent and safe to run multiple times.

readonly INFRA_PROJECT_PATH="packages/infra"
# CloudFront-scoped WAF web ACLs are deployed as separate stacks in us-east-1.
readonly GLOBAL_REGION="us-east-1"
readonly OIDC_PROVIDER_URL="https://token.actions.githubusercontent.com"
readonly OIDC_PROVIDER_HOST="token.actions.githubusercontent.com"
readonly CDK_QUALIFIER="${CDK_QUALIFIER:-hnb659fds}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

# Prints `<stage>` lines, or `<field>=<value>` lines for one stage's config.
read_stages_config() {
  (
    cd "$REPO_ROOT"
    pnpm exec tsx --eval "
      import('./packages/common/infra-config/src/index.ts').then((m) => {
        const [project, stage] = process.argv.slice(1);
        if (!stage) return console.log(m.listStageNames(project).join('\n'));
        const config = m.resolveStage(project, stage) ?? {};
        console.log('region=' + (config.region ?? ''));
        console.log('account=' + (config.account ?? ''));
        console.log('profile=' + (config.credentials?.type === 'profile' ? config.credentials.profile : ''));
      });
    " "$@"
  )
}

usage() {
  echo "Usage: $0 <stage>" >&2
  echo "Configured stages: ${CONFIGURED_STAGES[*]}" >&2
}

mapfile -t CONFIGURED_STAGES < <(read_stages_config "$INFRA_PROJECT_PATH")
readonly CONFIGURED_STAGES

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

TARGET_STAGE=""
for stage in "${CONFIGURED_STAGES[@]}"; do
  if [[ "$1" == "$stage" ]]; then
    TARGET_STAGE="$stage"
  fi
done

if [[ -z "$TARGET_STAGE" ]]; then
  echo "Unknown stage: $1" >&2
  usage
  echo "Add it to packages/common/infra-config/src/stages.config.ts first." >&2
  exit 1
fi

readonly TARGET_STAGE

STAGE_REGION=""
STAGE_ACCOUNT=""
STAGE_PROFILE=""
while IFS='=' read -r key value; do
  case "$key" in
    region) STAGE_REGION="$value" ;;
    account) STAGE_ACCOUNT="$value" ;;
    profile) STAGE_PROFILE="$value" ;;
  esac
done < <(read_stages_config "$INFRA_PROJECT_PATH" "$TARGET_STAGE")

# Deploy with the same profile `nx deploy` would use for this stage, unless
# the caller already picked one.
if [[ -n "$STAGE_PROFILE" && -z "${AWS_PROFILE:-}" ]]; then
  export AWS_PROFILE="$STAGE_PROFILE"
fi

resolve_github_repository() {
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    echo "$GITHUB_REPOSITORY"
    return
  fi

  local remote_url
  remote_url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
    return
  fi

  echo "Couldn't determine the GitHub repository from the 'origin' remote." >&2
  echo "Set GITHUB_REPOSITORY=owner/repo and re-run." >&2
  exit 1
}

GITHUB_REPOSITORY="$(resolve_github_repository)"
readonly GITHUB_REPOSITORY

AWS_REGION="${STAGE_REGION:-${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}}"
if [[ -z "$AWS_REGION" ]]; then
  echo "No region: set 'region' for $TARGET_STAGE in stages.config.ts, or AWS_REGION." >&2
  exit 1
fi
readonly AWS_REGION

CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
readonly CALLER_ARN
# arn:<partition>:<service>::<account>:<resource>
AWS_PARTITION="$(cut -d: -f2 <<<"$CALLER_ARN")"
ACCOUNT_ID="$(cut -d: -f5 <<<"$CALLER_ARN")"
readonly AWS_PARTITION ACCOUNT_ID

if [[ -n "$STAGE_ACCOUNT" && "$STAGE_ACCOUNT" != "$ACCOUNT_ID" ]]; then
  echo "$TARGET_STAGE is configured for account $STAGE_ACCOUNT, but the AWS CLI is authenticated against $ACCOUNT_ID." >&2
  exit 1
fi

# CloudFormation-generated physical names (roles, functions, buckets, tables,
# rules) are prefixed with the stack name, and every stack in a stage is named
# `<stage>-*`, so this prefix scopes most permissions to one stage.
readonly RESOURCE_PREFIX="$TARGET_STAGE-"
# Generated bucket names are the lowercased equivalent.
readonly BUCKET_PREFIX="${RESOURCE_PREFIX,,}"
# CDK-generated names for some resources (MediaConvert job templates, Scheduler
# groups) drop the hyphens from the stack path.
readonly COMPACT_PREFIX="${TARGET_STAGE//-/}"
# Role names deliberately don't start with RESOURCE_PREFIX, so the execution
# role's IAM permissions (scoped to `role/<stage>-*`) can't modify either role.
readonly DEPLOY_ROLE_NAME="${DEPLOY_ROLE_NAME:-github-deploy-$TARGET_STAGE}"
readonly EXECUTION_ROLE_NAME="${EXECUTION_ROLE_NAME:-cfn-execution-$TARGET_STAGE}"

cleanup() {
  rm -f "${DEPLOY_TRUST_POLICY_FILE:-}" \
    "${DEPLOY_POLICY_FILE:-}" \
    "${EXECUTION_TRUST_POLICY_FILE:-}" \
    "${EXECUTION_POLICY_FILE:-}"
}

trap cleanup EXIT

log_header() {
  echo "============================================"
  echo "GitHub Actions OIDC Setup"
  echo "============================================"
  echo "GitHub Repo:     $GITHUB_REPOSITORY"
  echo "AWS Account ID:  $ACCOUNT_ID"
  echo "AWS Region:      $AWS_REGION (+ $GLOBAL_REGION)"
  echo "Target Stage:    $TARGET_STAGE"
}

confirm() {
  echo "============================================"
  echo "This will create or update:"
  echo "  - OIDC provider: $OIDC_PROVIDER_HOST"
  echo "  - Deploy role:   $DEPLOY_ROLE_NAME"
  echo "  - Exec role:     $EXECUTION_ROLE_NAME"
  echo "  - GitHub env:    $TARGET_STAGE"
  echo "============================================"
  read -r -p "Continue? [y/N] " response
  case "$response" in
    [yY][eE][sS]|[yY]) ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
}

ensure_oidc_provider() {
  local provider_arn="arn:$AWS_PARTITION:iam::$ACCOUNT_ID:oidc-provider/$OIDC_PROVIDER_HOST"

  if aws iam get-open-id-connect-provider \
    --open-id-connect-provider-arn "$provider_arn" >/dev/null 2>&1; then
    echo "OIDC provider already exists: $provider_arn"
    return
  fi

  echo "Creating OIDC provider: $provider_arn"
  aws iam create-open-id-connect-provider \
    --url "$OIDC_PROVIDER_URL" \
    --client-id-list sts.amazonaws.com >/dev/null
}

create_policy_files() {
  DEPLOY_TRUST_POLICY_FILE="$(mktemp -t "${DEPLOY_ROLE_NAME}.trust.XXXXXX.json")"
  DEPLOY_POLICY_FILE="$(mktemp -t "${DEPLOY_ROLE_NAME}.policy.XXXXXX.json")"
  EXECUTION_TRUST_POLICY_FILE="$(mktemp -t "${EXECUTION_ROLE_NAME}.trust.XXXXXX.json")"

  cat >"$DEPLOY_TRUST_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:$AWS_PARTITION:iam::$ACCOUNT_ID:oidc-provider/$OIDC_PROVIDER_HOST"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "$OIDC_PROVIDER_HOST:aud": "sts.amazonaws.com",
          "$OIDC_PROVIDER_HOST:sub": "repo:$GITHUB_REPOSITORY:environment:$TARGET_STAGE"
        }
      }
    }
  ]
}
EOF

  cat >"$EXECUTION_TRUST_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

  cat >"$DEPLOY_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationDeployWattle",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ListChangeSets"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:cloudformation:$AWS_REGION:$ACCOUNT_ID:stack/$RESOURCE_PREFIX*/*",
        "arn:$AWS_PARTITION:cloudformation:$GLOBAL_REGION:$ACCOUNT_ID:stack/$RESOURCE_PREFIX*/*"
      ]
    },
    {
      "Sid": "ReadCdkBootstrapVersion",
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": [
        "arn:$AWS_PARTITION:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/cdk-bootstrap/$CDK_QUALIFIER/version",
        "arn:$AWS_PARTITION:ssm:$GLOBAL_REGION:$ACCOUNT_ID:parameter/cdk-bootstrap/$CDK_QUALIFIER/version"
      ]
    },
    {
      "Sid": "UseBootstrapAssetsBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$AWS_REGION",
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$GLOBAL_REGION"
      ]
    },
    {
      "Sid": "ReadWriteBootstrapAssetsObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$AWS_REGION/*",
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$GLOBAL_REGION/*"
      ]
    },
    {
      "Sid": "PassCloudFormationServiceRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$EXECUTION_ROLE_NAME"
    }
  ]
}
EOF
}

upsert_role() {
  local role_name="$1"
  local trust_policy_file="$2"
  local description="$3"

  if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
    echo "Updating trust policy for role: $role_name"
    aws iam update-assume-role-policy \
      --role-name "$role_name" \
      --policy-document "file://$trust_policy_file"
  else
    echo "Creating role: $role_name"
    aws iam create-role \
      --role-name "$role_name" \
      --assume-role-policy-document "file://$trust_policy_file" \
      --description "$description" \
      --tags \
        Key=Project,Value=wattle-lms \
        Key=ManagedBy,Value=setup-github-oidc.sh \
        Key=Stage,Value="$TARGET_STAGE" >/dev/null
  fi
}

attach_inline_policy() {
  echo "Attaching deploy permissions to: $DEPLOY_ROLE_NAME"
  aws iam put-role-policy \
    --role-name "$DEPLOY_ROLE_NAME" \
    --policy-name WattleGitHubDeployPermissions \
    --policy-document "file://$DEPLOY_POLICY_FILE"
}

attach_execution_policy() {
  EXECUTION_POLICY_FILE="$(mktemp -t "${EXECUTION_ROLE_NAME}.policy.XXXXXX.json")"

  cat >"$EXECUTION_POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadSsmParameters",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/cdk-bootstrap/$CDK_QUALIFIER/version",
        "arn:$AWS_PARTITION:ssm:$GLOBAL_REGION:$ACCOUNT_ID:parameter/cdk-bootstrap/$CDK_QUALIFIER/version",
        "arn:$AWS_PARTITION:ssm:$AWS_REGION:$ACCOUNT_ID:parameter/cdk/exports/$RESOURCE_PREFIX*",
        "arn:$AWS_PARTITION:ssm:$GLOBAL_REGION:$ACCOUNT_ID:parameter/cdk/exports/$RESOURCE_PREFIX*"
      ]
    },
    {
      "Sid": "S3BucketsForWattle",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:GetBucket*",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:ListBucket",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketNotification",
        "s3:PutBucketOwnershipControls",
        "s3:PutBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutBucketTagging",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "s3:PutBucketCORS",
        "s3:PutBucketLogging",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketAcl"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:s3:::$BUCKET_PREFIX*"
      ]
    },
    {
      "Sid": "S3ObjectsForWattle",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectTagging",
        "s3:PutObjectTagging",
        "s3:DeleteObjectTagging"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:s3:::$BUCKET_PREFIX*/*"
      ]
    },
    {
      "Sid": "ReadCdkAssets",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$AWS_REGION/*",
        "arn:$AWS_PARTITION:s3:::cdk-$CDK_QUALIFIER-assets-$ACCOUNT_ID-$GLOBAL_REGION/*"
      ]
    },
    {
      "Sid": "LambdaForWattle",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:DeleteFunction",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:GetFunctionCodeSigningConfig",
        "lambda:GetFunctionRecursionConfig",
        "lambda:GetRuntimeManagementConfig",
        "lambda:GetPolicy",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:InvokeFunction",
        "lambda:PublishVersion",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:ListVersionsByFunction",
        "lambda:ListTags",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:PublishLayerVersion",
        "lambda:GetLayerVersion",
        "lambda:DeleteLayerVersion"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:lambda:$AWS_REGION:$ACCOUNT_ID:function:$RESOURCE_PREFIX*",
        "arn:$AWS_PARTITION:lambda:$GLOBAL_REGION:$ACCOUNT_ID:function:$RESOURCE_PREFIX*",
        "arn:$AWS_PARTITION:lambda:$AWS_REGION:$ACCOUNT_ID:layer:*",
        "arn:$AWS_PARTITION:lambda:$GLOBAL_REGION:$ACCOUNT_ID:layer:*"
      ]
    },
    {
      "Sid": "DynamoDbForWattle",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeTimeToLive",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeContributorInsights",
        "dynamodb:DescribeKinesisStreamingDestination",
        "dynamodb:GetResourcePolicy"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/$RESOURCE_PREFIX*",
        "arn:$AWS_PARTITION:dynamodb:$AWS_REGION:$ACCOUNT_ID:table/$RESOURCE_PREFIX*/index/*"
      ]
    },
    {
      "Sid": "KmsKeysForWattle",
      "Effect": "Allow",
      "Action": [
        "kms:CreateKey",
        "kms:DescribeKey",
        "kms:GetKeyPolicy",
        "kms:PutKeyPolicy",
        "kms:GetKeyRotationStatus",
        "kms:EnableKeyRotation",
        "kms:DisableKeyRotation",
        "kms:ListResourceTags",
        "kms:TagResource",
        "kms:UntagResource",
        "kms:ScheduleKeyDeletion",
        "kms:CreateGrant",
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchLogsForWattle",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:PutRetentionPolicy",
        "logs:DeleteRetentionPolicy",
        "logs:AssociateKmsKey",
        "logs:DisassociateKmsKey",
        "logs:DescribeLogGroups",
        "logs:ListTagsForResource",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:*Deliver*",
        "logs:*ResourcePolic*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFrontForWattle",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:CreateDistributionWithTags",
        "cloudfront:UpdateDistribution",
        "cloudfront:DeleteDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource",
        "cloudfront:*OriginAccessControl",
        "cloudfront:*ResponseHeadersPolicy",
        "cloudfront:*PublicKey",
        "cloudfront:*KeyGroup",
        "cloudfront:AllowVendedLogDeliveryForResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ApiGatewayForWattle",
      "Effect": "Allow",
      "Action": [
        "apigateway:POST",
        "apigateway:GET",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE",
        "apigateway:SetWebACL",
        "apigateway:UpdateRestApiPolicy"
      ],
      "Resource": "*"
    },
    {
      "Sid": "WafV2ForWattle",
      "Effect": "Allow",
      "Action": [
        "wafv2:CreateWebACL",
        "wafv2:UpdateWebACL",
        "wafv2:DeleteWebACL",
        "wafv2:GetWebACL",
        "wafv2:AssociateWebACL",
        "wafv2:DisassociateWebACL",
        "wafv2:GetWebACLForResource",
        "wafv2:ListResourcesForWebACL",
        "wafv2:PutLoggingConfiguration",
        "wafv2:GetLoggingConfiguration",
        "wafv2:DeleteLoggingConfiguration",
        "wafv2:ListTagsForResource",
        "wafv2:TagResource",
        "wafv2:UntagResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EventBridgeRulesForWattle",
      "Effect": "Allow",
      "Action": [
        "events:PutRule",
        "events:DeleteRule",
        "events:DescribeRule",
        "events:PutTargets",
        "events:RemoveTargets",
        "events:TagResource",
        "events:UntagResource",
        "events:ListTargetsByRule"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:events:$AWS_REGION:$ACCOUNT_ID:rule/$RESOURCE_PREFIX*"
      ]
    },
    {
      "Sid": "SchedulerGroupsForWattle",
      "Effect": "Allow",
      "Action": [
        "scheduler:CreateScheduleGroup",
        "scheduler:GetScheduleGroup",
        "scheduler:DeleteScheduleGroup",
        "scheduler:TagResource",
        "scheduler:UntagResource",
        "scheduler:ListTagsForResource"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:scheduler:$AWS_REGION:$ACCOUNT_ID:schedule-group/$COMPACT_PREFIX*"
      ]
    },
    {
      "Sid": "MediaConvertEndpoints",
      "Effect": "Allow",
      "Action": "mediaconvert:DescribeEndpoints",
      "Resource": "*"
    },
    {
      "Sid": "MediaConvertJobTemplatesForWattle",
      "Effect": "Allow",
      "Action": [
        "mediaconvert:CreateJobTemplate",
        "mediaconvert:GetJobTemplate",
        "mediaconvert:UpdateJobTemplate",
        "mediaconvert:DeleteJobTemplate",
        "mediaconvert:TagResource",
        "mediaconvert:UntagResource",
        "mediaconvert:ListTagsForResource"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:mediaconvert:$AWS_REGION:$ACCOUNT_ID:jobTemplates/$COMPACT_PREFIX*"
      ]
    },
    {
      "Sid": "AppConfigForWattle",
      "Effect": "Allow",
      "Action": [
        "appconfig:CreateApplication",
        "appconfig:GetApplication",
        "appconfig:UpdateApplication",
        "appconfig:DeleteApplication",
        "appconfig:CreateEnvironment",
        "appconfig:GetEnvironment",
        "appconfig:UpdateEnvironment",
        "appconfig:DeleteEnvironment",
        "appconfig:CreateConfigurationProfile",
        "appconfig:GetConfigurationProfile",
        "appconfig:UpdateConfigurationProfile",
        "appconfig:DeleteConfigurationProfile",
        "appconfig:CreateHostedConfigurationVersion",
        "appconfig:GetHostedConfigurationVersion",
        "appconfig:DeleteHostedConfigurationVersion",
        "appconfig:CreateDeploymentStrategy",
        "appconfig:GetDeploymentStrategy",
        "appconfig:UpdateDeploymentStrategy",
        "appconfig:DeleteDeploymentStrategy",
        "appconfig:StartDeployment",
        "appconfig:GetDeployment",
        "appconfig:StopDeployment",
        "appconfig:TagResource",
        "appconfig:UntagResource",
        "appconfig:ListTagsForResource"
      ],
      "Resource": "arn:$AWS_PARTITION:appconfig:$AWS_REGION:$ACCOUNT_ID:*"
    },
    {
      "Sid": "ManageWattleIamRolesAndPolicies",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies"
      ],
      "Resource": [
        "arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$RESOURCE_PREFIX*"
      ]
    },
    {
      "Sid": "CognitoUserPools",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:CreateUserPool",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:UpdateUserPool",
        "cognito-idp:DeleteUserPool",
        "cognito-idp:SetUserPoolMfaConfig",
        "cognito-idp:GetUserPoolMfaConfig",
        "cognito-idp:CreateGroup",
        "cognito-idp:GetGroup",
        "cognito-idp:UpdateGroup",
        "cognito-idp:DeleteGroup",
        "cognito-idp:CreateUserPoolClient",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:UpdateUserPoolClient",
        "cognito-idp:DeleteUserPoolClient",
        "cognito-idp:CreateUserPoolDomain",
        "cognito-idp:DescribeUserPoolDomain",
        "cognito-idp:UpdateUserPoolDomain",
        "cognito-idp:DeleteUserPoolDomain",
        "cognito-idp:CreateManagedLoginBranding",
        "cognito-idp:DescribeManagedLoginBranding",
        "cognito-idp:DescribeManagedLoginBrandingByClient",
        "cognito-idp:UpdateManagedLoginBranding",
        "cognito-idp:DeleteManagedLoginBranding",
        "cognito-idp:AssociateWebACL",
        "cognito-idp:DisassociateWebACL",
        "cognito-idp:GetWebACLForResource",
        "cognito-idp:ListResourcesForWebACL",
        "cognito-idp:TagResource",
        "cognito-idp:UntagResource",
        "cognito-idp:ListTagsForResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CognitoIdentityPools",
      "Effect": "Allow",
      "Action": [
        "cognito-identity:CreateIdentityPool",
        "cognito-identity:DescribeIdentityPool",
        "cognito-identity:UpdateIdentityPool",
        "cognito-identity:DeleteIdentityPool",
        "cognito-identity:GetIdentityPoolRoles",
        "cognito-identity:SetIdentityPoolRoles",
        "cognito-identity:TagResource",
        "cognito-identity:UntagResource",
        "cognito-identity:ListTagsForResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassOnlyWattleRolesToServices",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$RESOURCE_PREFIX*"
      ]
    }
  ]
}
EOF

  echo "Attaching execution policy to: $EXECUTION_ROLE_NAME"
  aws iam put-role-policy \
    --role-name "$EXECUTION_ROLE_NAME" \
    --policy-name WattleCloudFormationExecutionPolicy \
    --policy-document "file://$EXECUTION_POLICY_FILE"
}

print_next_steps() {
  local deploy_role_arn="arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$DEPLOY_ROLE_NAME"
  local execution_role_arn="arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$EXECUTION_ROLE_NAME"

  echo ""
  echo "Complete. Configure the GitHub environment named '$TARGET_STAGE' with:"
  echo "  Variable:   AWS_REGION=$AWS_REGION"
  echo "  Variable:   AWS_DEPLOY_ROLE_ARN=$deploy_role_arn"
  echo "  Variable:   AWS_EXECUTION_ROLE_ARN=$execution_role_arn"
  echo ""
  echo "Then deploy it from the Deploy workflow (Actions tab > Deploy > Run workflow)."
  echo "To deploy it automatically whenever CI passes on main, also set the"
  echo "repository variable AUTO_DEPLOY_STAGE=$TARGET_STAGE."
}

log_header
confirm
ensure_oidc_provider
create_policy_files
upsert_role \
  "$DEPLOY_ROLE_NAME" \
  "$DEPLOY_TRUST_POLICY_FILE" \
  "GitHub Actions deploy role for $GITHUB_REPOSITORY ($TARGET_STAGE)"
attach_inline_policy
upsert_role \
  "$EXECUTION_ROLE_NAME" \
  "$EXECUTION_TRUST_POLICY_FILE" \
  "CloudFormation execution role for $GITHUB_REPOSITORY ($TARGET_STAGE)"
attach_execution_policy
print_next_steps
