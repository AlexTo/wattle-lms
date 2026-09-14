/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  AdminPortal,
  CoreApi,
  CoreTable,
  EventsPostConfirmation,
  InstructorApi,
  InstructorPortal,
  LessonMediaBucket,
  StudentPortal,
  suppressRules,
  UserIdentity,
} from '@wattle/common-constructs';
import type {
  AdminPortalComponentConfig,
  CoreApiComponentConfig,
  CoreTableComponentConfig,
  IdentityComponentConfig,
  InstructorApiComponentConfig,
  InstructorPortalComponentConfig,
  LessonMediaComponentConfig,
  StudentPortalComponentConfig,
} from '@wattle/common-infra-config';
import { CfnResource, Stack, StackProps } from 'aws-cdk-lib';
import { Mfa, UserPoolOperation } from 'aws-cdk-lib/aws-cognito';
import { TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApplicationStackProps extends StackProps {
  /** Settings for the Cognito user pool / identity construct. @default all enabled */
  readonly identity?: IdentityComponentConfig;
  /** Settings for the core API construct. @default all enabled */
  readonly coreApi?: CoreApiComponentConfig;
  /** Settings for the instructor API construct. @default all enabled */
  readonly instructorApi?: InstructorApiComponentConfig;
  /** Settings for the core DynamoDB table construct. @default all enabled */
  readonly coreTable?: CoreTableComponentConfig;
  /** Settings for the student portal static website construct. @default all enabled */
  readonly studentPortal?: StudentPortalComponentConfig;
  /** Settings for the instructor portal static website construct. @default all enabled */
  readonly instructorPortal?: InstructorPortalComponentConfig;
  /** Settings for the admin portal static website construct. @default all enabled */
  readonly adminPortal?: AdminPortalComponentConfig;
  /** Settings for the lesson media S3 bucket construct. @default all enabled */
  readonly lessonMedia?: LessonMediaComponentConfig;
}

export class ApplicationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    {
      identity: identityConfig,
      coreApi: coreApiConfig,
      instructorApi: instructorApiConfig,
      coreTable: coreTableConfig,
      studentPortal: studentPortalConfig,
      instructorPortal: instructorPortalConfig,
      adminPortal: adminPortalConfig,
      lessonMedia: lessonMediaConfig,
      ...props
    }: ApplicationStackProps,
  ) {
    super(scope, id, props);

    const coreTableKmsEnabled = coreTableConfig?.enableKmsEncryption ?? true;
    const coreApiKmsEnabled = coreApiConfig?.enableKmsEncryption ?? true;
    const instructorApiWafEnabled = instructorApiConfig?.enableWaf ?? true;
    const instructorApiKmsEnabled =
      instructorApiConfig?.enableKmsEncryption ?? true;
    const studentPortalWafEnabled = studentPortalConfig?.enableWaf ?? true;
    const studentPortalKmsEnabled =
      studentPortalConfig?.enableKmsEncryption ?? true;
    const instructorPortalWafEnabled =
      instructorPortalConfig?.enableWaf ?? true;
    const instructorPortalKmsEnabled =
      instructorPortalConfig?.enableKmsEncryption ?? true;
    const adminPortalWafEnabled = adminPortalConfig?.enableWaf ?? true;
    const adminPortalKmsEnabled =
      adminPortalConfig?.enableKmsEncryption ?? true;
    const lessonMediaKmsEnabled =
      lessonMediaConfig?.enableKmsEncryption ?? true;

    const identity = new UserIdentity(this, 'Identity', {
      enableWaf: identityConfig?.enableWaf ?? true,
      mfa: (identityConfig?.enableMfa ?? true) ? Mfa.REQUIRED : Mfa.OFF,
    });

    // Adds every self-signed-up user to the `student` group
    const postConfirmation = new EventsPostConfirmation(
      this,
      'PostConfirmation',
    );
    // Scoped to any pool in this account/region rather than this specific
    // pool's ARN: referencing the pool here would create a circular
    // CloudFormation dependency, since the pool's LambdaConfig already
    // depends on this function
    postConfirmation.addToRolePolicy(
      new PolicyStatement({
        actions: ['cognito-idp:AdminAddUserToGroup'],
        resources: [
          Stack.of(this).formatArn({
            service: 'cognito-idp',
            resource: 'userpool',
            resourceName: '*',
          }),
        ],
      }),
    );
    identity.userPool.addTrigger(
      UserPoolOperation.POST_CONFIRMATION,
      postConfirmation,
    );

    const coreTable = new CoreTable(this, 'CoreTable', {
      encryption: coreTableKmsEnabled
        ? TableEncryption.CUSTOMER_MANAGED
        : TableEncryption.DEFAULT,
      enableKeyRotation: coreTableConfig?.enableKeyRotation ?? true,
      deletionProtection: coreTableConfig?.enableDeletionProtection ?? true,
    });
    if (!coreTableKmsEnabled) {
      suppressRules(
        coreTable.table,
        ['CKV_AWS_119'],
        'KMS CMK encryption disabled for this stage',
      );
    }

    const integrations = CoreApi.defaultIntegrations(this).build();

    const coreApi = new CoreApi(this, 'CoreApi', {
      integrations,
      identity,
      enableWaf: coreApiConfig?.enableWaf ?? true,
      enableKmsEncryption: coreApiKmsEnabled,
      enableKeyRotation: coreApiConfig?.enableKeyRotation ?? true,
    });
    if (!coreApiKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/CoreApi/AccessLogs'),
      );
    }

    Object.values(integrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    const instructorApiIntegrations =
      InstructorApi.defaultIntegrations(this).build();

    const instructorApi = new InstructorApi(this, 'InstructorApi', {
      integrations: instructorApiIntegrations,
      identity,
      enableWaf: instructorApiWafEnabled,
      enableKmsEncryption: instructorApiKmsEnabled,
      enableKeyRotation: instructorApiConfig?.enableKeyRotation ?? true,
    });
    if (!instructorApiKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/InstructorApi/AccessLogs'),
      );
    }

    Object.values(instructorApiIntegrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    const lessonMediaWafEnabled = lessonMediaConfig?.enableWaf ?? true;
    const lessonMediaBucket = new LessonMediaBucket(this, 'LessonMediaBucket', {
      enableWaf: lessonMediaWafEnabled,
      enableKmsEncryption: lessonMediaKmsEnabled,
      enableKeyRotation: lessonMediaConfig?.enableKeyRotation ?? true,
    });
    if (!lessonMediaKmsEnabled) {
      suppressRules(
        lessonMediaBucket.bucket,
        ['CKV_AWS_145'],
        'KMS CMK encryption disabled for this stage',
      );
    }
    if (!lessonMediaWafEnabled) {
      suppressRules(
        lessonMediaBucket.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    // Least-privilege: only the specific operations that need to sign/access
    // lesson video objects get bucket permissions, not every instructor-api
    // handler (each tRPC operation is its own isolated Lambda).
    lessonMediaBucket.grantPut(
      instructorApiIntegrations['contentItem.createVideoUploadUrl'].handler,
    );
    lessonMediaBucket.grantReadSigningKey(
      instructorApiIntegrations['contentItem.createVideoUrl'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['contentItem.delete'].handler,
    );
    // updateContentItemVideo best-effort-deletes the old S3 object when a
    // video is replaced with a new file. updateContentItemText never touches
    // S3, so it gets no bucket permissions.
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    );
    // Deleting a lesson or module cascades to its content items, best-
    // effort-deleting each one's underlying S3 object.
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['lesson.delete'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['module.delete'].handler,
    );

    const studentPortal = new StudentPortal(this, 'StudentPortal', {
      enableWaf: studentPortalWafEnabled,
      enableKeyRotation: studentPortalConfig?.enableKeyRotation ?? true,
      ...(studentPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!studentPortalWafEnabled) {
      suppressRules(
        studentPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!studentPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/StudentPortal/AccessLogs'),
      );
    }

    const instructorPortal = new InstructorPortal(this, 'InstructorPortal', {
      enableWaf: instructorPortalWafEnabled,
      enableKeyRotation: instructorPortalConfig?.enableKeyRotation ?? true,
      ...(instructorPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!instructorPortalWafEnabled) {
      suppressRules(
        instructorPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!instructorPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/InstructorPortal/AccessLogs'),
      );
    }

    const adminPortal = new AdminPortal(this, 'AdminPortal', {
      enableWaf: adminPortalWafEnabled,
      enableKeyRotation: adminPortalConfig?.enableKeyRotation ?? true,
      ...(adminPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!adminPortalWafEnabled) {
      suppressRules(
        adminPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!adminPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/AdminPortal/AccessLogs'),
      );
    }

    coreApi.restrictCorsTo(
      studentPortal,
      instructorPortal,
      adminPortal,
      'http://localhost:4200',
      'http://localhost:4300',
      'http://localhost:4201',
      'http://localhost:4301',
      'http://localhost:4202',
      'http://localhost:4302',
    );

    instructorApi.restrictCorsTo(
      instructorPortal,
      'http://localhost:4200',
      'http://localhost:4300',
    );

    lessonMediaBucket.restrictCorsTo(
      instructorPortal,
      'http://localhost:4200',
      'http://localhost:4300',
    );
  }
}
