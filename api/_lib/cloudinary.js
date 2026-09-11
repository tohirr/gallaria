// Server-side Cloudinary helpers (upload + admin API). Never import from the
// client: these need the API secret.
import { createHash } from "node:crypto";

export const CLOUD = "dbgxvkfqw";
export const FOLDER = "gallaria"; // new, attributed uploads
export const TAG = "gallaria";

function creds() {
  const { CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!key || !secret) throw new Error("CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set");
  return { key, secret };
}

// Cloudinary context is `k=v|k=v`. Values can't contain the two delimiters,
// and the API rejects anything outside the BMP ("Invalid encoding in
// context") — so emoji in an artist's display name are dropped.
const cleanValue = (v) =>
  String(v)
    .replace(/[|=]/g, " ")
    .replace(/[\u{10000}-\u{10FFFF}]/gu, "")
    // eslint-disable-next-line no-misleading-character-class -- zero-width + variation selectors, deliberately
    .replace(/[\u200B-\u200F\u2060-\u206F\uFE00-\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const encodeContext = (ctx) =>
  Object.entries(ctx)
    .map(([k, v]) => [k, v == null ? "" : cleanValue(v)])
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("|");

// Signed upload from a remote URL (allowed on every plan, unlike fetch).
export async function uploadFromUrl(fileUrl, publicId, context) {
  const { key, secret } = creds();
  const params = {
    public_id: publicId,
    folder: FOLDER,
    tags: TAG,
    context: encodeContext(context),
    // Re-linking the same tweet overwrites in place; purge the CDN so the
    // canvas never serves the stale copy.
    overwrite: "true",
    invalidate: "true",
    // Pre-generate the small rungs so the first visitor never waits on a
    // cold transform. Must match rungUrl() in src/lib/cloudinary.js exactly:
    // Cloudinary keys derived assets by the literal transformation string.
    eager: "c_limit,w_16,f_jpg,q_auto|c_limit,w_64,f_jpg,q_auto",
    eager_async: "true",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = createHash("sha1").update(toSign + secret).digest("hex");

  const body = new FormData();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  body.set("file", fileUrl);
  body.set("api_key", key);
  body.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `upload failed (${res.status})`);
  return data;
}

// Admin API: replace an existing asset's context.
export async function setContext(publicId, context) {
  const { key, secret } = creds();
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload/${publicId}`, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
      "content-type": "application/json",
    },
    body: JSON.stringify({ context: encodeContext(context) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `context update failed (${res.status})`);
  return data;
}
