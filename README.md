# gallaria

An infinite, wrapping canvas of African visual culture found on the timeline.
Drag to pan, scroll or pinch to zoom, then click a work to focus it. Every
attributed work links to its creator and to the tweet it came from.

No framework: one WebGL2 context, a handful of ES modules, Vite for the dev
server and build, and two Vercel functions (`api/catalog.js`, `api/link.js`).

## How it works

- **Layout** (`src/layout.js`) packs every image into one tile of world space.
  Each column is stretched to exactly the tile height and phase-shifted, so the
  tile repeats seamlessly in both axes and the canvas has no edges.
- **Renderer** (`src/renderer.js`) draws every wrapped copy of every quad that
  intersects the viewport, plus a world-space dot grid behind them.
- **Textures** (`src/textures.js`) climb a resolution ladder: 16 px and 64 px
  rungs for every image up front (a few KB each, nearest-filtered so the pixels
  are honest), 512 px streamed in around the camera and evicted by distance,
  1600 px only for the focused work. Every rung change dissolves in through an
  8x8 Bayer ordered-dither threshold in the fragment shader.
- **Camera / input** (`src/camera.js`, `src/input.js`) follow Figma conventions:
  drag or two-finger scroll pans, pinch or ctrl/cmd+wheel zooms about the
  cursor, arrows / `+` / `-` / `0` / `Esc` on the keyboard, momentum on release.

## Data

Cloudinary (cloud `dbgxvkfqw`) is the store. Two tags:

- `gallaria` — attributed works, uploaded from tweets. Each asset carries its
  attribution as context metadata: `tweet`, `artist`, `artist_name`, and
  optionally `replaces` (the legacy work it supersedes).
- `african-art` — the original collection, being phased out. A legacy work
  stays on the canvas until an attributed upload names it in `replaces`, or it
  is hidden (`hidden=1` in context).

`GET /api/catalog` (`api/catalog.js`) reads both tags from the Admin API with
context, edge-cached for a minute. If the Admin API is unavailable it falls
back to the public resource lists, which lag by a few minutes.

## Attribution

Open the site with `?admin=<token>` once (the token is remembered on that
device, so `?admin` is enough afterwards). The bar at the top
takes a tweet URL and, for multi-photo tweets, which photos to add (toggle 1–4;
numbers the tweet doesn't have are ignored):

- with a legacy work focused, **link** uploads the tweet's original-size photo
  with its attribution and marks the legacy work as replaced;
- with nothing (or an attributed work) focused, **link** adds a new work;
- **hide** retires a legacy work that can't be traced.

`POST /api/link` (`api/link.js`) does the work: it resolves the tweet through
the fxtwitter API, uploads to Cloudinary from the image URL with `overwrite` +
`invalidate` (re-linking is idempotent) and eagerly generates the 16/64 px
rungs so a new work never shows a cold transform.

For batches, `node scripts/ingest.mjs [--dry-run]` runs the same pipeline over
`src/data/tweets.txt`. `node scripts/warm.mjs` re-warms the CDN for the small
rungs of every work (run after changing rung URLs).

## Dev

```
pnpm install
pnpm dev
```

`.env` (not committed):

```
CLOUDINARY_API_KEY=…
CLOUDINARY_API_SECRET=…
ADMIN_TOKEN=…
```

The same three variables must be set in the Vercel project for `/api/catalog`
and `/api/link` to work in production. `vite.config.js` serves the `api/`
functions locally so `/api/*` works under `pnpm dev`.
