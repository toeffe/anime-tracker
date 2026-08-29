import type { SearchResultItem } from "../../types/shared";

const PRIORITY: Record<SearchResultItem["externalSource"], number> = {
  anilist: 0,
  jikan: 1,
  wikidata: 2,
};

function keyOf(item: SearchResultItem): string {
  const title = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${title}|${item.year ?? ""}`;
}

export function mergeSearchResults(groups: SearchResultItem[][]): SearchResultItem[] {
  const ranked = groups.flat().sort(
    (a, b) => PRIORITY[a.externalSource] - PRIORITY[b.externalSource]
  );
  const seen = new Set<string>();
  const out: SearchResultItem[] = [];
  for (const item of ranked) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 15) break;
  }
  return out;
}

export async function raceSources(
  jobs: Promise<SearchResultItem[]>[]
): Promise<SearchResultItem[]> {
  const settled = await Promise.allSettled(jobs);
  const lists: SearchResultItem[][] = [];
  let failures = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") lists.push(result.value);
    else failures += 1;
  }
  const merged = mergeSearchResults(lists);
  if (merged.length > 0) return merged;
  if (failures === jobs.length) {
    throw new Error("Couldn't reach metadata sources. Try again.");
  }
  return [];
}
