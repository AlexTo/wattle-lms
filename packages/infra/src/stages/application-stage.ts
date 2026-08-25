import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  ApplicationStack,
  ApplicationStackProps,
} from '../stacks/application-stack.js';

export interface ApplicationStageProps extends StageProps {
  /** Passed through to ApplicationStack to control per-component settings. */
  readonly identity?: ApplicationStackProps['identity'];
  readonly coreApi?: ApplicationStackProps['coreApi'];
  readonly coreTable?: ApplicationStackProps['coreTable'];
  readonly studentPortal?: ApplicationStackProps['studentPortal'];
}

/**
 * Defines a collection of CDK Stacks which make up your application
 */
export class ApplicationStage extends Stage {
  constructor(
    scope: Construct,
    id: string,
    {
      identity,
      coreApi,
      coreTable,
      studentPortal,
      ...props
    }: ApplicationStageProps,
  ) {
    super(scope, id, props);

    new ApplicationStack(this, 'Wattle', {
      crossRegionReferences: true,
      identity,
      coreApi,
      coreTable,
      studentPortal,
    });
  }
}
