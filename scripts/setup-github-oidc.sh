#!/usr/bin/env bash

#
# Copyright Wattle LMS Contributors. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
set -euo pipefail

# Guided GitHub Actions OIDC setup for Wattle LMS.
#
# Run this once per deployment stage (as defined in
# packages/common/infra-config/src/stages.config.ts), from a clone of the
# repository that will run the deploy workflow — your fork, if you forked. It
# prompts for everything it needs, defaulting each answer to what it can detect
# (press Enter to accept), then:
# - creates the GitHub OIDC provider (shared by every stage in the account)
# - creates or updates the GitHub deploy role assumed by the workflow
# - creates or updates the CloudFormation execution role passed to
#   `cdk deploy --role-arn`
# - optionally bootstraps CDK in the regions the stage deploys to
# - optionally creates the matching GitHub environment and sets its variables
#   (requires an authenticated `gh` CLI)
#
# Stages may share an AWS account, so each stage gets its own pair of roles,
# and the deploy role trusts only the GitHub environment of the same name.
#
# Usage:
#   pnpm install   # the stage list and settings are read from stages.config.ts
#   ./scripts/setup-github-oidc.sh [--yes] [stage]
#
#   --yes   accept every default without prompting (for scripted runs)
#
# Defaults can be preset with environment variables:
#   GITHUB_REPOSITORY    owner/repo trusted by the deploy role (otherwise
#                        parsed from the `origin` remote)
#   AWS_PROFILE          AWS CLI profile (otherwise the stage's configured
#                        profile, then the default credential chain)
#   AWS_REGION           used when the stage config sets no region
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

ASSUME_YES=false
REQUESTED_STAGE=""

