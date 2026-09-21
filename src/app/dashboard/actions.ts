"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isTranslationEnabled, setTranslationEnabled } from "@/lib/settings";

export async function toggleTranslation() {
  const enabled = await isTranslationEnabled();
  await setTranslationEnabled(!enabled);
  revalidatePath("/dashboard");
}

export async function toggleSourceActive(sourceId: string, active: boolean) {
  await prisma.source.update({ where: { id: sourceId }, data: { active } });
  revalidatePath("/dashboard");
}

export async function clearSourceReview(sourceId: string) {
  await prisma.source.update({ where: { id: sourceId }, data: { needsReview: false } });
  revalidatePath("/dashboard");
}
