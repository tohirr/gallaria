// Packs every item into one tile of world space. The tile repeats in both
// axes, so the canvas has no edges: every column is stretched to exactly the
// tile height (its gaps absorb the slack) and columns are phase-shifted so the
// wrap seam never lines up into a visible row.
export const COL_W = 320;
export const GAP = 32;
export const BLOCK = 8; // world units per dissolve block

export function layout(items) {
  const pitch = COL_W + GAP;
  const area = items.reduce((s, it) => s + pitch * (COL_W / it.aspectRatio + GAP), 0);
  const cols = Math.max(2, Math.round(Math.sqrt(area) / pitch));

  const heights = new Array(cols).fill(0);
  const columns = Array.from({ length: cols }, () => []);
  for (const item of items) {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c]) c = i;
    const h = Math.round(COL_W / item.aspectRatio);
    columns[c].push({ item, h });
    heights[c] += h + GAP;
  }

  const tileW = cols * pitch;
  const tileH = Math.ceil(Math.max(...heights));

  columns.forEach((list, c) => {
    const used = list.reduce((s, e) => s + e.h, 0);
    const gap = list.length ? (tileH - used) / list.length : 0;
    // golden-ratio phase per column keeps the seam from aligning
    let y = ((c * 0.618034) % 1) * tileH;
    for (const { item, h } of list) {
      item.rect = { x: c * pitch, y: y % tileH, w: COL_W, h };
      y += h + gap;
    }
  });

  return { tileW, tileH };
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