print_usage() {
  sed -n '/^# Usage:/,/^# This script/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=true ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$REQUESTED_STAGE" ]]; then
        print_usage >&2
        exit 1
      fi
      REQUESTED_STAGE="$1"
      ;;
  esac
  shift
done

if [[ "$ASSUME_YES" == false && ! -t 0 ]]; then
  echo "stdin isn't a terminal, so answers can't be prompted for; pass --yes to accept the defaults." >&2
  exit 1
fi

# ask <var> <question> [default]: prompts until a non-empty answer, falling
# back to the default on Enter (or without prompting under --yes).
ask() {
  local var="$1" question="$2" default="${3:-}" answer=""
  while [[ -z "$answer" ]]; do
    if [[ "$ASSUME_YES" == true ]]; then
      answer="$default"
      [[ -n "$answer" ]] || { echo "No default for: $question" >&2; exit 1; }
    else
      read -r -p "$question${default:+ [$default]}: " answer
      answer="${answer:-$default}"
    fi
  done
  printf -v "$var" '%s' "$answer"
}

# ask_optional <var> <question> [default]: like ask, but an empty answer is
# allowed; typing `-` clears a non-empty default.
ask_optional() {
  local var="$1" question="$2" default="${3:-}" answer=""
  if [[ "$ASSUME_YES" == true ]]; then
    answer="$default"
  else
    read -r -p "$question${default:+ [$default, - for none]}: " answer
    answer="${answer:-$default}"
    [[ "$answer" != "-" ]] || answer=""
  fi
  printf -v "$var" '%s' "$answer"
}

# ask_yes_no <question> <y|n>: succeeds on yes.
ask_yes_no() {
  local question="$1" default="$2" answer=""
  if [[ "$ASSUME_YES" == true ]]; then
    answer="$default"
  else
    local hint="[y/N]"
    [[ "$default" == y ]] && hint="[Y/n]"
    read -r -p "$question $hint " answer
    answer="${answer:-$default}"
  fi
  [[ "$answer" =~ ^[yY]([eE][sS])?$ ]]
}

section() {
  echo ""
  echo "== $1"
}

# Prints `<stage>` lines, or `<field>=<value>` lines for one stage's config.
read_stages_config() {
  (
    cd "$REPO_ROOT"
    pnpm exec tsx --eval "
      import('./packages/common/infra-config/src/index.ts').then((m) => {
        const [project, stage] = process.argv.slice(1);
        if (!stage) return console.log(m.listStageNames(project).join('\n'));
        const config = m.resolveStage(project, stage) ?? {};
        const c = config.components ?? {};
        // Component security settings default to on unless a stage relaxes them.
        const cloudFrontWaf = [c.studentPortal, c.instructorPortal, c.adminPortal, c.lessonMedia]
          .some((component) => component?.enableWaf !== false);
        console.log('region=' + (config.region ?? ''));
        console.log('account=' + (config.account ?? ''));
        console.log('profile=' + (config.credentials?.type === 'profile' ? config.credentials.profile : ''));
        console.log('cloudFrontWaf=' + cloudFrontWaf);
      });
    " "$@"
  )
}

detect_github_repository() {
  local remote_url
  remote_url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote_url" =~ github\.com[:/]([^/]+)/([^/]+)$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
  fi
}

bootstrap_missing() {
  ! aws ssm get-parameter \
    --name "/cdk-bootstrap/$CDK_QUALIFIER/version" \
    --region "$1" >/dev/null 2>&1
}

github_cli_ready() {
  command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1
}

echo "============================================"
echo "GitHub Actions OIDC Setup"
echo "============================================"

section "Stage"
mapfile -t CONFIGURED_STAGES < <(read_stages_config "$INFRA_PROJECT_PATH")
readonly CONFIGURED_STAGES
if [[ ${#CONFIGURED_STAGES[@]} -eq 0 ]]; then
  echo "No stages found in packages/common/infra-config/src/stages.config.ts." >&2
  exit 1
fi
for i in "${!CONFIGURED_STAGES[@]}"; do
  echo "  $((i + 1))) ${CONFIGURED_STAGES[$i]}"
done

TARGET_STAGE=""
while [[ -z "$TARGET_STAGE" ]]; do
  ask stage_answer "Stage to set up (name or number)" "${REQUESTED_STAGE:-${CONFIGURED_STAGES[0]}}"
  for i in "${!CONFIGURED_STAGES[@]}"; do
    if [[ "$stage_answer" == "${CONFIGURED_STAGES[$i]}" || "$stage_answer" == "$((i + 1))" ]]; then
      TARGET_STAGE="${CONFIGURED_STAGES[$i]}"
    fi
  done
  if [[ -z "$TARGET_STAGE" ]]; then
    echo "Unknown stage: $stage_answer (add new stages to stages.config.ts first)" >&2
    [[ "$ASSUME_YES" == false ]] || exit 1
  fi
done
readonly TARGET_STAGE

STAGE_REGION=""
STAGE_ACCOUNT=""
STAGE_PROFILE=""
STAGE_CLOUDFRONT_WAF=""
while IFS='=' read -r key value; do
  case "$key" in
    region) STAGE_REGION="$value" ;;
    account) STAGE_ACCOUNT="$value" ;;
    profile) STAGE_PROFILE="$value" ;;
    cloudFrontWaf) STAGE_CLOUDFRONT_WAF="$value" ;;
  esac
done < <(read_stages_config "$INFRA_PROJECT_PATH" "$TARGET_STAGE")

