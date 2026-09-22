import { prisma } from "./prisma";
import { storageAvailable, uploadImage } from "./storage";
import { fetchBinary } from "../scrapers/lib/http";
import { waitForHostTurn } from "../scrapers/lib/fetcher";

// The source usually publishes the event's own poster -- the real thing,
// not a generated stand-in. When a scrape finds one, it is copied into
// our bucket once, at ingestion, and served from there: the source's
// server isn't hit again on every page view, and the picture survives
// the page being taken down after the event.

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function importEventImage(
  event: { id: string; slug: string; imageKey: string | null },
  imageUrl: string
): Promise<string | null> {
  if (event.imageKey) return `/api/images/${event.imageKey}`;
  if (!storageAvailable()) return null;

  try {
    await waitForHostTurn(imageUrl);
    const response = await fetchBinary(imageUrl);
    if (!response.ok) {
      console.warn(`[image] ${event.slug}: source image responded ${response.status}`);
      return null;
    }
    const extension = TYPES[response.contentType];
    if (!extension) {
      console.warn(`[image] ${event.slug}: source image is "${response.contentType}", not an image we store`);
      return null;
    }
    const bytes = response.bytes;
    if (bytes.byteLength > MAX_BYTES || bytes.byteLength < 1024) {
      console.warn(`[image] ${event.slug}: source image is ${bytes.byteLength} bytes, skipped`);
      return null;
    }

    const key = `events/${event.slug}.${extension}`;
    await uploadImage(key, bytes, response.contentType);
    await prisma.event.update({ where: { id: event.id }, data: { imageKey: key, imageUrl } });
    console.log(`[image] ${event.slug}: stored the source's own image (${bytes.byteLength} bytes)`);
    return `/api/images/${key}`;
  } catch (err) {
    console.warn(`[image] ${event.slug}: could not fetch ${imageUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
