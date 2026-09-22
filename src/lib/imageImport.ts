import { prisma } from "./prisma";
import { storageAvailable, uploadImage } from "./storage";
import { fetchBinary } from "../scrapers/lib/http";
import { imageSize } from "./imageMeta";
import { waitForHostTurn } from "../scrapers/lib/fetcher";

// The source usually publishes the event's own poster -- the real thing,
// not a generated stand-in. When a scrape finds one, it is copied into
// our bucket once, at ingestion, and served from there: the source's
// server isn't hit again on every page view, and the picture survives
// the page being taken down after the event.

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_PIXELS = 200;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function importEventImage(
  event: {
    id: string;
    slug: string;
    imageKey: string | null;
    imageUrl: string | null;
    imageWidth: number | null;
  },
  imageUrl: string
): Promise<string | null> {
  // A picture already checked against the rule below stays. One stored
  // before there was a rule has no dimensions recorded, and gets fetched
  // again so it can be held to it.
  if (event.imageKey && (event.imageWidth ?? 0) >= MIN_PIXELS) return `/api/images/${event.imageKey}`;
  if (event.imageKey && !event.imageUrl) return `/api/images/${event.imageKey}`;
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
    if (bytes.byteLength > MAX_BYTES) {
      console.warn(`[image] ${event.slug}: source image is ${bytes.byteLength} bytes, too big to store`);
      return null;
    }
    // Icons, spacers and social defaults come back as perfectly valid
    // images; what gives them away is their size on screen.
    const size = imageSize(bytes);
    if (!size || size.width < MIN_PIXELS || size.height < MIN_PIXELS) {
      console.warn(
        `[image] ${event.slug}: source image is ${size ? `${size.width}x${size.height}` : "unreadable"}, ` +
          `not the event's own picture`
      );
      // Drop a copy stored under the older, size-only rule, so the event
      // shows no picture rather than a spacer -- and can still get a
      // generated one later.
      if (event.imageKey && event.imageUrl) {
        await prisma.event.update({
          where: { id: event.id },
          data: { imageKey: null, imageUrl: null },
        });
      }
      return null;
    }

    const key = `events/${event.slug}.${extension}`;
    await uploadImage(key, bytes, response.contentType);
    await prisma.event.update({
      where: { id: event.id },
      data: { imageKey: key, imageUrl, imageWidth: size.width, imageHeight: size.height },
    });
    console.log(
      `[image] ${event.slug}: stored the source's own image (${size.width}x${size.height}, ${bytes.byteLength} bytes)`
    );
    return `/api/images/${key}`;
  } catch (err) {
    console.warn(`[image] ${event.slug}: could not fetch ${imageUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