section "GitHub"
while true; do
  ask GITHUB_REPOSITORY "Repository that runs the deploy workflow (owner/repo)" \
    "${GITHUB_REPOSITORY:-$(detect_github_repository)}"
  [[ "$GITHUB_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] && break
  echo "Expected owner/repo, got: $GITHUB_REPOSITORY" >&2
  [[ "$ASSUME_YES" == false ]] || exit 1
  GITHUB_REPOSITORY=""
done
readonly GITHUB_REPOSITORY

section "AWS credentials"
available_profiles="$(aws configure list-profiles 2>/dev/null | paste -sd' ' - || true)"
[[ -z "$available_profiles" ]] || echo "Profiles in your AWS config: $available_profiles"
ask_optional selected_profile "AWS CLI profile for the target account (blank = default credential chain)" \
  "${AWS_PROFILE:-$STAGE_PROFILE}"
if [[ -n "$selected_profile" ]]; then
  export AWS_PROFILE="$selected_profile"
else
  unset AWS_PROFILE
fi

if ! CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text 2>&1)"; then
  echo "$CALLER_ARN" >&2
  echo "Couldn't authenticate with AWS. Log in first (e.g. \`aws sso login${selected_profile:+ --profile $selected_profile}\` or \`aws configure\`), then re-run." >&2
  exit 1
fi
readonly CALLER_ARN
# arn:<partition>:<service>::<account>:<resource>
AWS_PARTITION="$(cut -d: -f2 <<<"$CALLER_ARN")"
ACCOUNT_ID="$(cut -d: -f5 <<<"$CALLER_ARN")"
readonly AWS_PARTITION ACCOUNT_ID
echo "Authenticated as $CALLER_ARN (account $ACCOUNT_ID)"

if [[ -n "$STAGE_ACCOUNT" && "$STAGE_ACCOUNT" != "$ACCOUNT_ID" ]]; then
  echo "$TARGET_STAGE is configured for account $STAGE_ACCOUNT in stages.config.ts; switch credentials and re-run." >&2
  exit 1
fi

section "Region"
if [[ -n "$STAGE_REGION" ]]; then
  # CDK deploys the stage wherever stages.config.ts says, so don't offer a
  # different answer here.
  AWS_REGION="$STAGE_REGION"
  echo "Using $AWS_REGION (set for $TARGET_STAGE in stages.config.ts)"
else
  ask AWS_REGION "Primary AWS region for $TARGET_STAGE" \
    "${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
fi
readonly AWS_REGION

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

section "CDK bootstrap"
REQUIRED_REGIONS=("$AWS_REGION")
if [[ "$STAGE_CLOUDFRONT_WAF" == true && "$AWS_REGION" != "$GLOBAL_REGION" ]]; then
  REQUIRED_REGIONS+=("$GLOBAL_REGION")
fi
BOOTSTRAP_REGIONS=()
for region in "${REQUIRED_REGIONS[@]}"; do
  if ! bootstrap_missing "$region"; then
    echo "Already bootstrapped: $region"
  elif ask_yes_no "CDK isn't bootstrapped in $region (qualifier $CDK_QUALIFIER). Bootstrap it?" y; then
    BOOTSTRAP_REGIONS+=("$region")
  else
    echo "Skipping; deploys to $region will fail until it's bootstrapped." >&2
  fi
done

section "GitHub environment"
CONFIGURE_GITHUB=false
SET_AUTO_DEPLOY=false
if ! github_cli_ready; then
  echo "The gh CLI isn't installed or logged in, so the GitHub environment will be listed for you to set up by hand."
elif ask_yes_no "Create the '$TARGET_STAGE' environment in $GITHUB_REPOSITORY and set its variables with gh?" y; then
  CONFIGURE_GITHUB=true
  current_auto_deploy="$(gh api "repos/$GITHUB_REPOSITORY/actions/variables/AUTO_DEPLOY_STAGE" --jq .value 2>/dev/null || true)"
  if [[ "$current_auto_deploy" == "$TARGET_STAGE" ]]; then
    echo "$TARGET_STAGE already deploys automatically when CI passes on main."
  elif ask_yes_no "Deploy $TARGET_STAGE automatically whenever CI passes on main?${current_auto_deploy:+ (replaces $current_auto_deploy)}" n; then
    SET_AUTO_DEPLOY=true
  fi
fi

cleanup() {
  rm -f "${DEPLOY_TRUST_POLICY_FILE:-}" \
    "${DEPLOY_POLICY_FILE:-}" \
    "${EXECUTION_TRUST_POLICY_FILE:-}" \
    "${EXECUTION_POLICY_FILE:-}"
}

trap cleanup EXIT

confirm() {
  echo ""
  echo "============================================"
  echo "GitHub repo:     $GITHUB_REPOSITORY"
  echo "AWS account:     $ACCOUNT_ID${AWS_PROFILE:+ (profile $AWS_PROFILE)}"
  echo "AWS region:      $AWS_REGION"
  echo "Stage:           $TARGET_STAGE"
  echo ""
  echo "This will create or update:"
  echo "  - OIDC provider: $OIDC_PROVIDER_HOST"
  echo "  - Deploy role:   $DEPLOY_ROLE_NAME"
  echo "  - Exec role:     $EXECUTION_ROLE_NAME"
  if [[ ${#BOOTSTRAP_REGIONS[@]} -gt 0 ]]; then
    echo "  - CDK bootstrap: ${BOOTSTRAP_REGIONS[*]}"
  fi
  if [[ "$CONFIGURE_GITHUB" == true ]]; then
    echo "  - GitHub env:    $TARGET_STAGE (AWS_REGION, AWS_DEPLOY_ROLE_ARN, AWS_EXECUTION_ROLE_ARN)"
  fi
  if [[ "$SET_AUTO_DEPLOY" == true ]]; then
    echo "  - GitHub var:    AUTO_DEPLOY_STAGE=$TARGET_STAGE"
  fi
  echo "============================================"
  if ! ask_yes_no "Continue?" y; then
    echo "Aborted."
    exit 0
  fi
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

bootstrap_cdk() {
  local region
  for region in "${BOOTSTRAP_REGIONS[@]}"; do
    echo "Bootstrapping CDK in $region"
    (cd "$REPO_ROOT" && pnpm exec cdk bootstrap "aws://$ACCOUNT_ID/$region" --qualifier "$CDK_QUALIFIER")
  done
}

configure_github_environment() {
  echo "Creating GitHub environment: $TARGET_STAGE"
  gh api --method PUT "repos/$GITHUB_REPOSITORY/environments/$TARGET_STAGE" >/dev/null

  local name value
  for name in AWS_REGION AWS_DEPLOY_ROLE_ARN AWS_EXECUTION_ROLE_ARN; do
    case "$name" in
      AWS_REGION) value="$AWS_REGION" ;;
      AWS_DEPLOY_ROLE_ARN) value="$DEPLOY_ROLE_ARN" ;;
      AWS_EXECUTION_ROLE_ARN) value="$EXECUTION_ROLE_ARN" ;;
    esac
    gh variable set "$name" --repo "$GITHUB_REPOSITORY" --env "$TARGET_STAGE" --body "$value"
  done

  if [[ "$SET_AUTO_DEPLOY" == true ]]; then
    gh variable set AUTO_DEPLOY_STAGE --repo "$GITHUB_REPOSITORY" --body "$TARGET_STAGE"
  fi
}

print_next_steps() {
  echo ""
  echo "Complete."
  if [[ "$CONFIGURE_GITHUB" == false ]]; then
    echo "Create a GitHub environment named '$TARGET_STAGE' in $GITHUB_REPOSITORY with:"
    echo "  Variable:   AWS_REGION=$AWS_REGION"
    echo "  Variable:   AWS_DEPLOY_ROLE_ARN=$DEPLOY_ROLE_ARN"
    echo "  Variable:   AWS_EXECUTION_ROLE_ARN=$EXECUTION_ROLE_ARN"
    echo "To deploy it automatically whenever CI passes on main, also set the"
    echo "repository variable AUTO_DEPLOY_STAGE=$TARGET_STAGE."
    echo ""
  fi
  echo "Anyone who can run workflows can deploy this stage. For production-like"
  echo "stages, add required reviewers and restrict deployments to main at:"
  echo "  https://github.com/$GITHUB_REPOSITORY/settings/environments"
  echo ""
  echo "Deploy from the Actions tab (Deploy > Run workflow), or:"
  echo "  gh workflow run deploy.yml --repo $GITHUB_REPOSITORY -f stage=$TARGET_STAGE"
}

readonly DEPLOY_ROLE_ARN="arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$DEPLOY_ROLE_NAME"
readonly EXECUTION_ROLE_ARN="arn:$AWS_PARTITION:iam::$ACCOUNT_ID:role/$EXECUTION_ROLE_NAME"

confirm
bootstrap_cdk
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
if [[ "$CONFIGURE_GITHUB" == true ]]; then
  configure_github_environment
fi
print_next_steps
