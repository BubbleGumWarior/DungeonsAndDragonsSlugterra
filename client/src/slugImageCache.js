// In-memory cache of slugs' transformed (velocity) art, so the counter-clash
// prompt can show the incoming slug the instant it opens instead of fetching
// and decoding it then. Warmed ahead of time: the moment a shooter arms a
// slug (before they pick a target) every client gets a signal and calls
// prefetchSlugImage -- see CounterClashPrompt and /actions/arm-slug.
//
// Fetched with the bearer token (an <img src> can't send one) into a blob URL,
// and decoded up front; the decoded Image is held alongside the URL so the
// browser keeps its decoded pixels around for the later <img>.

const MAX_ENTRIES = 40;

const cache = new Map(); // slugId -> { url, img }
const inflight = new Map(); // slugId -> Promise<string | null>

export function getCachedSlugImage(slugId) {
  return cache.get(slugId)?.url ?? null;
}

function remember(slugId, entry) {
  cache.set(slugId, entry);
  // Oldest-inserted first (Map keeps insertion order) -- drop the excess.
  while (cache.size > MAX_ENTRIES) {
    const [oldestId, oldest] = cache.entries().next().value;
    cache.delete(oldestId);
    URL.revokeObjectURL(oldest.url);
  }
}

export function prefetchSlugImage(slugId, token) {
  if (!Number.isInteger(slugId) || !token) return Promise.resolve(null);
  const cached = getCachedSlugImage(slugId);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(slugId)) return inflight.get(slugId);

  const request = (async () => {
    try {
      const res = await fetch(`/api/slugs/${slugId}/velocity-image`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const url = URL.createObjectURL(await res.blob());
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        // Not fatal -- it just won't be pre-decoded.
      }
      remember(slugId, { url, img });
      return url;
    } catch {
      return null; // best-effort; the prompt falls back to fetching on demand
    } finally {
      inflight.delete(slugId);
    }
  })();
  inflight.set(slugId, request);
  return request;
}
