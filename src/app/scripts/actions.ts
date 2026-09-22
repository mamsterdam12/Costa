"use server";

import { revalidatePath } from "next/cache";
import { runScraperForSource } from "@/scrapers/run";

export async function runScraper(sourceId: string, force = false) {
  const summary = await runScraperForSource(sourceId, { force });
  console.log(`[scrape] ${summary.sourceName}: ${summary.status}`);
  for (const note of summary.notes) console.log(`         - ${note}`);
  revalidatePath("/scripts");
  revalidatePath("/bronnen");
  revalidatePath("/dashboard");
  revalidatePath("/marbella");
}
