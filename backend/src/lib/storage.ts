import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { describeError } from './errors';
import type { HealthCheckResult } from '../contracts';

let client: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (!client) {
    // Local dev points S3_ENDPOINT at the MinIO container (docker-compose.yml).
    // In production, leaving it unset derives the real Cloudflare R2 endpoint.
    const endpoint = env.S3_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

const CHECK_TIMEOUT_MS = 2000;

export async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await Promise.race([
      getStorageClient().send(new HeadBucketCommand({ Bucket: env.R2_BUCKET })),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('storage head-bucket timed out')), CHECK_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: describeError(err) };
  }
}
