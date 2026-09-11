import "./style.css";
import { createLoader } from "./loader";
import { loadCatalog, recordView } from "./catalog";
import { layout, hitTest } from "./layout";
import { Camera, MAX_ZOOM } from "./camera";
import { createRenderer } from "./renderer";
import { createTextures } from "./textures";
import { createInput } from "./input";

const HOME_ZOOM = 0.8;
const FLY_MS = 700;
const MAINTAIN_MS = 250;

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function boot() {
  const loader = createLoader();
  const canvas = $("gl");

  let renderer;
  try {
    renderer = createRenderer(canvas);
  } catch (err) {
    $("hint").textContent = "webgl2 is required to view gallaria";
    loader.done();
    throw err;
  }

  loader.set(0.05);
  const items = await loadCatalog();
  loader.set(0.15);
  $("count").textContent = `${items.length} works`;

  const tile = layout(items);
  const camera = new Camera(tile);
  const textures = createTextures(renderer.gl, items);

  await textures.bootstrap((p) => loader.set(0.15 + 0.85 * p));

  // --- state -------------------------------------------------------------
  let hovered = null;
  let focused = null;
  let fly = null; // { from, to, start }
  let dirty = true;
  let lastMaintain = 0;

  const mark = () => (dirty = true);
  textures.onChange(mark);

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    renderer.resize(vw, vh);
    camera.resize(vw, vh);
    mark();
  }
  window.addEventListener("resize", resize);
  resize();

  // --- focus / fly-to ----------------------------------------------------
  const caption = $("caption");
  function setFocus(item, { animate = true, count = true } = {}) {
    focused = item;
    caption.hidden = !item;
    if (item) {
      if (count) recordView(item);
      // "african-art/bad_oats_b2qeuf" → "bad_oats"
      $("caption-id").textContent = item.public_id.split("/").pop().replace(/_[a-z0-9]{6}$/i, "");
      $("caption-views").textContent = `👁 ${item.views}`;
      history.replaceState(null, "", `#${encodeURIComponent(item.public_id)}`);
      flyTo(item, animate);
    } else {
      history.replaceState(null, "", location.pathname);
    }
    mark();
  }

  function flyTo(item, animate) {
    const { x, y, w, h } = item.rect;
    const { dx, dy } = camera.delta(x + w / 2, y + h / 2);
    const zoom = Math.min(MAX_ZOOM, 0.82 * Math.min(camera.vw / w, camera.vh / h));
    const to = { x: camera.x + dx, y: camera.y + dy, zoom };
    if (!animate || reduceMotion) {
      Object.assign(camera, to);
      camera.wrap();
      return;
    }
    fly = { from: { x: camera.x, y: camera.y, zoom: camera.zoom }, to, start: performance.now() };
  }

  function stepFly(now) {
    if (!fly) return false;
    const t = Math.min(1, (now - fly.start) / FLY_MS);
    const k = easeInOut(t);
    camera.x = fly.from.x + (fly.to.x - fly.from.x) * k;
    camera.y = fly.from.y + (fly.to.y - fly.from.y) * k;
    camera.zoom = Math.exp(Math.log(fly.from.zoom) + (Math.log(fly.to.zoom) - Math.log(fly.from.zoom)) * k);
    if (t >= 1) {
      fly = null;
      camera.wrap();
    }
    return true;
  }

  $("caption-close").addEventListener("click", () => setFocus(null));

  // --- input -------------------------------------------------------------
  const hint = $("hint");
  const input = createInput(canvas, camera, {
    onInteract() {
      fly = null;
      hint.classList.add("gone");
    },
    onMove: mark,
    onHover(sx, sy) {
      const { x, y } = camera.screenToWorld(sx, sy);
      const hit = sx < 0 ? null : hitTest(items, tile, x, y);
      if (hit !== hovered) {
        hovered = hit;
        canvas.classList.toggle("over", !!hit && !input.dragging());
        mark();
      }
    },
    onTap(sx, sy) {
      const { x, y } = camera.screenToWorld(sx, sy);
      const hit = hitTest(items, tile, x, y);
      if (hit && hit !== focused) setFocus(hit);
      else if (!hit) setFocus(null);
    },
    onHome() {
      setFocus(null);
      fly = {
        from: { x: camera.x, y: camera.y, zoom: camera.zoom },
        to: { x: camera.x, y: camera.y, zoom: HOME_ZOOM },
        start: performance.now(),
      };
    },
    onEscape() {
      setFocus(null);
    },
  });

  // --- initial view ------------------------------------------------------
  camera.setZoom(HOME_ZOOM);
  const hash = decodeURIComponent(location.hash.slice(1));
  const linked = hash && items.find((it) => it.public_id === hash);
  if (linked) {
    setFocus(linked, { animate: false, count: false });
  } else {
    // start on the most-viewed work
    const first = items[0].rect;
    camera.x = first.x + first.w / 2;
    camera.y = first.y + first.h / 2;
  }
  textures.maintain(camera, focused);
  loader.done();

  // --- loop --------------------------------------------------------------
  const zoomEl = $("zoom");
  let last = performance.now();
  let zoomShown = "";

  function frame(now) {
    const dt = Math.min(64, now - last);
    last = now;

    let busy = false;
    busy = stepFly(now) || busy;
    busy = input.tick(dt) || busy;
    busy = textures.update(dt) || busy;

    if (now - lastMaintain > MAINTAIN_MS) {
      lastMaintain = now;
      textures.maintain(camera, focused);
    }

    if (dirty || busy) {
      camera.wrap();
      renderer.draw(camera, items, textures, { hovered, focused });
      dirty = false;

      const z = `${Math.round(camera.zoom * 100)}%`;
      if (z !== zoomShown) zoomEl.textContent = zoomShown = z;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
