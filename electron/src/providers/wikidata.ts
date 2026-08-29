import type { SearchResultItem, Trailer } from "../../types/shared";
import { fetchJson, httpsUrl, USER_AGENT } from "./http";
import { trailerFromSite } from "./trailerFormat";

interface SparqlBinding {
  item?: { value: string };
  itemLabel?: { value: string };
  year?: { value: string };
  poster?: { value: string };
  pic?: { value: string };
  enwiki?: { value: string };
  desc?: { value: string };
}

function qidFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1] ?? uri;
}

function escapeSparql(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 80);
}

export async function fetchWikidataTrailer(qid: string): Promise<Trailer | null> {
  if (!/^Q\d+$/i.test(qid)) return null;
  const sparql = `
    SELECT ?yt WHERE {
      wd:${qid.toUpperCase()} wdt:P1651 ?yt.
    }
    LIMIT 1
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`;
  const data = await fetchJson<{
    results?: { bindings?: { yt?: { value: string } }[] };
  }>(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });
  const yt = data.results?.bindings?.[0]?.yt?.value;
  return trailerFromSite("youtube", yt);
}

function posterFromPic(pic: string | undefined): string | null {
  if (!pic) return null;
  return httpsUrl(`${pic}${pic.includes("?") ? "&" : "?"}width=500`);
}

function cleanImageUrl(url: string): string {
  const cut = url.indexOf("?");
  return httpsUrl(cut === -1 ? url : url.slice(0, cut));
}

async function fetchWikipediaPoster(title: string): Promise<string | null> {
  const slug = encodeURIComponent(title.trim().replace(/ /g, "_"));
  if (!slug) return null;
  try {
    const data = await fetchJson<{
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const src = data.originalimage?.source ?? data.thumbnail?.source;
    return src ? cleanImageUrl(src) : null;
  } catch {
    return null;
  }
}

async function posterForRow(row: SparqlBinding): Promise<string | null> {
  const fromWikidata = posterFromPic(row.poster?.value) ?? posterFromPic(row.pic?.value);
  if (fromWikidata) return fromWikidata;
  if (!row.enwiki?.value) return null;
  return fetchWikipediaPoster(row.enwiki.value);
}

export async function fetchWikidataFilm(qid: string): Promise<SearchResultItem> {
  if (!/^Q\d+$/i.test(qid)) {
    throw new Error("Wikidata title not found.");
  }
  const id = qid.toUpperCase();
  const sparql = `
    SELECT ?itemLabel ?year ?poster ?pic ?enwiki ?desc WHERE {
      BIND(wd:${id} AS ?item)
      OPTIONAL { ?item wdt:P577 ?date. BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?item wdt:P3383 ?poster. }
      OPTIONAL { ?item wdt:P18 ?pic. }
      OPTIONAL {
        ?wikipage schema:about ?item ;
                  schema:isPartOf <https://en.wikipedia.org/> ;
                  schema:name ?enwiki.
      }
      OPTIONAL { ?item schema:description ?desc. FILTER(LANG(?desc) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 1
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`;
  const data = await fetchJson<{
    results?: { bindings?: SparqlBinding[] };
  }>(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });
  const row = data.results?.bindings?.[0];
  const title = row?.itemLabel?.value;
  if (!title) throw new Error("Wikidata title not found.");
  return {
    externalSource: "wikidata",
    externalId: id,
    kind: "movie",
    title,
    posterUrl: await posterForRow(row),
    overview: row.desc?.value ?? null,
    year: row.year?.value ? Number(row.year.value) || null : null,
    episodeCount: null,
  };
}

export async function searchWikidataFilms(term: string): Promise<SearchResultItem[]> {
  const q = escapeSparql(term.trim());
  if (!q) return [];

  const sparql = `
    SELECT DISTINCT ?item ?itemLabel ?year ?poster ?pic ?enwiki ?desc WHERE {
      SERVICE wikibase:mwapi {
        bd:serviceParam wikibase:api "EntitySearch".
        bd:serviceParam wikibase:endpoint "www.wikidata.org".
        bd:serviceParam mwapi:search "${q}".
        bd:serviceParam mwapi:language "en".
        ?item wikibase:apiOutputItem mwapi:item.
      }
      ?item wdt:P31/wdt:P279* wd:Q11424.
      OPTIONAL { ?item wdt:P577 ?date. BIND(YEAR(?date) AS ?year) }
      OPTIONAL { ?item wdt:P3383 ?poster. }
      OPTIONAL { ?item wdt:P18 ?pic. }
      OPTIONAL {
        ?wikipage schema:about ?item ;
                  schema:isPartOf <https://en.wikipedia.org/> ;
                  schema:name ?enwiki.
      }
      OPTIONAL { ?item schema:description ?desc. FILTER(LANG(?desc) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 8
  `;

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`;
  const data = await fetchJson<{
    results?: { bindings?: SparqlBinding[] };
  }>(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });

  const seen = new Set<string>();
  const pending: Promise<SearchResultItem>[] = [];
  for (const row of data.results?.bindings ?? []) {
    const uri = row.item?.value;
    const title = row.itemLabel?.value;
    if (!uri || !title) continue;
    const id = qidFromUri(uri);
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(
      posterForRow(row).then((posterUrl) => ({
        externalSource: "wikidata" as const,
        externalId: id,
        kind: "movie" as const,
        title,
        posterUrl,
        overview: row.desc?.value ?? null,
        year: row.year?.value ? Number(row.year.value) || null : null,
        episodeCount: null,
      }))
    );
  }
  return Promise.all(pending);
}
