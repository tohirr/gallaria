# gallaria

An infinite, wrapping canvas of art by African artists. Drag to pan, scroll or
pinch to zoom, click a work to focus it.

No framework: one WebGL2 context, a handful of ES modules, and Vite for the dev
server and build.

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

Images come from Cloudinary (tag `african-art`). View counts go through
`api/views.js` to a Google Sheet.

## Dev

```
pnpm install
pnpm dev
```
