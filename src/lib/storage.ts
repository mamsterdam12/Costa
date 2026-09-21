import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.BUCKET;

// Railway buckets use virtual-hosted-style S3 URLs and have no public URL
// mode -- objects are only reachable with these credentials, so every
// image is proxied through our own /api/images route rather than linked
// to directly.
const s3 =
  process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY && process.env.ENDPOINT
    ? new S3Client({
        region: process.env.REGION || "auto",
        endpoint: process.env.ENDPOINT,
        credentials: {
          accessKeyId: process.env.ACCESS_KEY_ID,
          secretAccessKey: process.env.SECRET_ACCESS_KEY,
        },
      })
    : null;

export function storageAvailable(): boolean {
  return !!s3 && !!BUCKET;
}

export async function uploadImage(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!s3 || !BUCKET) throw new Error("Object storage is not configured");
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

export async function getImage(
  key: string
): Promise<{ body: ReadableStream | null; contentType?: string } | null> {
  if (!s3 || !BUCKET) return null;
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      body: result.Body?.transformToWebStream() ?? null,
      contentType: result.ContentType,
    };
  } catch {
    return null;
  }
}
