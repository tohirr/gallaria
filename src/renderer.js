import { BLOCK } from "./layout";
import { BULGE } from "./camera";

// 8x8 Bayer matrix — the classic ordered-dither threshold map. Uploaded as a
// tiny texture so the fragment shader can dissolve between rungs in world-space
// blocks without dynamic array indexing.
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

// Each quad is drawn as a uSeg×uSeg grid of cells (6 vertices per cell,
// generated from gl_VertexID) so the dome warp below bends it smoothly.
// The warp mirrors domeScale() in camera.js: keep the two in sync.
const QUAD_VS = `#version 300 es
uniform vec4 uRect;   // x, y, w, h in world units
uniform vec2 uCam;    // world point at viewport centre
uniform float uZoom;  // css px per world unit
uniform vec2 uView;   // viewport in css px
uniform int uSeg;     // subdivisions per axis
uniform float uBulge;
out vec2 vUv;
out float vShade;
void main() {
  int i = gl_VertexID;
  int c = i % 6;
  int q = i / 6;
  vec2 corner = vec2(float(c == 1 || c == 2 || c == 4), float(c == 2 || c == 4 || c == 5));
  vec2 cell = vec2(float(q % uSeg), float(q / uSeg));
  vec2 p = (cell + corner) / float(uSeg);
  vUv = p;
  vec2 screen = (uRect.xy + p * uRect.zw - uCam) * uZoom + uView * 0.5;
  vec2 n = screen / uView * 2.0 - 1.0;
  float r2 = min(dot(n, n), 4.0);
  n /= 1.0 - uBulge * (1.0 - r2);
  vShade = mix(1.0, 0.9, smoothstep(0.0, 2.0, r2));
  gl_Position = vec4(n.x, -n.y, 0.0, 1.0);
}`;

const QUAD_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uBayer;
uniform float uT;      // dissolve progress: blocks whose threshold < uT show B
uniform float uAlpha;
uniform vec2 uBlocks;  // dissolve blocks across the quad
in vec2 vUv;
in float vShade;
out vec4 o;
void main() {
  vec2 b = mod(floor(vUv * uBlocks), 8.0);
  float th = texture(uBayer, (b + 0.5) / 8.0).r;
  vec3 a = texture(uTexA, vUv).rgb;
  vec3 c = texture(uTexB, vUv).rgb;
  vec3 col = th < uT ? c : a;
  o = vec4(col * uAlpha * vShade, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(gl, vs, fs, uniforms) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  const u = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name);
  return { p, u };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const quad = program(gl, QUAD_VS, QUAD_FS, [
    "uRect", "uCam", "uZoom", "uView", "uTexA", "uTexB", "uBayer", "uT", "uAlpha", "uBlocks",
    "uSeg", "uBulge",
  ]);

  const bayer = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bayer);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 8, 8, 0, gl.RED, gl.UNSIGNED_BYTE,
    new Uint8Array(BAYER_8.map((v) => v * 4)));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Empty VAO: the program generates its vertices from gl_VertexID.
  gl.bindVertexArray(gl.createVertexArray());

  gl.useProgram(quad.p);
  gl.uniform1i(quad.u.uTexA, 0);
  gl.uniform1i(quad.u.uTexB, 1);
  gl.uniform1i(quad.u.uBayer, 2);
  gl.uniform1f(quad.u.uBulge, BULGE);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, bayer);

  gl.clearColor(0.02, 0.02, 0.02, 1);

  return {
    gl,

    resize(vw, vh) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    // Draw every wrapped copy of every item that intersects the viewport.
    draw(camera, items, textures, { hovered, focused }) {
      const { tileW, tileH } = camera.tile;
      const { x0, y0, x1, y1 } = camera.bounds();

      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(quad.p);
      gl.uniform2f(quad.u.uCam, camera.x, camera.y);
      gl.uniform1f(quad.u.uZoom, camera.zoom);
      gl.uniform2f(quad.u.uView, camera.vw, camera.vh);

      let draws = 0;
      for (const item of items) {
        const s = textures.get(item);
        if (!s.b) continue;
        const { x, y, w, h } = item.rect;

        const kx0 = Math.ceil((x0 - x - w) / tileW);
        const kx1 = Math.floor((x1 - x) / tileW);
        if (kx1 < kx0) continue;
        const ky0 = Math.ceil((y0 - y - h) / tileH);
        const ky1 = Math.floor((y1 - y) / tileH);
        if (ky1 < ky0) continue;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.a || s.b);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.b);
        gl.uniform1f(quad.u.uT, s.t);
        gl.uniform2f(quad.u.uBlocks, w / BLOCK, h / BLOCK);
        const alpha = item === hovered ? 0.72 : focused && item !== focused ? 0.45 : 1;
        gl.uniform1f(quad.u.uAlpha, alpha);
        // ~one cell per 120 css px keeps the dome smooth without over-tessellating
        const seg = Math.max(1, Math.min(24, Math.ceil((Math.max(w, h) * camera.zoom) / 120)));
        gl.uniform1i(quad.u.uSeg, seg);

        for (let ky = ky0; ky <= ky1; ky++) {
          for (let kx = kx0; kx <= kx1; kx++) {
            gl.uniform4f(quad.u.uRect, x + kx * tileW, y + ky * tileH, w, h);
            gl.drawArrays(gl.TRIANGLES, 0, 6 * seg * seg);
            draws++;
          }
        }
      }
      return draws;
    },
  };
}
