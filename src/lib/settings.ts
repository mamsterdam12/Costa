import { prisma } from "@/lib/prisma";

const TRANSLATION_ENABLED_KEY = "translation_enabled";

// Manual circuit breaker for machine translation (src/lib/translation.ts),
// switched from /dashboard. No row yet = enabled (the default state).
// Deliberately manual-only, no auto-recovery timer: we don't want it
// silently retrying the OpenAI API on a schedule while credits are out.
export async function isTranslationEnabled(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: TRANSLATION_ENABLED_KEY } });
  return setting ? setting.value === "true" : true;
}

export async function setTranslationEnabled(enabled: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: TRANSLATION_ENABLED_KEY },
    update: { value: String(enabled) },
    create: { key: TRANSLATION_ENABLED_KEY, value: String(enabled) },
  });
}
