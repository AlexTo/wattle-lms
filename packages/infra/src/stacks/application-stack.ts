/**
 * Copyright Alex To. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  CoreApi,
  CoreTable,
  EventsPostConfirmation,
  InstructorPortal,
  StudentPortal,
  suppressRules,
  UserIdentity,
} from '@wattle/common-constructs';
import type {
  CoreApiComponentConfig,
  CoreTableComponentConfig,
  IdentityComponentConfig,
  InstructorPortalComponentConfig,
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
  /** Settings for the core DynamoDB table construct. @default all enabled */
  readonly coreTable?: CoreTableComponentConfig;
  /** Settings for the student portal static website construct. @default all enabled */
  readonly studentPortal?: StudentPortalComponentConfig;
  /** Settings for the instructor portal static website construct. @default all enabled */
  readonly instructorPortal?: InstructorPortalComponentConfig;
}

export class ApplicationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    {
      identity: identityConfig,
      coreApi: coreApiConfig,
      coreTable: coreTableConfig,
      studentPortal: studentPortalConfig,
      instructorPortal: instructorPortalConfig,
      ...props
    }: ApplicationStackProps,
  ) {
    super(scope, id, props);

    const coreTableKmsEnabled = coreTableConfig?.enableKmsEncryption ?? true;
    const coreApiKmsEnabled = coreApiConfig?.enableKmsEncryption ?? true;
    const studentPortalWafEnabled = studentPortalConfig?.enableWaf ?? true;
    const studentPortalKmsEnabled =
      studentPortalConfig?.enableKmsEncryption ?? true;
    const instructorPortalWafEnabled =
      instructorPortalConfig?.enableWaf ?? true;
    const instructorPortalKmsEnabled =
      instructorPortalConfig?.enableKmsEncryption ?? true;

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

    coreApi.restrictCorsTo(studentPortal, instructorPortal);
  }
}
