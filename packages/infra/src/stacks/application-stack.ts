import {
  CoreApi,
  CoreTable,
  StudentPortal,
  UserIdentity,
} from '@lms/common-constructs';
import type {
  CoreApiComponentConfig,
  IdentityComponentConfig,
  StudentPortalComponentConfig,
} from '@lms/common-infra-config';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Mfa } from 'aws-cdk-lib/aws-cognito';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApplicationStackProps extends StackProps {
  /** Settings for the Cognito user pool / identity construct. @default all enabled */
  readonly identity?: IdentityComponentConfig;
  /** Settings for the core API construct. @default all enabled */
  readonly coreApi?: CoreApiComponentConfig;
  /** Settings for the student portal static website construct. @default all enabled */
  readonly studentPortal?: StudentPortalComponentConfig;
}

export class ApplicationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    {
      identity: identityConfig,
      coreApi: coreApiConfig,
      studentPortal: studentPortalConfig,
      ...props
    }: ApplicationStackProps,
  ) {
    super(scope, id, props);

    const identity = new UserIdentity(this, 'Identity', {
      enableWaf: identityConfig?.enableWaf ?? true,
      mfa: (identityConfig?.enableMfa ?? true) ? Mfa.REQUIRED : Mfa.OFF,
    });

    const coreTable = new CoreTable(this, 'CoreTable');

    const integrations = CoreApi.defaultIntegrations(this).build();

    const coreApi = new CoreApi(this, 'CoreApi', {
      integrations,
      identity,
      enableWaf: coreApiConfig?.enableWaf ?? true,
    });

    Object.values(integrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    const studentPortal = new StudentPortal(this, 'StudentPortal', {
      enableWaf: studentPortalConfig?.enableWaf ?? true,
      ...((studentPortalConfig?.enableKmsEncryption ?? true)
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });

    coreApi.restrictCorsTo(studentPortal);
  }
}
