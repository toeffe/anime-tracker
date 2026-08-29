export const USER_AGENT = "AnimeTracker/0.1 (local desktop library)";

export function httpsUrl(url: string): string {
  return url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("A metadata source timed out.");
    }
    throw new Error("Couldn't reach a metadata source. Try again.");
  }
  if (res.status === 429) {
    throw new Error("A metadata source asked us to slow down. Try again in a moment.");
  }
  if (!res.ok) {
    throw new Error(`Metadata request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}
