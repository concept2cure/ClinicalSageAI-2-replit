/**
 * The application's S3 client and the two reads every caller needs.
 *
 * One construction, so the vault (s3-provider.ts) and the audit-chain anchor
 * (services/audit/chain-anchor.ts) reach S3 the same way: the task role's
 * credentials from the default provider chain, in AWS_REGION. The SDK is
 * imported statically for the reason s3-provider.ts gives (a `require()` in
 * the ESM bundle threw, and S3 could never be selected in a deployed build).
 *
 * @module server/services/storage/s3-client
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

/** The region the deployment names; the provider otherwise assumes us-east-1. */
export function createS3Client(): S3Client {
  return new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
}

/** What these helpers need of a client: the SDK's `send`, or a test's fake of it. */
export interface S3Sender {
  send(command: unknown): Promise<any>;
}

/** Every key under `prefix`, following S3's continuation tokens to the end. */
export async function listS3Keys(client: S3Sender, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }));
    for (const obj of page.Contents || []) if (obj.Key) keys.push(obj.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/** An object's bytes. A missing key throws the SDK's NoSuchKey; nothing is swallowed. */
export async function readS3Object(client: S3Sender, bucket: string, key: string): Promise<Buffer> {
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
