import { CLOUD_NAME, LEGACY_TAG, TAG, rungUrl, fullUrl } from "./lib/cloudinary";

// Two Cloudinary tags: attributed works (`gallaria`, uploaded from tweets with
// the artist as context) and the legacy collection (`african-art`). A legacy
// work disappears once an attributed upload names it in `replaces`, or when
// it's hidden by hand — that's the phase-out.
//
// /api/catalog reads both from the Admin API (fresh, edge-cached a minute).
// If it's unreachable, the public resource lists are the fallback.
async function fetchCatalog() {
  const fresh = sessionStorage.getItem("gallaria-fresh");
  sessionStorage.removeItem("gallaria-fresh");
  try {
    const res = await fetch(`/api/catalog${fresh ? `?t=${Date.now()}` : ""}`);
    if (res.ok) return await res.json();
  } catch {
    // fall through to the public lists
  }
  const list = (tag, legacy) =>
    fetch(`https://res.cloudinary.com/${CLOUD_NAME}/image/list/${tag}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { resources: [] }))
      .then((d) => (d.resources || []).map((r) => ({ ...r, legacy, context: r.context?.custom || {} })))
      .catch(() => []);
  return (await Promise.all([list(TAG, false), list(LEGACY_TAG, true)])).flat();
}

export async function loadCatalog() {
  const works = await fetchCatalog();
  const replaced = new Set(works.map((w) => w.context.replaces).filter(Boolean));

  return works
    .filter((w) => !w.context.hidden && !replaced.has(w.public_id))
    .map((w) => {
      const asset = {
        public_id: w.public_id,
        format: w.format || "jpg",
        width: w.width || 1,
        height: w.height || 1,
      };
      return {
        ...asset,
        legacy: w.legacy,
        aspectRatio: asset.width / asset.height,
        artist: w.context.artist
          ? { handle: w.context.artist, name: w.context.artist_name || `@${w.context.artist}` }
          : null,
        tweet: w.context.tweet || null,
        url: (width) => rungUrl(asset, width),
        full: fullUrl(asset),
      };
    });
}
