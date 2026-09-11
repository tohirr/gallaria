#!/usr/bin/env node
// Batch attribution from tweets — the same pipeline as /api/link, run locally.
//
//   node scripts/ingest.mjs [--dry-run]
//
// Reads src/data/tweets.txt: one tweet URL per line, optional photo numbers
// (`2` / `1,3` / `all`; numbers the tweet lacks are ignored; a `/photo/N` in
// the URL counts as the number when none is given), and an optional
// `# <legacy public_id>` comment naming the work it replaces
// (the attribution checklist's export writes exactly this). Each tweet's
// original-size photo is uploaded to Cloudinary with the tweet, artist and
// `replaces` as context; the site hides replaced legacy works automatically.
//
// Needs CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (from .env or the env).

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { uploadFromUrl, CLOUD, TAG } from "../api/_lib/cloudinary.js";
import { linkTweet, resolveTweet, TWEET_RE, photoInUrl } from "../api/_lib/tweet.js";

const dryRun = process.argv.includes("--dry-run");
if (existsSync(".env")) process.loadEnvFile(".env");

const text = await readFile(new URL("../src/data/tweets.txt", import.meta.url), "utf8").catch(() => "");
const entries = [];
for (const raw of text.split("\n")) {
  const [code, comment = ""] = raw.split("#");
  const line = code.trim();
  if (!line) continue;
  const [url, pick] = line.split(/\s+/);
  if (!TWEET_RE.test(url)) {
    console.warn(`skip (not a tweet url): ${line}`);
    continue;
  }
  const photos = !pick ? [photoInUrl(url) || 1] : pick === "all" ? "all" : pick.split(",").map(Number);
  entries.push({ tweet: url, photos, replaces: comment.trim() || undefined });
}

// Skip tweets already in the gallery.
const existing = await fetch(`https://res.cloudinary.com/${CLOUD}/image/list/${TAG}.json`, { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : { resources: [] }))
  .catch(() => ({ resources: [] }));
const linked = new Set(existing.resources.map((r) => r.context?.custom?.tweet).filter(Boolean));

let ok = 0;
for (const e of entries) {
  try {
    if (dryRun) {
      const info = await resolveTweet(e.tweet);
      const picks = (e.photos === "all" ? info.photos : e.photos.map((n) => info.photos[n - 1])).filter(Boolean);
      if (picks.length === 0) throw new Error(`tweet has ${info.photos.length} photos; none selected`);
      const sizes = picks.map((p) => `${p.width}x${p.height}`).join(", ");
      console.log(`would link @${info.artist.handle} ${sizes}${e.replaces ? `  replaces ${e.replaces}` : ""}${linked.has(info.url) ? "  (already linked)" : ""}`);
    } else {
      const r = await linkTweet(e, uploadFromUrl);
      console.log(`linked ${r.works.map((w) => w.public_id).join(", ")}  @${r.artist.handle}${e.replaces ? `  replaces ${e.replaces}` : ""}`);
    }
    ok += 1;
  } catch (err) {
    console.warn(`✗ ${e.tweet} — ${err.message}`);
  }
}
console.log(`${dryRun ? "resolved" : "linked"} ${ok}/${entries.length}`);
