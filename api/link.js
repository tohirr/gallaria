// Admin endpoint: attribute a work from a tweet, or hide a legacy one.
//
//   POST /api/link   headers: x-admin-token
//     { action: "link", tweet, photos?: number[] | "all", replaces? }
//     { action: "hide", public_id }
//
// Auth is a single shared token (ADMIN_TOKEN). It gates writes to the
// gallery's Cloudinary metadata only — nothing user-facing.
import { timingSafeEqual } from "node:crypto";
import { uploadFromUrl, setContext } from "./_lib/cloudinary.js";
import { linkTweet } from "./_lib/tweet.js";

function authorized(req) {
  const expected = process.env.ADMIN_TOKEN || "";
  const given = String(req.headers["x-admin-token"] || "");
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!authorized(req)) return res.status(401).json({ error: "bad token" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    if (body.action === "link") {
      const work = await linkTweet(
        // no `photos` → the /photo/N in the URL if any, else photo 1
        { tweet: body.tweet, photos: body.photos === "all" ? "all" : Array.isArray(body.photos) ? body.photos : undefined, replaces: body.replaces },
        uploadFromUrl
      );
      return res.status(200).json(work);
    }
    if (body.action === "hide") {
      if (!body.public_id) return res.status(400).json({ error: "public_id required" });
      await setContext(body.public_id, { hidden: "1" });
      return res.status(200).json({ hidden: body.public_id });
    }
    return res.status(400).json({ error: "unknown action" });
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
}
