import { BLOCK } from "./layout";
import { BULGE, TANGENT, flatEase } from "./camera";

// Frame levers. Each work gets a bevelled border lit from one angle: sides
// facing the light go bright with a specular ridge, sides facing away go dark,
// and the corners mitre where they meet.
const FRAME = 2.5; // border width in world units (a work is 320 wide)
const FRAME_MIN_PX = 1.5; // never thinner than this on screen when zoomed out
const CORNER = 8; // outer corner radius in world units (0 for square)
const LIGHT_ANGLE = -135; // degrees, screen convention: 0 = from the right, -90 = from the top

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
uniform float uTangent; // 1: rigid card on the dome's tangent plane, 0: bent onto the dome
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

  // dome height z = b(1 - r²) at this vertex...
  float r2 = min(dot(n, n), 4.0);
  float zCurve = uBulge * (1.0 - r2);
  // ...or of the plane tangent to the dome at the card's centre
  vec2 cs = (uRect.xy + 0.5 * uRect.zw - uCam) * uZoom + uView * 0.5;
  vec2 cn = cs / uView * 2.0 - 1.0;
  float cc = dot(cn, cn);
  float zPlane = cc < 4.0 ? uBulge * (1.0 + cc - 2.0 * dot(cn, n)) : uBulge * (1.0 - 4.0);
  float z = min(mix(zCurve, zPlane, uTangent), 0.5);

  // perspective divide by w = 1 - z: the GPU interpolates uv perspective-correctly
  float w = 1.0 - z;
  vShade = mix(1.0, 0.9, smoothstep(0.0, 2.0, mix(r2, min(cc, 4.0), uTangent)));
  gl_Position = vec4(n.x, -n.y, 0.0, w);
}`;

const QUAD_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uBayer;
uniform float uT;      // dissolve progress: blocks whose threshold < uT show B
uniform float uAlpha;  // 1 = opaque, lower fades toward the page background
uniform vec3 uBg;
uniform vec2 uBlocks;  // dissolve blocks across the quad
uniform vec2 uSize;    // artwork w, h in world units (the quad is this plus the frame)
uniform float uFrame;  // frame width in world units
uniform float uRadius; // outer corner radius in world units
uniform vec3 uFrameCol;
uniform vec2 uLight;   // unit vector pointing toward the light, uv space (y down)
in vec2 vUv;
in float vShade;
out vec4 o;
void main() {
  // position in world units from the artwork's top-left; the frame is outside it
  vec2 p = vUv * (uSize + 2.0 * uFrame) - uFrame;
  vec2 uv = clamp(p / uSize, 0.0, 1.0);

  vec2 b = mod(floor(uv * uBlocks), 8.0);
  float th = texture(uBayer, (b + 0.5) / 8.0).r;
  vec3 a = texture(uTexA, uv).rgb;
  vec3 c = texture(uTexB, uv).rgb;
  vec3 art = th < uT ? c : a;

  // rounded-box distance fields: dIn < 0 inside the art, dOut < 0 inside the frame
  vec2 hs = uSize * 0.5;
  vec2 pc = p - hs;
  float ri = max(uRadius - uFrame, 0.0);
  vec2 qi = abs(pc) - (hs - ri);
  float dIn = length(max(qi, 0.0)) + min(max(qi.x, qi.y), 0.0) - ri;
  vec2 qo = abs(pc) - (hs + uFrame - uRadius);
  float dOut = length(max(qo, 0.0)) + min(max(qo.x, qo.y), 0.0) - uRadius;

  // surface normal of the frame: axis-aligned on the sides, curving round the corners
  vec2 n = (qi.x > 0.0 && qi.y > 0.0) ? normalize(qi) : (qi.x > qi.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  n *= vec2(pc.x < 0.0 ? -1.0 : 1.0, pc.y < 0.0 ? -1.0 : 1.0);
  float t = clamp(dIn / uFrame, 0.0, 1.0); // 0 at the art edge, 1 at the outer edge
  float lam = dot(n, uLight);              // -1 facing away .. 1 facing the light
  float diff = 0.5 + 0.5 * lam;
  float ridge = 1.0 - abs(t * 2.0 - 1.0);  // bevel crest along the band centre
  float spec = pow(max(lam, 0.0), 3.0) * 0.7 * ridge;
  float seam = 0.55 + 0.45 * smoothstep(0.0, 0.2, t); // dark rebate against the art
  vec3 frame = (uFrameCol * diff + spec) * seam;

  float aa = fwidth(dOut);
  float artCov = 1.0 - smoothstep(-aa, aa, dIn);
  float cov = 1.0 - smoothstep(-aa, aa, dOut);
  vec3 col = mix(frame, art, artCov);
  o = vec4(mix(uBg, col * vShade, uAlpha * cov), 1.0);
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
    antialias: true, // the dome tilts every edge off the pixel grid
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");

  const quad = program(gl, QUAD_VS, QUAD_FS, [
    "uRect", "uCam", "uZoom", "uView", "uTexA", "uTexB", "uBayer", "uT", "uAlpha", "uBlocks",
    "uSeg", "uBulge", "uTangent", "uBg", "uSize", "uFrame", "uRadius", "uFrameCol", "uLight",
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
  const rad = (LIGHT_ANGLE * Math.PI) / 180;
  gl.uniform2f(quad.u.uLight, Math.cos(rad), Math.sin(rad));
  gl.uniform1f(quad.u.uRadius, CORNER);
  gl.uniform1f(quad.u.uTangent, TANGENT ? 1 : 0);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, bayer);

  return {
    gl,

    // Page background (0..1 rgb): what the frame clears to and what dimmed
    // works fade toward. Follows the CSS --bg token so the theme can flip.
    setBackground(r, g, b) {
      gl.clearColor(r, g, b, 1);
      gl.useProgram(quad.p);
      gl.uniform3f(quad.u.uBg, r, g, b);
    },

    // Base colour of the frame around each work (0..1 rgb); lighting is applied on top.
    setFrame(r, g, b) {
      gl.useProgram(quad.p);
      gl.uniform3f(quad.u.uFrameCol, r, g, b);
    },

    resize(vw, vh) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    // Draw every wrapped copy of every item that intersects the viewport.
    // `flat` names the work being lifted off the dome and how far along it is.
    draw(camera, items, textures, { hovered, focused, flat }) {
      const { tileW, tileH } = camera.tile;
      const { x0, y0, x1, y1 } = camera.bounds();

      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(quad.p);
      gl.uniform2f(quad.u.uCam, camera.x, camera.y);
      gl.uniform1f(quad.u.uZoom, camera.zoom);
      gl.uniform2f(quad.u.uView, camera.vw, camera.vh);
      const frame = Math.max(FRAME, FRAME_MIN_PX / camera.zoom);
      gl.uniform1f(quad.u.uFrame, frame);

      let draws = 0;
      for (const item of items) {
        const s = textures.get(item);
        if (!s.b) continue;
        const { x, y, w, h } = item.rect;

        const kx0 = Math.ceil((x0 - x - w - frame) / tileW);
        const kx1 = Math.floor((x1 - x + frame) / tileW);
        if (kx1 < kx0) continue;
        const ky0 = Math.ceil((y0 - y - h - frame) / tileH);
        const ky1 = Math.floor((y1 - y + frame) / tileH);
        if (ky1 < ky0) continue;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.a || s.b);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, s.b);
        gl.uniform1f(quad.u.uT, s.t);
        gl.uniform2f(quad.u.uBlocks, w / BLOCK, h / BLOCK);
        gl.uniform2f(quad.u.uSize, w, h);
        const alpha = item === hovered ? 0.72 : focused && item !== focused ? 0.45 : 1;
        gl.uniform1f(quad.u.uAlpha, alpha);
        const k = flat && item === flat.item ? flat.k : 0;
        gl.uniform1f(quad.u.uBulge, BULGE * (1 - flatEase(k)));
        // a rigid card is one planar quad; a bent one needs ~a cell per 120 css px
        const seg = TANGENT ? 1 : Math.max(1, Math.min(24, Math.ceil((Math.max(w, h) * camera.zoom) / 120)));
        gl.uniform1i(quad.u.uSeg, seg);

        for (let ky = ky0; ky <= ky1; ky++) {
          for (let kx = kx0; kx <= kx1; kx++) {
            gl.uniform4f(quad.u.uRect, x + kx * tileW - frame, y + ky * tileH - frame, w + 2 * frame, h + 2 * frame);
            gl.drawArrays(gl.TRIANGLES, 0, 6 * seg * seg);
            draws++;
          }
        }
      }
      return draws;
    },
  };
}
