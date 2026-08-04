import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

const PRESIGN_EXPIRY_SECONDS = 15 * 60;

export async function createPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(getStorageClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

// Rendered PDFs are cached in R2 permanently (docs/studysheet-build-prompt.md
// §11: "never regenerate on download") — this is how a caller gets a
// time-limited URL to fetch one without the object needing to be public.
export async function createPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
  return getSignedUrl(getStorageClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getStorageClient().send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function downloadObject(key: string): Promise<Buffer> {
  const result = await getStorageClient().send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  if (!result.Body) {
    throw new Error(`Object at "${key}" has no body`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}
