import "server-only";
import { getDb } from "./connection";
import { searchJourneys as run, type SearchOptions } from "./search-core";
import type { SearchResult } from "../types";

export function searchJourneys(from: string, to: string, opts?: SearchOptions): SearchResult {
  return run(getDb(), from, to, opts);
}
