/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';
import { getSecret } from '@aws-lambda-powertools/parameters/secrets';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

const runtimeConfigKey = 'LessonMediaBucket';

type S3Config = {
  bucketName: string;
  cloudFrontDomainName: string;
  cloudFrontKeyPairId: string;
  cloudFrontPrivateKeySecretArn: string;
};

type CloudFrontConfig = Pick<
  S3Config,
  | 'cloudFrontDomainName'
  | 'cloudFrontKeyPairId'
  | 'cloudFrontPrivateKeySecretArn'
>;

let _config: CloudFrontConfig | undefined;
let _privateKey: string | undefined;

const resolveCloudFrontConfig = async (): Promise<CloudFrontConfig> => {
  if (_config === undefined) {
    const appId = process.env.RUNTIME_CONFIG_APP_ID;
    if (!appId) {
      throw new Error('RUNTIME_CONFIG_APP_ID environment variable is not set');
    }
    const config = await getAppConfig<{
      [key: string]: S3Config | undefined;
    }>('s3', {
      application: appId,
      environment: 'default',
      transform: 'json',
    });
    const entry = config?.[runtimeConfigKey];
    if (
      !entry?.cloudFrontDomainName ||
      !entry?.cloudFrontKeyPairId ||
      !entry?.cloudFrontPrivateKeySecretArn
    ) {
      throw new Error(
        'Could not resolve CloudFront signing config from runtime config',
      );
    }
    _config = {
      cloudFrontDomainName: entry.cloudFrontDomainName,
      cloudFrontKeyPairId: entry.cloudFrontKeyPairId,
      cloudFrontPrivateKeySecretArn: entry.cloudFrontPrivateKeySecretArn,
    };
  }
  return _config;
};

const resolvePrivateKey = async (secretArn: string): Promise<string> => {
  if (_privateKey === undefined) {
    const secret = await getSecret<{ privateKeyPem: string }>(secretArn, {
      transform: 'json',
    });
    if (!secret?.privateKeyPem) {
      throw new Error('Could not resolve CloudFront signing private key');
    }
    _privateKey = secret.privateKeyPem;
  }
  return _privateKey;
};

const DOWNLOAD_URL_EXPIRY_SECONDS = 5 * 60;

/**
 * Signs a CloudFront URL for the given lesson media object key, valid for
 * `DOWNLOAD_URL_EXPIRY_SECONDS`. Replaces the presigned-S3-GET approach:
 * the bucket stays private and playback goes through CloudFront instead.
 */
export const getSignedCloudFrontUrl = async (
  objectKey: string,
): Promise<string> => {
  const {
    cloudFrontDomainName,
    cloudFrontKeyPairId,
    cloudFrontPrivateKeySecretArn,
  } = await resolveCloudFrontConfig();
  const privateKey = await resolvePrivateKey(cloudFrontPrivateKeySecretArn);

  return getSignedUrl({
    url: `https://${cloudFrontDomainName}/${objectKey}`,
    keyPairId: cloudFrontKeyPairId,
    privateKey,
    dateLessThan: new Date(Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000),
  });
};
