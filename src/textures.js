import { withSlot } from "./lib/loadQueue";

// Resolution ladder. Each rung is a real network request, so the pixelation
// IS the loading state. 16 and 64 are resident for every item (a few KB
// each); 512 is streamed in around the viewport and evicted by distance;
// 1600 is only fetched for the focused item.
export const TIERS = [16, 64, 512, 1600];
const MID = 512;
const HI = 1600;
const MID_BUDGET = 72; // resident 512px textures (~1.3MB each with mips)
const DISSOLVE_MS = 450;

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadImage(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  return img.decode().then(() => img);
}

export function createTextures(gl, items) {
  // Per-item GPU state lives on a side table so catalog items stay plain data.
  const state = new Map(
    items.map((it) => [
      it,
      {
        tex: new Map(), // tier -> WebGLTexture
        loading: new Set(), // tiers in flight
        a: null, // outgoing texture during a dissolve
        b: null, // incoming / current texture
        tierB: 0,
        t: 1, // dissolve progress 0..1
      },
    ])
  );
  let dissolving = 0;
  let onChange = () => {};

  function upload(img, tier) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Low rungs stay blocky when magnified: the pixels are the point.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, tier <= 64 ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  // Switch what an item displays, dissolving from whatever it showed before.
  function present(s, tier, animate = true) {
    const tex = s.tex.get(tier);
    if (!tex || s.b === tex) return;
    if (s.t < 1) dissolving -= 1;
    s.a = s.b || tex;
    s.b = tex;
    s.tierB = tier;
    if (animate && !reduceMotion && s.a !== s.b) {
      s.t = 0;
      dissolving += 1;
    } else {
      s.t = 1;
    }
    onChange();
  }

  // Fetch a rung unless it's resident or in flight. `still` lets a queued
  // request bail out once its slot frees if the item has since moved away.
  function ensure(item, tier, still = () => true) {
    const s = state.get(item);
    if (s.tex.has(tier) || s.loading.has(tier)) return Promise.resolve();
    s.loading.add(tier);
    return withSlot(async () => {
      if (!still()) return;
      try {
        const img = await loadImage(item.url(tier));
        s.tex.set(tier, upload(img, tier));
        if (tier > s.tierB) present(s, tier);
      } catch {
        // a missing rung just means we stay on the previous one
      }
    }).finally(() => s.loading.delete(tier));
  }

  function evict(s, tier) {
    const tex = s.tex.get(tier);
    if (!tex) return;
    s.tex.delete(tier);
    if (s.b === tex || s.a === tex) {
      // Fall back to the best remaining rung without animating; eviction
      // only happens off-screen.
      const best = Math.max(...[...s.tex.keys()]);
      if (s.t < 1) dissolving -= 1;
      s.t = 1;
      s.a = s.b = s.tex.get(best);
      s.tierB = best;
    }
    gl.deleteTexture(tex);
  }

  // Which rung an item on screen at `cssWidth` deserves.
  function wantedTier(cssWidth, focused) {
    const px = cssWidth * Math.min(2, devicePixelRatio || 1);
    if (px <= 80) return 64;
    if (px <= 400 || !focused) return MID; // the focused work gets the top rung once 512 would soften
    return HI;
  }

  return {
    get(item) {
      return state.get(item);
    },

    // Every 16px rung, reporting progress; then every 64px rung in the background.
    async bootstrap(onProgress) {
      let n = 0;
      await Promise.all(
        items.map((it) => ensure(it, 16).then(() => onProgress(++n / items.length)))
      );
      items.forEach((it) => ensure(it, 64));
    },

    // Advance dissolves. Returns true while anything is still animating.
    update(dt) {
      if (dissolving === 0) return false;
      for (const s of state.values()) {
        if (s.t < 1) {
          s.t = Math.min(1, s.t + dt / DISSOLVE_MS);
          if (s.t >= 1) dissolving -= 1;
        }
      }
      return dissolving > 0;
    },

    // Stream the 512 rung in by distance to the camera and evict the farthest
    // when over budget. Called on a slow tick, not every frame.
    maintain(camera, focused) {
      const { vw, vh, zoom } = camera;
      const near = [];
      const far = [];
      for (const item of items) {
        const { x, y, w, h } = item.rect;
        const { dx, dy } = camera.delta(x + w / 2, y + h / 2);
        const inX = Math.abs(dx) < vw / (2 * zoom) + w / 2 + vw / (2 * zoom);
        const inY = Math.abs(dy) < vh / (2 * zoom) + h / 2 + vh / (2 * zoom);
        const d2 = dx * dx + dy * dy;
        const want = wantedTier(w * zoom, item === focused);
        (inX && inY && want >= MID ? near : far).push({ item, d2, want });
      }
      near.sort((p, q) => p.d2 - q.d2);

      for (const { item, want } of near) {
        const s = state.get(item);
        const still = () => {
          const { dx, dy } = camera.delta(item.rect.x + item.rect.w / 2, item.rect.y + item.rect.h / 2);
          return Math.abs(dx) < vw / zoom + item.rect.w && Math.abs(dy) < vh / zoom + item.rect.h;
        };
        ensure(item, MID, still);
        if (want === HI) ensure(item, HI, still);
        else if (s.tex.has(HI) && item !== focused) evict(s, HI);
      }

      let resident = items.filter((it) => state.get(it).tex.has(MID)).length;
      if (resident > MID_BUDGET) {
        far.sort((p, q) => q.d2 - p.d2);
        for (const { item } of far) {
          if (resident <= MID_BUDGET) break;
          const s = state.get(item);
          if (s.tex.has(MID)) {
            evict(s, HI);
            evict(s, MID);
            resident -= 1;
          }
        }
      }
    },

    onChange(fn) {
      onChange = fn;
    },
  };
}
