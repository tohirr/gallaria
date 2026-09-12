#!/usr/bin/env node
// Attribute the legacy works by handle. The original local images were named
// after the artist's X handle (src/data/artists.json is that list), and
// the Cloudinary public_id still carries the name: "african-art/bad_oats_b2qeuf"
// → @bad_oats. For every legacy work with no `artist` in its context, derive
// the handle and write it, so the caption links to the artist's profile even
// before the work is linked to its post. A name ending in a tweet id
// ("mendezmendezart_1837138020157337605") gets the post too.
//
//   node scripts/attribute-legacy.mjs --dry-run   # show the plan
//   node scripts/attribute-legacy.mjs             # write the context
//
// Needs CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (from .env, .env.local or the env).
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { setContext, CLOUD } from "../api/_lib/cloudinary.js";

const LEGACY_TAG = "african-art";
const dryRun = process.argv.includes("--dry-run");
for (const f of [".env", ".env.local"]) if (existsSync(f)) process.loadEnvFile(f);

const handles = JSON.parse(await readFile(new URL("../src/data/artists.json", import.meta.url), "utf8"));
const known = new Map(handles.map((h) => [h.toLowerCase(), h]));

// Twitter media keys got into the handle list from a few filenames
// ("F7ohRnoXMAAvJsG"): 15 chars of mixed case and digits, never a handle.
const looksLikeMediaKey = (s) => /^[FG][A-Za-z0-9_-]{14}$/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);

// Names that aren't in the list but are unmistakably handles.
const EXTRA = new Set(["Sisanthegrea8"]);

function derive(publicId) {
  let base = publicId.split("/").pop().replace(/_[a-z0-9]{6}$/i, ""); // drop cloudinary's suffix
  let tweetId = null;
  const m = /^(.*)_(\d{15,})$/.exec(base); // "<handle>_<tweet id>"
  if (m) {
    base = m[1];
    tweetId = m[2];
  }
  if (looksLikeMediaKey(base)) return null;
  const hit = (s) => known.get(s.toLowerCase()) || (EXTRA.has(s) ? s : null) || (tweetId && s) || null;
  // "AnthonyAzekwoh2" is a second work by @AnthonyAzekwoh when the plain
  // handle is in the list too; otherwise the digit is part of the handle
  const plain = base.replace(/_?\d+$/, "");
  const handle = hit(base) && !(plain !== base && known.has(plain.toLowerCase())) ? hit(base) : hit(plain);
  if (!handle) return null;
  return { handle, tweet: tweetId ? `https://x.com/${handle}/status/${tweetId}` : null };
}

async function listLegacy() {
  const { CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!key || !secret) throw new Error("CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set");
  const out = [];
  let cursor;
  do {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/tags/${LEGACY_TAG}?max_results=500&context=true${cursor ? `&next_cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: { authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64") } });
    if (!res.ok) throw new Error(`admin api ${res.status}`);
    const data = await res.json();
    out.push(...data.resources);
    cursor = data.next_cursor;
  } while (cursor);
  return out;
}

const works = await listLegacy();
let done = 0;
const skipped = [];
for (const w of works) {
  const ctx = w.context?.custom || {};
  if (ctx.artist) continue; // already attributed
  const d = derive(w.public_id);
  if (!d) {
    skipped.push(w.public_id);
    continue;
  }
  const next = { ...ctx, artist: d.handle, ...(d.tweet ? { tweet: d.tweet } : {}) };
  const line = `${w.public_id}  →  @${d.handle}${d.tweet ? `  ${d.tweet}` : ""}`;
  if (dryRun) {
    console.log(`would set  ${line}`);
  } else {
    try {
      await setContext(w.public_id, next);
      console.log(`set  ${line}`);
    } catch (err) {
      console.warn(`✗ ${w.public_id} — ${err.message}`);
      continue;
    }
  }
  done += 1;
}
console.log(`\n${dryRun ? "would attribute" : "attributed"} ${done} of ${works.length} legacy works; ${skipped.length} without a recognisable handle:`);
console.log(skipped.map((p) => `  ${p}`).join("\n"));
