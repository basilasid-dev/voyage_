import { LIMITS, notes, parseLink, fail, type Platform } from "../validate";
import { readSourceMetadata, type SourceMetadata } from "./metadata";
import { extractFromText, type ExtractionResult, type TextSource } from "./places-text";
import type { FetchLike } from "./safe-fetch";

export interface Analysis {
  url: string | null;
  platform: Platform;
  metadata: SourceMetadata;
  caption: string;
  extraction: ExtractionResult;
}

const SKIPPED: SourceMetadata = {
  status: "skipped", reason: "No link was given. Only the text you pasted was read.", title: null, author: null, description: null, thumbnailUrl: null,
};

/**
 * Link and/or pasted text in, an honest analysis out:
 *   1. recognise the platform from the real domain;
 *   2. read whatever public metadata the platform allows (never pretending it worked when it did not);
 *   3. find places, activities and the destination in all the text we have (title, description, the user's caption).
 * At least one of `url` or `caption` is required.
 */
export async function analyzeSource(
  input: { url?: unknown; caption?: unknown },
  deps: { fetchImpl?: FetchLike } = {},
): Promise<Analysis> {
  const link = parseLink(input.url);
  const caption = notes(input.caption, "Caption", LIMITS.notes * 2);
  if (!link && !caption) fail("validation", "Paste a link, or paste the caption or description you want to read.");

  const metadata = link ? await readSourceMetadata(link, deps) : SKIPPED;
  const sources: TextSource[] = [];
  if (metadata.title) sources.push({ label: "title", text: metadata.title });
  if (metadata.description) sources.push({ label: "description", text: metadata.description });
  if (caption) sources.push({ label: "caption", text: caption });

  return {
    url: link?.url ?? null,
    platform: link?.platform ?? "manual",
    metadata,
    caption,
    extraction: extractFromText(sources),
  };
}

export type { SourceMetadata, ExtractionResult };
