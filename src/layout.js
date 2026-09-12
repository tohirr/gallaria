// Scatters every item across one tile of world space. The tile repeats in
// both axes, so the canvas has no edges. Placement is "best candidate": each
// work tries a batch of seeded random spots and keeps the one with the most
// clearance from everything already placed (measured across the wrap), which
// gives an even, blue-noise field rather than clumps and voids. Positions
// are seeded from each work's id, so the arrangement is stable across reloads.
export const COL_W = 320; // every work is this wide
export const GAP = 220; // typical breathing room around a work: the works float, they don't tile
export const BLOCK = 8; // world units per dissolve block

export const MIN_GAP = GAP / 2; // no two works ever come closer than this
const FILL = 0.65; // fraction of the tile covered by works plus their breathing room
const CANDIDATES = 40; // spots tried per work; the clearest valid one wins
const MAX_TRIES = 400; // give up on a tile this tight and grow it

// FNV-1a: a stable seed from a string.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small, fast, deterministic.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shortest distance between two coordinates on a wrapping axis.
const wrapDist = (a, b, n) => {
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
};

// Clearance between a candidate rect (by centre) and a placed one: the larger
// of the per-axis gaps. Negative means the rects overlap.
function clearance(cx, cy, w, h, other, tile) {
  const gx = wrapDist(cx, other.cx, tile) - (w + other.w) / 2;
  const gy = wrapDist(cy, other.cy, tile) - (h + other.h) / 2;
  return Math.max(gx, gy);
}

export function layout(items) {
  const sized = items.map((item) => ({
    item,
    w: COL_W,
    h: Math.round(COL_W / item.aspectRatio),
  }));
  // biggest first packs best; ties by id keep the order stable
  sized.sort((a, b) => b.w * b.h - a.w * a.h || a.item.public_id.localeCompare(b.item.public_id));

  const padded = sized.reduce((s, e) => s + (e.w + GAP) * (e.h + GAP), 0);
  let tile = Math.ceil(Math.sqrt(padded / FILL));

  for (;;) {
    const placed = [];
    let ok = true;
    for (const e of sized) {
      const next = rng(hash(e.item.public_id));
      let best = null;
      let bestClear = -Infinity;
      for (let i = 0; i < MAX_TRIES; i++) {
        const cx = next() * tile;
        const cy = next() * tile;
        let clear = Infinity;
        for (const o of placed) {
          clear = Math.min(clear, clearance(cx, cy, e.w, e.h, o, tile));
          if (clear < MIN_GAP) break;
        }
        if (clear >= MIN_GAP && clear > bestClear) {
          best = { cx, cy };
          bestClear = clear;
        }
        if (best && i >= CANDIDATES - 1) break;
      }
      if (!best) {
        ok = false;
        break;
      }
      placed.push({ ...best, w: e.w, h: e.h, e });
    }
    if (ok) {
      for (const p of placed) {
        p.e.item.rect = { x: Math.round(p.cx - p.w / 2), y: Math.round(p.cy - p.h / 2), w: p.w, h: p.h };
      }
      return { tileW: tile, tileH: tile };
    }
    tile = Math.ceil(tile * 1.08); // too tight: a roomier tile, same seeds
  }
}

const mod = (a, n) => ((a % n) + n) % n;

// Which item sits under a world point, accounting for wrap.
export function hitTest(items, tile, wx, wy) {
  for (const item of items) {
    const { x, y, w, h } = item.rect;
    if (mod(wx - x, tile.tileW) < w && mod(wy - y, tile.tileH) < h) return item;
  }
  return null;
}
