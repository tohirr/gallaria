const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const MAX_ZOOM = 4;

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

  screenToWorld(sx, sy) {
    return {
      x: this.x + (sx - this.vw / 2) / this.zoom,
      y: this.y + (sy - this.vh / 2) / this.zoom,
    };
  }

  panByScreen(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
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

  // World-space viewport bounds.
  bounds() {
    const hw = this.vw / (2 * this.zoom);
    const hh = this.vh / (2 * this.zoom);
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
