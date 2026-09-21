import { useEffect, useState } from "react";
import { getCachedSlugImage, prefetchSlugImage } from "./slugImageCache.js";

// The slug's cached transformed art, or null while it's still loading (or it
// has none). Usually a synchronous hit on the first render, since the image
// was prefetched when the shooter armed the slug.
export function useSlugImage(slugId, token) {
  const [url, setUrl] = useState(() => getCachedSlugImage(slugId));

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedSlugImage(slugId);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    setUrl(null);
    prefetchSlugImage(slugId, token).then((loaded) => {
      if (!cancelled && loaded) setUrl(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [slugId, token]);

  return url;
}
