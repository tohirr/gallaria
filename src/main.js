import "./style.css";
import { createLoader } from "./loader";
import { loadCatalog } from "./catalog";
import { layout, hitTest } from "./layout";
import { Camera, MAX_ZOOM } from "./camera";
import { createRenderer } from "./renderer";
import { createTextures } from "./textures";
import { createInput } from "./input";
import { createAdmin } from "./admin";

// Starting zoom: phones get a wider view so more than one column fits.
const HOME_ZOOM = 0.6;
const HOME_ZOOM_MOBILE = 0.35;
const MOBILE_MAX_W = 520;
const homeZoom = () => (window.innerWidth <= MOBILE_MAX_W ? HOME_ZOOM_MOBILE : HOME_ZOOM);
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
    // Only a missing context means the device can't run this; anything else
    // (a shader that failed to compile, say) is our bug and should say so.
    $("hint").textContent = /WebGL2 unavailable/.test(err.message)
      ? "webgl2 is required to view gallaria"
      : `renderer failed to start: ${err.message.split("\n")[0]}`;
    loader.done();
    throw err;
  }

  loader.set(0.05);
  loader.trickle(0.15); // catalog request in flight: creep, don't freeze
  const items = await loadCatalog();
  loader.set(0.15);
  $("count").textContent = `${items.length} works`;

  const tile = layout(items);
  const camera = new Camera(tile);
  const textures = createTextures(renderer.gl, items);

  loader.trickle(0.99); // until the first rung lands, then real progress
  await textures.bootstrap((p) => loader.set(0.15 + 0.85 * p));

  // --- state -------------------------------------------------------------
  let hovered = null;
  let focused = null;
  let fly = null; // { from, to, start }
  const flat = { item: null, k: 0 }; // the focused work flattens off the dome: k 0 → 1
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

  // Theme: the canvas clears to the CSS --bg token, which flips with the
  // device's light/dark preference.
  function applyTheme() {
    const style = getComputedStyle(document.documentElement);
    const rgb = (token, fallback) => {
      const m = /^#([0-9a-f]{6})$/i.exec(style.getPropertyValue(token).trim());
      const v = m ? parseInt(m[1], 16) : fallback;
      return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    };
    renderer.setBackground(...rgb("--bg", 0x050505));
    renderer.setFrame(...rgb("--frame", 0x8c8c8c));
    mark();
  }
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);
  applyTheme();

  // --- focus / fly-to ----------------------------------------------------
  const caption = $("caption");
  let admin = null;
  try {
    admin = createAdmin({
      // A link or hide changes the catalog; reload onto the new work.
      onLinked(work) {
        sessionStorage.setItem("gallaria-fresh", "1"); // skip the edge cache once
        location.hash = work ? encodeURIComponent(work.public_id) : "";
        location.reload();
      },
    });
  } catch (err) {
    console.warn("admin mode unavailable:", err.message); // never block the gallery
  }

  function setFocus(item, { animate = true } = {}) {
    focused = item;
    if (item) {
      if (flat.item !== item) flat.k = 0; // a new work starts domed and flattens on arrival
      flat.item = item;
      if (!animate || reduceMotion) flat.k = 1;
    }
    caption.hidden = !item;
    admin?.setFocus(item);
    if (item) {
      const title = $("caption-title");
      const artist = $("caption-artist");
      const source = $("caption-source");
      if (item.artist) {
        title.textContent = "";
        artist.textContent = item.artist.name;
        artist.href = `https://x.com/${item.artist.handle}`;
        artist.hidden = false;
        source.href = item.tweet;
        source.hidden = !item.tweet;
        document.title = `${item.artist.name} · gallaria`;
      } else {
        // "african-art/bad_oats_b2qeuf" → "bad_oats"
        title.textContent = item.public_id.split("/").pop().replace(/_[a-z0-9]{6}$/i, "");
        artist.hidden = true;
        source.hidden = true;
        document.title = `${title.textContent} · gallaria`;
      }
      title.classList.toggle("legacy", !item.artist);
      history.replaceState(null, "", `${location.search}#${encodeURIComponent(item.public_id)}`);
      flyTo(item, animate);
    } else {
      document.title = "gallaria";
      history.replaceState(null, "", location.pathname + location.search);
    }
    mark();
  }

  function flyTo(item, animate) {
    const { x, y, w, h } = item.rect;
    const { dx, dy } = camera.delta(x + w / 2, y + h / 2);
    // the focused work is drawn flat, so no centre-magnification correction
    const zoom = Math.min(MAX_ZOOM, 0.82 * Math.min(camera.vw / w, camera.vh / h));
    const to = { x: camera.x + dx, y: camera.y + dy, zoom };
    if (!animate || reduceMotion) {
      Object.assign(camera, to);
      camera.wrap();
      return;
    }
    fly = { from: { x: camera.x, y: camera.y, zoom: camera.zoom }, to, start: performance.now() };
  }

  // Ease the focused work flat over the fly, and back onto the dome when let go.
  function stepFlat(dt) {
    const target = focused && flat.item === focused ? 1 : 0;
    if (flat.k === target) {
      if (!target) flat.item = null;
      return false;
    }
    const step = reduceMotion ? 1 : dt / FLY_MS;
    flat.k = target ? Math.min(1, flat.k + step) : Math.max(0, flat.k - step);
    return true;
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
        to: { x: camera.x, y: camera.y, zoom: homeZoom() },
        start: performance.now(),
      };
    },
    onEscape() {
      setFocus(null);
    },
  });

  // --- initial view ------------------------------------------------------
  camera.setZoom(homeZoom());
  const hash = decodeURIComponent(location.hash.slice(1));
  const linked = hash && items.find((it) => it.public_id === hash);
  if (linked) {
    setFocus(linked, { animate: false });
  } else {
    // start on the first work
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
    busy = stepFlat(dt) || busy;
    busy = input.tick(dt) || busy;
    busy = textures.update(dt) || busy;

    if (now - lastMaintain > MAINTAIN_MS) {
      lastMaintain = now;
      textures.maintain(camera, focused);
    }

    if (dirty || busy) {
      camera.wrap();
      renderer.draw(camera, items, textures, { hovered, focused, flat });
      dirty = false;

      const z = `${Math.round(camera.zoom * 100)}%`;
      if (z !== zoomShown) zoomEl.textContent = zoomShown = z;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
