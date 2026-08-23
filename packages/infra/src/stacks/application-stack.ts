import {
  CoreApi,
  CoreTable,
  StudentPortal,
  UserIdentity,
} from '@lms/common-constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Mfa } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const identity = new UserIdentity(this, 'Identity', {
      enableWaf: false,
      mfa: Mfa.OFF,
    });

    const coreTable = new CoreTable(this, 'CoreTable');

    const integrations = CoreApi.defaultIntegrations(this).build();

    const coreApi = new CoreApi(this, 'CoreApi', {
      integrations,
      identity,
      enableWaf: false,
    });

    Object.values(integrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    const studentPortal = new StudentPortal(this, 'StudentPortal');

    coreApi.restrictCorsTo(studentPortal);
  }
}
