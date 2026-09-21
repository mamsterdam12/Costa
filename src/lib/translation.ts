import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const languageNames: Record<Locale, string> = {
  nl: "Dutch",
  en: "English",
  es: "Spanish",
};

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

type TranslateFieldInput = {
  entityType: string; // "event", "region", "eventCategory", later "business", "listing", ...
  entityId: string;
  field: string; // "title", "description", "name", ...
  sourceText: string;
  sourceLocale: Locale;
  targetLocale: Locale;
};

// The one place in the platform that turns source-language content into
// another locale. Every module stores its content once, in whatever
// language it was authored/found in, and calls this for anything else --
// it checks the shared Translation cache first, and only falls back to the
// LLM (and caches the result) on a genuine cache miss.
export async function getTranslatedField({
  entityType,
  entityId,
  field,
  sourceText,
  sourceLocale,
  targetLocale,
}: TranslateFieldInput): Promise<string> {
  if (!sourceText) return sourceText;
  if (targetLocale === sourceLocale) return sourceText;

  const cached = await prisma.translation.findUnique({
    where: {
      entityType_entityId_field_locale: { entityType, entityId, field, locale: targetLocale },
    },
  });
  if (cached) return cached.text;

  const text = await translateWithLLM(sourceText, sourceLocale, targetLocale);

  await prisma.translation.upsert({
    where: {
      entityType_entityId_field_locale: { entityType, entityId, field, locale: targetLocale },
    },
    update: { text, source: "MACHINE" },
    create: { entityType, entityId, field, locale: targetLocale, text, source: "MACHINE" },
  });

  return text;
}

// Convenience for translating several fields of the same entity (e.g. an
// event's title + description) in parallel, each independently cached.
export async function getTranslatedFields<T extends Record<string, string>>(
  entityType: string,
  entityId: string,
  sourceLocale: Locale,
  targetLocale: Locale,
  fields: T
): Promise<T> {
  if (targetLocale === sourceLocale) return fields;

  const entries = Object.entries(fields) as [keyof T & string, string][];
  const translated = await Promise.all(
    entries.map(([field, sourceText]) =>
      getTranslatedField({ entityType, entityId, field, sourceText, sourceLocale, targetLocale })
    )
  );

  return Object.fromEntries(entries.map(([field], i) => [field, translated[i]])) as T;
}

async function translateWithLLM(text: string, from: Locale, to: Locale): Promise<string> {
  if (!anthropic) {
    console.warn(
      `[translation] ANTHROPIC_API_KEY not set; returning "${from}" text untranslated for "${to}".`
    );
    return text;
  }

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          `Translate the following text from ${languageNames[from]} to ${languageNames[to]}. ` +
          `Reply with only the translation, no quotes, no explanation.\n\n${text}`,
      },
    ],
  });

  const block = message.content[0];
  return block?.type === "text" ? block.text.trim() : text;
}
