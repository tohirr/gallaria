#!/usr/bin/env node
// Warm the CDN: request the small rungs of every work once so no visitor
// ever waits on a cold Cloudinary transform. Run after changing rung URLs.
//
//   node scripts/warm.mjs
import { CLOUD } from "../api/_lib/cloudinary.js";

const TAGS = ["gallaria", "african-art"];
const WIDTHS = [16, 64];
const CONCURRENCY = 8;

const rung = (r, w) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/c_limit,w_${w},${w <= 64 ? "f_jpg" : "f_auto"},q_auto/${r.public_id}.${r.format || "jpg"}`;

const resources = (
  await Promise.all(
    TAGS.map((t) =>
      fetch(`https://res.cloudinary.com/${CLOUD}/image/list/${t}.json`)
        .then((r) => (r.ok ? r.json() : { resources: [] }))
        .then((d) => d.resources || [])
    )
  )
).flat();

const urls = resources.flatMap((r) => WIDTHS.map((w) => rung(r, w)));
let i = 0;
let ok = 0;
let bytes = 0;
const t0 = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const res = await fetch(url).catch(() => null);
      if (res?.ok) {
        ok += 1;
        bytes += Number(res.headers.get("content-length")) || 0;
      }
    }
  })
);
console.log(`${ok}/${urls.length} rungs warm · ${(bytes / 1024).toFixed(0)} KB · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
