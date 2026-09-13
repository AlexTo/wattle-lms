/**
 * Copyright Wattle LMS Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Lazy, RemovalPolicy } from 'aws-cdk-lib';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { Grant, IGrantable } from 'aws-cdk-lib/aws-iam';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
  IBucket,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { suppressRules } from './checkov.js';
import { findCloudFrontDomainNames } from './cloudfront.js';
import { RuntimeConfig } from './runtime-config.js';

export interface MediaBucketProps {
  /**
   * RuntimeConfig key used under the `s3` namespace.
   */
  readonly runtimeConfigKey: string;
  /**
   * Whether to encrypt the bucket with a customer-managed KMS key.
   *
   * @default true
   */
  readonly enableKmsEncryption?: boolean;
  /**
   * KMS key used to encrypt the bucket. Only used when `enableKmsEncryption`
   * is `true`. When not provided, a new key is created.
   */
  readonly encryptionKey?: IKey;
  /**
   * Whether the automatically created KMS key has rotation enabled. Only
   * applies when `enableKmsEncryption` is `true` and no `encryptionKey` is
   * supplied.
   *
   * @default true
   */
  readonly enableKeyRotation?: boolean;
}

/**
 * A private S3 bucket for uploading/serving media via presigned URLs rather
 * than public or CloudFront read access. Objects are never publicly
 * readable; callers get time-limited access via presigned PUT/GET URLs
 * generated server-side.
 */
export class MediaBucket extends Construct {
  public readonly bucket: IBucket;
  private allowedOrigins: string[] = ['*'];

  constructor(
    scope: Construct,
    id: string,
    {
      runtimeConfigKey,
      enableKmsEncryption = true,
      encryptionKey,
      enableKeyRotation = true,
    }: MediaBucketProps,
  ) {
    super(scope, id);

    const key: IKey | undefined = enableKmsEncryption
      ? (encryptionKey ?? new Key(this, 'EncryptionKey', { enableKeyRotation }))
      : undefined;

    this.bucket = new Bucket(this, runtimeConfigKey, {
      versioned: true,
      enforceSSL: true,
      encryption: key ? BucketEncryption.KMS : BucketEncryption.S3_MANAGED,
      encryptionKey: key,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
          allowedOrigins: Lazy.list({ produce: () => this.allowedOrigins }),
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });
    suppressRules(
      this.bucket,
      ['CKV_AWS_18'],
      'Private, presigned-only bucket; server access logs are not required',
    );

    RuntimeConfig.ensure(this).set('s3', runtimeConfigKey, {
      bucketName: this.bucket.bucketName,
    });
  }

  /**
   * Restricts the bucket's CORS configuration to the provided origins.
   *
   * @param origins - The origin strings, CloudFront distributions, or objects containing a CloudFront distribution to grant CORS from
   */
  public restrictCorsTo(
    ...origins: (
      | string
      | Distribution
      | { cloudFrontDistribution: Distribution }
    )[]
  ) {
    this.allowedOrigins = origins.flatMap((origin) =>
      typeof origin === 'string'
        ? [origin]
        : findCloudFrontDomainNames(
            'cloudFrontDistribution' in origin
              ? origin.cloudFrontDistribution
              : origin,
          ).map((domain) => `https://${domain}`),
    );
  }

  public grantPut(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee);
  }

  public grantRead(grantee: IGrantable): Grant {
    return this.bucket.grantRead(grantee);
  }

  public grantDelete(grantee: IGrantable): Grant {
    return this.bucket.grantDelete(grantee);
  }
}
