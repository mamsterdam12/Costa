import OpenAI from "openai";
import { prisma } from "./prisma";
import { storageAvailable, uploadImage } from "./storage";

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

type EventForImage = {
  id: string;
  slug: string;
  imageKey: string | null;
  title: string;
  description: string;
  venueName: string | null;
  categoryName: string;
};

// Called at ingestion time (the seed script today; a future scraping
// script tomorrow) rather than on page render, so a page load never waits
// on image generation and a given event is only ever generated once.
// Returns the URL to render in an <img src>. Returns null if generation
// isn't possible right now (no credits, storage not configured, API
// error) -- a missing photo is never worth blocking ingestion over.
export async function getOrGenerateEventImageUrl(event: EventForImage): Promise<string | null> {
  if (event.imageKey) return `/api/images/${event.imageKey}`;
  if (!openai || !storageAvailable()) return null;

  const key = `events/${event.slug}.png`;

  try {
    const prompt =
      `A realistic photograph (not an illustration, not a drawing, not a painting) representing the event ` +
      `"${event.title}" (${event.categoryName}) at ${event.venueName || "a venue in Marbella, Spain"}. ` +
      `${event.description} ` +
      `Photojournalistic style, natural lighting, shot on a camera, candid, no text or logos in the image.`;

    const response = await openai.images.generate({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      console.error(`[image] No image data returned for event ${event.slug}`);
      return null;
    }

    await uploadImage(key, Buffer.from(b64, "base64"), "image/png");

    await prisma.event.update({ where: { id: event.id }, data: { imageKey: key } });

    console.log(`[image] Generated and stored image for event ${event.slug}`);
    return `/api/images/${key}`;
  } catch (err) {
    console.error(
      `[image] Generation failed for event ${event.slug} (model "${OPENAI_IMAGE_MODEL}"):`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
