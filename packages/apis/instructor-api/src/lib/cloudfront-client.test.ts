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

const PREFIX_KEY =
  'courses/course-1/modules/module-1/lessons/lesson-1/content-items/item-1/nonce-1/';
const MANIFEST_KEY = `${PREFIX_KEY}master.m3u8`;

describe('getSignedCloudFrontPrefixUrl', () => {
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

  it('signs a URL for the initial object key, with a custom policy covering the whole prefix', async () => {
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    const result = await getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY);

    expect(result).toBe('https://d123.cloudfront.net/signed-url');
    const [call] = getSignedUrl.mock.calls[0]!;
    expect(call.url).toBe(`https://${DOMAIN_NAME}/${MANIFEST_KEY}`);
    expect(call.keyPairId).toBe(KEY_PAIR_ID);
    expect(call.privateKey).toBe(PRIVATE_KEY_PEM);
    expect(call.dateLessThan).toBeUndefined();
    const policy = JSON.parse(call.policy);
    expect(policy.Statement[0].Resource).toBe(
      `https://${DOMAIN_NAME}/${PREFIX_KEY}*`,
    );
    expect(policy.Statement[0].Condition.DateLessThan['AWS:EpochTime']).toEqual(
      expect.any(Number),
    );
  });

  // hls.js fetches the manifest, then separately fetches rendition
  // playlists and segment files under the same prefix -- a canned,
  // single-object policy (the pre-HLS shape) would 403 all of those.
  it('scopes the policy to the given prefix, not just the initial object', async () => {
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY);

    const [call] = getSignedUrl.mock.calls[0]!;
    const policy = JSON.parse(call.policy);
    expect(policy.Statement[0].Resource).not.toBe(
      `https://${DOMAIN_NAME}/${MANIFEST_KEY}`,
    );
    expect(policy.Statement[0].Resource.endsWith('*')).toBe(true);
  });

  it('resolves the private key from the secret named in runtime config', async () => {
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY);

    expect(getSecret).toHaveBeenCalledWith(
      SECRET_ARN,
      expect.objectContaining({ transform: 'json' }),
    );
  });

  it('caches the resolved config and private key across calls', async () => {
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY);
    await getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY);

    expect(getAppConfig).toHaveBeenCalledTimes(1);
    expect(getSecret).toHaveBeenCalledTimes(1);
  });

  it('throws when RUNTIME_CONFIG_APP_ID is not set', async () => {
    delete process.env.RUNTIME_CONFIG_APP_ID;
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY),
    ).rejects.toThrow('RUNTIME_CONFIG_APP_ID');
  });

  it('throws when runtime config is missing CloudFront signing fields', async () => {
    getAppConfig.mockResolvedValue({
      LessonMediaBucket: { bucketName: 'lesson-media-bucket' },
    });
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY),
    ).rejects.toThrow('Could not resolve CloudFront signing config');
  });

  it('throws when the secret has no private key', async () => {
    getSecret.mockResolvedValue(undefined);
    const { getSignedCloudFrontPrefixUrl } = await importFreshModule();

    await expect(
      getSignedCloudFrontPrefixUrl(PREFIX_KEY, MANIFEST_KEY),
    ).rejects.toThrow('Could not resolve CloudFront signing private key');
  });
});
