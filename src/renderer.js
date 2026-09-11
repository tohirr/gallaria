import { BLOCK } from "./layout";

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

const QUAD_VS = `#version 300 es
uniform vec4 uRect;   // x, y, w, h in world units
uniform vec2 uCam;    // world point at viewport centre
uniform float uZoom;  // css px per world unit
uniform vec2 uView;   // viewport in css px
out vec2 vUv;
void main() {
  int i = gl_VertexID;
  vec2 p = vec2(float(i == 1 || i == 2 || i == 4), float(i == 2 || i == 4 || i == 5));
  vUv = p;
  vec2 screen = (uRect.xy + p * uRect.zw - uCam) * uZoom + uView * 0.5;
  vec2 ndc = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
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
out vec4 o;
void main() {
  vec2 b = mod(floor(vUv * uBlocks), 8.0);
  float th = texture(uBayer, (b + 0.5) / 8.0).r;
  vec3 a = texture(uTexA, vUv).rgb;
  vec3 c = texture(uTexB, vUv).rgb;
  vec3 col = th < uT ? c : a;
  o = vec4(col * uAlpha, 1.0);
}`;

const BG_VS = `#version 300 es
void main() {
  int i = gl_VertexID;
  vec2 p = vec2(i == 1 ? 3.0 : -1.0, i == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Dot grid pinned to world space, fading out as the cells get too small.
const BG_FS = `#version 300 es
precision mediump float;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uView;
uniform float uDpr;
out vec4 o;
void main() {
  vec2 screen = gl_FragCoord.xy / uDpr;
  screen.y = uView.y - screen.y;
  vec2 world = (screen - uView * 0.5) / uZoom + uCam;
  const float cell = 64.0;
  vec2 g = (fract(world / cell + 0.5) - 0.5) * cell * uZoom;
  float d = length(g);
  float dot = smoothstep(1.6, 0.4, d) * clamp((cell * uZoom - 10.0) / 20.0, 0.0, 1.0);
  vec3 bg = vec3(0.02);
  o = vec4(bg + dot * 0.14, 1.0);
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
  ]);
  const bg = program(gl, BG_VS, BG_FS, ["uCam", "uZoom", "uView", "uDpr"]);

  const bayer = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bayer);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 8, 8, 0, gl.RED, gl.UNSIGNED_BYTE,
    new Uint8Array(BAYER_8.map((v) => v * 4)));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Empty VAO: both programs generate their vertices from gl_VertexID.
  gl.bindVertexArray(gl.createVertexArray());

  gl.useProgram(quad.p);
  gl.uniform1i(quad.u.uTexA, 0);
  gl.uniform1i(quad.u.uTexB, 1);
  gl.uniform1i(quad.u.uBayer, 2);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, bayer);

  let dpr = 1;

  return {
    gl,

    resize(vw, vh) {
      dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },

    // Draw every wrapped copy of every item that intersects the viewport.
    draw(camera, items, textures, { hovered, focused }) {
      const { tileW, tileH } = camera.tile;
      const { x0, y0, x1, y1 } = camera.bounds();

      gl.useProgram(bg.p);
      gl.uniform2f(bg.u.uCam, camera.x, camera.y);
      gl.uniform1f(bg.u.uZoom, camera.zoom);
      gl.uniform2f(bg.u.uView, camera.vw, camera.vh);
      gl.uniform1f(bg.u.uDpr, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

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

        for (let ky = ky0; ky <= ky1; ky++) {
          for (let kx = kx0; kx <= kx1; kx++) {
            gl.uniform4f(quad.u.uRect, x + kx * tileW, y + ky * tileH, w, h);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            draws++;
          }
        }
      }
      return draws;
    },
  };
}
