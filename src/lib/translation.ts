import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";

const languageNames: Record<Locale, string> = {
  nl: "Dutch",
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  sv: "Swedish",
  da: "Danish",
};

// Model id is configurable via env, since provider-side naming can change
// without a code deploy; falls back to a sane default if unset.
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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
  if (text === sourceText) return text; // translation unavailable; don't cache a non-translation

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

// Never throws: any failure (missing key, bad model id, rate limit, network)
// falls back to the untranslated source text so a page never breaks on a
// translation problem -- it just stays in the source language a bit longer.
async function translateWithLLM(text: string, from: Locale, to: Locale): Promise<string> {
  if (!openai) {
    console.warn(
      `[translation] OPENAI_API_KEY not set; returning "${from}" text untranslated for "${to}".`
    );
    return text;
  }

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content:
            `Translate the following text from ${languageNames[from]} to ${languageNames[to]}. ` +
            `Reply with only the translation, no quotes, no explanation.\n\n${text}`,
        },
      ],
    });

    const translated = response.choices[0]?.message?.content?.trim();
    if (translated) {
      console.log(`[translation] ${from}->${to} via "${OPENAI_MODEL}" ok (${translated.length} chars)`);
    }
    return translated || text;
  } catch (err) {
    console.error(
      `[translation] OpenAI translation failed (model "${OPENAI_MODEL}", ${from}->${to}):`,
      err instanceof Error ? err.message : err
    );
    return text;
  }
}
