/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/** Use an AWS CLI profile from ~/.aws/config */
export type ProfileCredentials = {
  type: 'profile';
  /** AWS CLI profile name */
  profile: string;
};

/** Assume an IAM role via STS, optionally using a profile as the source credentials */
export type AssumeRoleCredentials = {
  type: 'assumeRole';
  /** IAM Role ARN to assume */
  assumeRole: string;
  /** Optional: AWS CLI profile to use as source credentials for the AssumeRole call */
  profile?: string;
  /** Optional: External ID required by the role's trust policy */
  externalId?: string;
  /** Optional: Session duration in seconds (default: 3600). Increase for long deployments. */
  sessionDuration?: number;
};

/**
 * Credentials for deploying to a specific CDK stage.
 * The `type` field determines which credential strategy is used.
 */
export type StageCredentials = ProfileCredentials | AssumeRoleCredentials;

/**
 * Per-stage settings for the Cognito user pool / identity construct.
 */
export type IdentityComponentConfig = {
  /** Protect the Cognito user pool with AWS WAF */
  enableWaf?: boolean;
  /** Require MFA on the Cognito user pool */
  enableMfa?: boolean;
};

/**
 * Per-stage settings for the core API construct.
 */
export type CoreApiComponentConfig = {
  /** Protect the API Gateway with AWS WAF */
  enableWaf?: boolean;
  /** Use customer-managed KMS encryption instead of the cheaper AWS-owned default for the access log group */
  enableKmsEncryption?: boolean;
  /** Enable automatic key rotation on the access log group's KMS key. Only used when `enableKmsEncryption` is true */
  enableKeyRotation?: boolean;
};

/**
 * Per-stage settings for the core DynamoDB table construct.
 */
export type CoreTableComponentConfig = {
  /** Use customer-managed KMS encryption instead of the cheaper AWS-owned default */
  enableKmsEncryption?: boolean;
  /** Enable automatic key rotation on the table's KMS key. Only used when `enableKmsEncryption` is true */
  enableKeyRotation?: boolean;
  /** Prevent the table from being deleted while the stack is deployed */
  enableDeletionProtection?: boolean;
};

/**
 * Per-stage settings for the student portal static website construct.
 */
export type StudentPortalComponentConfig = {
  /** Protect the CloudFront distribution with AWS WAF */
  enableWaf?: boolean;
  /** Use customer-managed KMS encryption instead of the cheaper S3-managed default */
  enableKmsEncryption?: boolean;
  /** Enable automatic key rotation on the website bucket's KMS key. Only used when `enableKmsEncryption` is true */
  enableKeyRotation?: boolean;
};

/**
 * Per-stage settings for the instructor portal static website construct.
 */
export type InstructorPortalComponentConfig = {
  /** Protect the CloudFront distribution with AWS WAF */
  enableWaf?: boolean;
  /** Use customer-managed KMS encryption instead of the cheaper S3-managed default */
  enableKmsEncryption?: boolean;
  /** Enable automatic key rotation on the website bucket's KMS key. Only used when `enableKmsEncryption` is true */
  enableKeyRotation?: boolean;
};

/**
 * Component-level settings consuming apps use to configure their constructs
 * per stage, keyed by component name. Omitted components/flags fall back to
 * whatever default the app itself chooses.
 */
export type StageComponents = {
  identity?: IdentityComponentConfig;
  coreApi?: CoreApiComponentConfig;
  coreTable?: CoreTableComponentConfig;
  studentPortal?: StudentPortalComponentConfig;
  instructorPortal?: InstructorPortalComponentConfig;
};

/**
 * Configuration for a single CDK stage.
 * Credentials/region/account are optional — omit them to fall back to the
 * active AWS CLI/environment credentials (see resolveStage).
 */
export type StageConfig = {
  /** How to authenticate when deploying this stage. Omit to use environment/CLI credentials. */
  credentials?: StageCredentials;
  /** AWS region for this stage (e.g., 'us-east-1'). Omit to use CDK_DEFAULT_REGION. */
  region?: string;
  /** AWS account ID. If omitted, CDK infers it from the active credentials. */
  account?: string;
  /** Component-level toggles for this stage */
  components?: StageComponents;
};

/**
 * Configuration for a single infrastructure project.
 * The key in the parent map is the project path relative to workspace root
 * (e.g., 'packages/infra').
 */
export type ProjectConfig = {
  /** Map of CDK stage names to their configuration */
  stages: { [stageName: string]: StageConfig };
};

/** Top-level configuration mapping projects and stages to their settings. */
export type StagesConfig = {
  /** Project-specific config. Key is the project path relative to workspace root. */
  projects?: { [projectPath: string]: ProjectConfig };
  /** Shared stage config available to all projects. */
  shared?: {
    stages: { [stageName: string]: StageConfig };
  };
};
