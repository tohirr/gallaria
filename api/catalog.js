// The catalog: every work in both Cloudinary tags with its attribution
// context, fresh from the Admin API. Edge-cached for a minute so the Admin
// API's 500 req/hour budget is never in the request path.
//
//   GET /api/catalog  → [{ public_id, format, width, height, legacy, context }]
import { CLOUD, TAG } from "./_lib/cloudinary.js";

const LEGACY_TAG = "african-art";

async function listTag(tag) {
  const { CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const out = [];
  let cursor = "";
  do {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/tags/${tag}?max_results=500&context=true${cursor ? `&next_cursor=${cursor}` : ""}`;
    // A slow Admin API must not hold up first paint: past 4s, fall back.
    const res = await fetch(url, { headers: { authorization: auth }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`admin api ${res.status}`);
    const data = await res.json();
    out.push(...data.resources);
    cursor = data.next_cursor || "";
  } while (cursor);
  return out;
}

// If the Admin API is unavailable (rate limit, outage) fall back to the
// public resource lists, which lag by a few minutes but always answer.
const publicList = (tag) =>
  fetch(`https://res.cloudinary.com/${CLOUD}/image/list/${tag}.json`)
    .then((r) => (r.ok ? r.json() : { resources: [] }))
    .then((d) => d.resources || []);

const compact = (r, legacy) => ({
  public_id: r.public_id,
  format: r.format,
  width: r.width,
  height: r.height,
  legacy,
  context: r.context?.custom || {},
});

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  let source = "admin";
  let works;
  try {
    const [fresh, legacy] = await Promise.all([listTag(TAG), listTag(LEGACY_TAG)]);
    works = [...fresh.map((r) => compact(r, false)), ...legacy.map((r) => compact(r, true))];
  } catch {
    source = "public-list";
    const [fresh, legacy] = await Promise.all([publicList(TAG), publicList(LEGACY_TAG)]);
    works = [...fresh.map((r) => compact(r, false)), ...legacy.map((r) => compact(r, true))];
  }
  res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=600");
  res.setHeader("x-catalog-source", source);
  return res.status(200).json(works);
}
