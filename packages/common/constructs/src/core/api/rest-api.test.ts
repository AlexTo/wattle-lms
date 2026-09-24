/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// @vitest-environment node
// (CDK resolves asset paths from import.meta.url, which jsdom doesn't provide.)
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MockIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { describe, expect, it } from 'vitest';
import { RuntimeConfig } from '../runtime-config.js';
import { RestApi } from './rest-api.js';

type Operations = 'ping';

const buildIntegrations = () => ({
  ping: {
    integration: new MockIntegration({
      integrationResponses: [{ statusCode: '200' }],
      requestTemplates: { 'application/json': '{"statusCode": 200}' },
    }),
  },
});

const buildApi = (domainName?: string) => {
  const stack = new Stack(new App(), 'Stack', {
    env: { account: 'test-account', region: 'ap-southeast-2' },
  });
  const api = new RestApi<Operations, ReturnType<typeof buildIntegrations>>(
    stack,
    'Api',
    {
      apiName: 'TestApi',
      operations: { ping: { path: '/ping', method: 'GET' } },
      integrations: buildIntegrations(),
      enableWaf: false,
      ...(domainName
        ? {
            domainName: {
              domainName,
              certificate: Certificate.fromCertificateArn(
                stack,
                'Cert',
                'arn:aws:acm:ap-southeast-2:123456789012:certificate/abc',
              ),
            },
          }
        : {}),
    },
  );
  return { stack, api };
};

/** The stack's outputs whose logical ID mentions CustomDomainAliasTarget. */
const aliasTargetOutputs = (stack: Stack) =>
  Object.entries(Template.fromStack(stack).findOutputs('*'))
    .filter(([id]) => id.includes('CustomDomainAliasTarget'))
    .map(([, output]) => output);

describe('RestApi', () => {
  it("outputs the custom domain's API Gateway alias target when configured", () => {
    const { stack } = buildApi('api.example.com');
    const template = Template.fromStack(stack);
    const [domainNameId] = Object.keys(
      template.findResources('AWS::ApiGateway::DomainName'),
    );

    expect(aliasTargetOutputs(stack)).toEqual([
      expect.objectContaining({
        Value: { 'Fn::GetAtt': [domainNameId, 'RegionalDomainName'] },
      }),
    ]);
  });

  it('outputs no alias target when no custom domain is configured', () => {
    const { stack } = buildApi();

    expect(aliasTargetOutputs(stack)).toEqual([]);
  });

  it('publishes the custom domain URL in runtime config when configured', () => {
    const { stack } = buildApi('api.example.com');

    expect(RuntimeConfig.of(stack)?.get('connection').apis).toEqual({
      TestApi: 'https://api.example.com/',
    });
  });

  it('falls back to the generated execute-api URL when no custom domain is configured', () => {
    const { stack, api } = buildApi();

    const publishedUrl = stack.resolve(
      RuntimeConfig.of(stack)?.get('connection').apis.TestApi,
    );

    expect(publishedUrl).toEqual(stack.resolve(api.api.url));
  });

  it('includes the base path mapping in the custom domain URL when configured', () => {
    const stack = new Stack(new App(), 'Stack', {
      env: { account: 'test-account', region: 'ap-southeast-2' },
    });
    new RestApi<Operations, ReturnType<typeof buildIntegrations>>(
      stack,
      'Api',
      {
        apiName: 'TestApi',
        operations: { ping: { path: '/ping', method: 'GET' } },
        integrations: buildIntegrations(),
        enableWaf: false,
        domainName: {
          domainName: 'api.example.com',
          basePath: 'v1',
          certificate: Certificate.fromCertificateArn(
            stack,
            'Cert',
            'arn:aws:acm:ap-southeast-2:123456789012:certificate/abc',
          ),
        },
      },
    );

    expect(RuntimeConfig.of(stack)?.get('connection').apis).toEqual({
      TestApi: 'https://api.example.com/v1/',
    });
  });
});
