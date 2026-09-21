import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Proxies objects out of the private "costa-media" bucket -- Railway
// buckets have no public URL mode, so this is how generated event images
// (and later, other media) get served to the browser.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const image = await getImage(key.join("/"));
  if (!image?.body) return new NextResponse(null, { status: 404 });

  return new NextResponse(image.body, {
    headers: {
      "Content-Type": image.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
