const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Zoom lever: css px per world unit at the closest the user can get. A work
// is 320 world units wide, so 2.5 shows it at most 800 css px across. Every
// zoom path (wheel, pinch, keyboard, fly-to-focus) clamps to this.
export const MAX_ZOOM = 2.5;

// The surface bulges toward the viewer like a shallow dome pinned to the
// screen: content slides over it as you pan. In normalised screen coords
// n ∈ [-1,1]² a point at radius r is pushed out by z = BULGE·(1 − r²) and
// perspective-divided, so the centre is magnified and the edges recede.
// Beyond DOME_R2 the height is held flat so far-off vertices never fold back.
export const BULGE = 0.04;
const DOME_R2 = 4;
export const CENTER_SCALE = 1 / (1 - BULGE);

export function domeScale(r2) {
  return 1 / (1 - BULGE * (1 - Math.min(r2, DOME_R2)));
}

// Inverse of the dome warp: distorted radius r' → undistorted radius r.
// r' = r / (1 − b + b·r²)  ⇒  b·r'·r² − r + r'(1 − b) = 0
function undomeRadius(rp) {
  if (rp < 1e-6) return rp;
  const flatR = Math.sqrt(DOME_R2);
  if (rp >= flatR * domeScale(DOME_R2)) return rp / domeScale(DOME_R2);
  const b = BULGE;
  const disc = Math.max(0, 1 - 4 * b * rp * rp * (1 - b));
  return (1 - Math.sqrt(disc)) / (2 * b * rp);
}

// Camera over the wrapping plane. (x, y) is the world point at the viewport
// centre; zoom is CSS pixels per world unit.
export class Camera {
  constructor(tile) {
    this.tile = tile;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.vw = 1;
    this.vh = 1;
  }

  resize(vw, vh) {
    this.vw = vw;
    this.vh = vh;
    this.zoom = clamp(this.zoom, this.minZoom(), MAX_ZOOM);
  }

  // Never zoom out past ~1.7 tiles across the longer axis: keeps the number of
  // wrapped copies (and draw calls) bounded.
  minZoom() {
    return 0.6 * Math.max(this.vw / this.tile.tileW, this.vh / this.tile.tileH);
  }

  wrap() {
    this.x = mod(this.x, this.tile.tileW);
    this.y = mod(this.y, this.tile.tileH);
  }

  // Screen point → world point, undoing the dome warp first.
  screenToWorld(sx, sy) {
    const nx = (sx - this.vw / 2) / (this.vw / 2);
    const ny = (sy - this.vh / 2) / (this.vh / 2);
    const rp = Math.hypot(nx, ny);
    const k = rp < 1e-6 ? 1 : undomeRadius(rp) / rp;
    return {
      x: this.x + (nx * k * this.vw) / 2 / this.zoom,
      y: this.y + (ny * k * this.vh) / 2 / this.zoom,
    };
  }

  // Drag feels 1:1 at the centre of the dome, where the surface is magnified.
  panByScreen(dx, dy) {
    this.x -= dx / (this.zoom * CENTER_SCALE);
    this.y -= dy / (this.zoom * CENTER_SCALE);
  }

  setZoom(z) {
    this.zoom = clamp(z, this.minZoom(), MAX_ZOOM);
  }

  // Zoom keeping the world point under (sx, sy) fixed on screen.
  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.setZoom(this.zoom * factor);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  // Shortest signed offset from the camera to a world point across the wrap.
  delta(wx, wy) {
    let dx = wx - this.x;
    let dy = wy - this.y;
    dx -= Math.round(dx / this.tile.tileW) * this.tile.tileW;
    dy -= Math.round(dy / this.tile.tileH) * this.tile.tileH;
    return { dx, dy };
  }

  // World-space viewport bounds. The dome shrinks the corners (scale
  // 1/(1+BULGE) at r²=2), so a little more world peeks in there.
  bounds() {
    const hw = ((1 + BULGE) * this.vw) / (2 * this.zoom);
    const hh = ((1 + BULGE) * this.vh) / (2 * this.zoom);
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
