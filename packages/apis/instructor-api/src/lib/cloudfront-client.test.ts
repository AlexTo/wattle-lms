/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAppConfig, getSecret, getSignedUrl } = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  getSecret: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock('@aws-lambda-powertools/parameters/appconfig', () => ({
  getAppConfig,
}));

vi.mock('@aws-lambda-powertools/parameters/secrets', () => ({
  getSecret,
}));

vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl,
}));

const DOMAIN_NAME = 'd123.cloudfront.net';
const KEY_PAIR_ID = 'K2JCJMDEHXQW5F';
const SECRET_ARN =
  'arn:aws:secretsmanager:us-east-1:123456789012:secret:signing-key-abc123';
const PRIVATE_KEY_PEM =
  '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----';

// Each test that needs a fresh module (distinct env/config state, or to
// assert caching in isolation) resets the module registry and re-imports:
// resolveCloudFrontConfig/resolvePrivateKey cache in module-level state, so
// reusing one import across tests with different mock setups would leak
// the first successful resolution into later tests.
const importFreshModule = async () => {
  vi.resetModules();
  return import('./cloudfront-client.js');
};

describe('getSignedCloudFrontUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RUNTIME_CONFIG_APP_ID = 'app-1';
    getAppConfig.mockResolvedValue({
      LessonMediaBucket: {
        bucketName: 'lesson-media-bucket',
        cloudFrontDomainName: DOMAIN_NAME,
        cloudFrontKeyPairId: KEY_PAIR_ID,
        cloudFrontPrivateKeySecretArn: SECRET_ARN,
      },
    });
    getSecret.mockResolvedValue({ privateKeyPem: PRIVATE_KEY_PEM });
    getSignedUrl.mockReturnValue('https://d123.cloudfront.net/signed-url');
  });

  it('signs a CloudFront URL built from the resolved domain and object key', async () => {
    const { getSignedCloudFrontUrl } = await importFreshModule();

    const result = await getSignedCloudFrontUrl('lessons/lesson-1/video.mp4');

    expect(result).toBe('https://d123.cloudfront.net/signed-url');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `https://${DOMAIN_NAME}/lessons/lesson-1/video.mp4`,
        keyPairId: KEY_PAIR_ID,
        privateKey: PRIVATE_KEY_PEM,
      }),
    );
  });

  it('resolves the private key from the secret named in runtime config', async () => {
    const { getSignedCloudFrontUrl } = await importFreshModule();

    await getSignedCloudFrontUrl('lessons/lesson-1/video.mp4');

    expect(getSecret).toHaveBeenCalledWith(
      SECRET_ARN,
      expect.objectContaining({ transform: 'json' }),
    );
  });

  it('caches the resolved config and private key across calls', async () => {
    const { getSignedCloudFrontUrl } = await importFreshModule();

    await getSignedCloudFrontUrl('lessons/lesson-1/a.mp4');
    await getSignedCloudFrontUrl('lessons/lesson-1/b.mp4');

    expect(getAppConfig).toHaveBeenCalledTimes(1);
    expect(getSecret).toHaveBeenCalledTimes(1);
  });

  it('throws when RUNTIME_CONFIG_APP_ID is not set', async () => {
    delete process.env.RUNTIME_CONFIG_APP_ID;
    const { getSignedCloudFrontUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontUrl('lessons/lesson-1/video.mp4'),
    ).rejects.toThrow('RUNTIME_CONFIG_APP_ID');
  });

  it('throws when runtime config is missing CloudFront signing fields', async () => {
    getAppConfig.mockResolvedValue({
      LessonMediaBucket: { bucketName: 'lesson-media-bucket' },
    });
    const { getSignedCloudFrontUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontUrl('lessons/lesson-1/video.mp4'),
    ).rejects.toThrow('Could not resolve CloudFront signing config');
  });

  it('throws when the secret has no private key', async () => {
    getSecret.mockResolvedValue(undefined);
    const { getSignedCloudFrontUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontUrl('lessons/lesson-1/video.mp4'),
    ).rejects.toThrow('Could not resolve CloudFront signing private key');
  });
});
