import { CLOUD_LIST_URL, rungUrl, fullUrl } from "./lib/cloudinary";

// Fetch the Cloudinary tag listing and merge view counts from the Sheets API.
// Returns items sorted by views, most viewed first.
export async function loadCatalog() {
  const cld = await fetch(CLOUD_LIST_URL)
    .then((r) => r.json())
    .catch(() => ({ resources: [] }));

  const rows = await fetch("/api/views")
    .then((r) => r.json())
    .catch(() => []);
  const views = new Map(
    (Array.isArray(rows) ? rows : []).map((x) => [x.public_id, Number(x.views) || 0])
  );

  return (cld.resources || [])
    .map((r) => {
      const asset = {
        public_id: r.public_id,
        format: r.format || "jpg",
        width: r.width || 1,
        height: r.height || 1,
      };
      return {
        ...asset,
        aspectRatio: asset.width / asset.height,
        views: views.get(asset.public_id) ?? 0,
        url: (w) => rungUrl(asset, w),
        full: fullUrl(asset),
      };
    })
    .sort((a, b) => b.views - a.views);
}

// Fire-and-forget view count; the UI doesn't wait on it.
export function recordView(item) {
  item.views += 1;
  fetch("/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_id: item.public_id }),
  }).catch(() => {});
}
