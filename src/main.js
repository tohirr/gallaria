import "./style.css";
import { createLoader } from "./loader";
import { loadCatalog } from "./catalog";
import { layout, hitTest, COL_W, MIN_GAP } from "./layout";
import { Camera, MAX_ZOOM, BULGE, CENTER_SCALE, TANGENT, flatEase, pickTangent } from "./camera";
import { createRenderer } from "./renderer";
import { createTextures } from "./textures";
import { createInput } from "./input";
import { createAdmin } from "./admin";

// Two views. Roaming: the scattered, wrapping canvas, capped so a couple of
// works always stay in sight. The strip: click a work and the canvas becomes
// a line of works, one per screen, fitted to the viewport; swipe, scroll or
// arrow between them, escape back out. The switch between the two coordinate
// spaces happens when the focused work is centred and everything else has
// faded, so it never shows.

// Starting zoom: phones get a wider view so more than one column fits.
const HOME_ZOOM = 0.6;
const HOME_ZOOM_MOBILE = 0.35;
const MOBILE_MAX_W = 520;
const homeZoom = () => (window.innerWidth <= MOBILE_MAX_W ? HOME_ZOOM_MOBILE : HOME_ZOOM);

const ROAM_WORKS = 2.5; // roaming never zooms closer than this many works across the longer axis
const FIT = 0.92; // how much of the viewport a work fills in the strip
const PAGE_FRACTION = 0.15; // drag this much of the viewport in the strip to turn the page
const STRIP_GAP_PX = 28; // css px between neighbours in the strip, at the current work's zoom
const FLY_MS = 700; // entering and leaving the strip
const PAGE_MS = 450; // turning a page inside it by key
const FLING_V = 6; // css px per frame: slower releases settle by distance, faster ones by momentum
const STRIP_MOMENTUM = 24; // how far a fling carries, in frames of its release speed
const SETTLE_MIN_MS = 350; // the shortest settle onto a work
const SETTLE_MAX_MS = 1400; // the longest, for a fling across several works
const WHEEL_QUIET_MS = 80; // a stream of wheel events is one swipe until it pauses this long
const WHEEL_TAIL_MS = 300; // once a swipe has settled, its remaining inertia is swallowed
const MAINTAIN_MS = 250;

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3); // starts at speed 3/ms, dampens to rest

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

  // --- spaces ------------------------------------------------------------
  // Every item carries a rect for each space; `item.rect` is whichever is live.
  const canvasTile = layout(items);
  for (const it of items) it.canvasRect = it.rect;
  let stripTile = null;
  let stripAxis = "x"; // the strip runs sideways for mouse and trackpad, up and down for touch
  let space = "canvas";
  const along = ({ dx, dy }) => (stripAxis === "x" ? dx : dy); // offset along the strip
  const stripSpan = () => (stripAxis === "x" ? camera.vw : camera.vh); // viewport length along it

  const camera = new Camera(canvasTile);
  const textures = createTextures(renderer.gl, items);

  loader.trickle(0.99); // until the first rung lands, then real progress
  await textures.bootstrap((p) => loader.set(0.15 + 0.85 * p));

  // Zoom at which a work fills the viewport (contain).
  const fitZoom = (item) => {
    const { w, h } = item.canvasRect;
    return Math.min(MAX_ZOOM, FIT * Math.min(camera.vw / w, camera.vh / h));
  };

  // Lay the works in a ring like a carousel. Each work is shown at its own
  // fit zoom, so the distance to a neighbour is half a screen at this work's
  // zoom plus half a screen at the neighbour's (plus the gap): at rest the
  // neighbours' edges sit just outside the viewport, and a drag brings the
  // next one straight in.
  function buildStrip() {
    stripAxis = window.matchMedia("(pointer: coarse)").matches ? "y" : "x";
    const halfScreen = (it) => (stripSpan() / 2 + STRIP_GAP_PX / 2) / fitZoom(it); // world units
    let pos = 0;
    let widest = 0;
    items.forEach((it, i) => {
      const { w, h } = it.canvasRect;
      it.stripRect =
        stripAxis === "x" ? { x: pos - w / 2, y: -h / 2, w, h } : { x: -w / 2, y: pos - h / 2, w, h };
      const next = items[(i + 1) % items.length];
      pos += halfScreen(it) + halfScreen(next);
      widest = Math.max(widest, 2 * halfScreen(it));
    });
    // pos is now the full ring; wrap copies across the strip sit screens away, out of reach at fit zoom.
    stripTile = stripAxis === "x" ? { tileW: pos, tileH: 4 * widest } : { tileW: 4 * widest, tileH: pos };
  }

  function useSpace(name) {
    space = name;
    for (const it of items) it.rect = name === "strip" ? it.stripRect : it.canvasRect;
    camera.tile = name === "strip" ? stripTile : canvasTile;
    camera.panScale = name === "strip" ? 1 : CENTER_SCALE; // the strip is flat: drag 1:1
  }

  // --- state -------------------------------------------------------------
  let mode = "roam"; // roam | entering | strip | leaving
  let hovered = null;
  let focused = null;
  let fly = null; // { from, to, start, done }
  let dirty = true;
  let lastMaintain = 0;
  const flat = { item: null, k: 0 }; // a work lifting off the dome: k 0 → 1
  let dim = 0; // how far the unfocused works have faded: 0 → 1
  let pending = null; // what finishes the current entering/leaving transition
  // Strip wheel swipes: pan 1:1 while events stream, watch their speed, and
  // once the stream is either dying away (trackpad inertia) or paused, treat
  // it as a release. `wheel.v` is css px per frame along the strip.
  const wheel = { active: false, quietAt: 0, busyUntil: 0, last: 0, v: 0, peak: 0, slowing: 0 };

  const mark = () => (dirty = true);
  textures.onChange(mark);

  const roamMaxZoom = () =>
    Math.max(homeZoom(), Math.max(camera.vw, camera.vh) / (ROAM_WORKS * (COL_W + MIN_GAP)));

  function applyZoomLimits({ clamp = true } = {}) {
    if (mode === "strip" || mode === "entering") {
      camera.zmin = focused ? fitZoom(focused) * 0.999 : 0; // never further out than fit
      camera.zmax = MAX_ZOOM;
    } else {
      camera.zmin = 0;
      camera.zmax = roamMaxZoom();
    }
    if (clamp && (mode === "roam" || mode === "strip")) camera.clampZoom(); // not mid-fly
  }

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    renderer.resize(vw, vh);
    camera.resize(vw, vh);
    if (space === "strip") {
      buildStrip(); // pitch depends on the viewport
      useSpace("strip");
      if (focused && !fly) {
        const r = focused.rect;
        camera.x = r.x + r.w / 2;
        camera.y = r.y + r.h / 2;
      }
    }
    applyZoomLimits();
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
    mark();
  }
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);
  applyTheme();

  // --- focus / strip -----------------------------------------------------
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

  function showCaption(item) {
    caption.hidden = !item;
    admin?.setFocus(item);
    if (!item) {
      document.title = "gallaria";
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
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
  }

  // Focus a work. From the canvas this starts the way into the strip; inside
  // the strip it pages to that work.
  function setFocus(item, { animate = true, ms, ease } = {}) {
    focused = item;
    hovered = null;
    canvas.classList.remove("over");
    showCaption(item);
    if (mode === "roam") {
      mode = "entering";
      pending = enterStrip;
      if (flat.item !== item) flat.k = 0; // starts domed and flattens on arrival
      flat.item = item;
      if (!animate || reduceMotion) flat.k = 1;
    }
    applyZoomLimits({ clamp: false }); // the fly carries the zoom to fit; clamping now would jump
    syncModeUI();
    flyTo(
      item,
      animate,
      () => {
        if (mode === "entering") enterStrip();
        else applyZoomLimits();
      },
      ms ?? (mode === "strip" ? PAGE_MS : FLY_MS),
      ease ?? (mode === "strip" ? easeOut : easeInOut)
    );
    mark();
  }

  // The fly-in has landed: the focused work is centred at fit zoom and the
  // rest have faded out, so swap to the strip's coordinates underneath it.
  function enterStrip() {
    pending = null;
    mode = "strip";
    buildStrip();
    useSpace("strip");
    const r = focused.rect;
    camera.x = r.x + r.w / 2;
    camera.y = r.y + r.h / 2;
    dim = 0; // neighbours are a screen away; full strength for when they slide in
    applyZoomLimits();
    textures.maintain(camera, focused);
    mark();
  }

  // Back to the canvas: the work keeps its exact screen position through the
  // swap, then the view flies out while the others fade back in.
  function exitStrip() {
    if (mode !== "strip") return;
    const item = focused;
    const sr = item.rect;
    const { dx, dy } = camera.delta(sr.x + sr.w / 2, sr.y + sr.h / 2); // work centre relative to the camera
    // Mid-page (a neighbour still in view)? Finish arriving first, then leave.
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      flyTo(item, true, exitStrip, PAGE_MS);
      return;
    }
    mode = "leaving";
    useSpace("canvas");
    const cr = item.rect;
    const cx = cr.x + cr.w / 2;
    const cy = cr.y + cr.h / 2;
    camera.x = cx - dx;
    camera.y = cy - dy;
    camera.wrap();
    flat.item = item;
    flat.k = 1; // flat now; eases back onto the dome during the fly
    dim = 1; // the others are hidden; they fade in during the fly
    focused = null;
    showCaption(null);
    applyZoomLimits();
    syncModeUI();
    const to = { x: cx, y: cy, zoom: Math.min(camera.zmax, homeZoom()) };
    const land = () => {
      pending = null;
      mode = "roam";
      applyZoomLimits();
    };
    pending = land;
    if (reduceMotion) {
      Object.assign(camera, to);
      camera.wrap();
      dim = 0;
      land();
    } else {
      fly = { from: { x: camera.x, y: camera.y, zoom: camera.zoom }, to, start: performance.now(), done: land };
    }
    mark();
  }

  function flyTo(item, animate, done, ms = FLY_MS, ease = easeInOut) {
    const { x, y, w, h } = item.rect;
    const { dx, dy } = camera.delta(x + w / 2, y + h / 2);
    const to = { x: camera.x + dx, y: camera.y + dy, zoom: fitZoom(item) };
    if (!animate || reduceMotion) {
      Object.assign(camera, to);
      camera.wrap();
      fly = null;
      done?.();
      return;
    }
    fly = { from: { x: camera.x, y: camera.y, zoom: camera.zoom }, to, start: performance.now(), done, ms, ease };
  }

  function stepFly(now) {
    if (!fly) return false;
    const t = Math.min(1, (now - fly.start) / (fly.ms || FLY_MS));
    const k = (fly.ease || easeInOut)(t);
    camera.x = fly.from.x + (fly.to.x - fly.from.x) * k;
    camera.y = fly.from.y + (fly.to.y - fly.from.y) * k;
    camera.zoom = Math.exp(Math.log(fly.from.zoom) + (Math.log(fly.to.zoom) - Math.log(fly.from.zoom)) * k);
    if (t >= 1) {
      const { done } = fly;
      fly = null;
      camera.wrap();
      done?.();
    }
    return true;
  }

  // Ease the focused work flat over the fly-in, and back onto the dome when let go.
  function stepFlat(dt) {
    const target = flat.item && (flat.item === focused || mode === "strip") ? 1 : 0;
    if (flat.k === target) {
      if (!target) flat.item = null;
      return false;
    }
    const step = reduceMotion ? 1 : dt / FLY_MS;
    flat.k = target ? Math.min(1, flat.k + step) : Math.max(0, flat.k - step);
    return true;
  }

  // Fade the unfocused works out on the way in, and back in on the way out.
  function stepDim(dt) {
    const target = mode === "entering" ? 1 : 0;
    if (dim === target) return false;
    const step = reduceMotion ? 1 : dt / FLY_MS;
    dim = target ? Math.min(1, dim + step) : Math.max(0, dim - step);
    return true;
  }

  // Shortest signed distance along the strip from world position a to b.
  function ringOffset(a, b) {
    const n = stripAxis === "x" ? stripTile.tileW : stripTile.tileH;
    let d = b - a;
    d -= Math.round(d / n) * n;
    return d;
  }
  const centreAlong = (it) => (stripAxis === "x" ? it.rect.x + it.rect.w / 2 : it.rect.y + it.rect.h / 2);
  const cameraAlong = () => (stripAxis === "x" ? camera.x : camera.y);

  // The strip has been let go at fit zoom with speed `v` (css px per frame
  // along it, positive = onward). Project where the momentum would run out,
  // take the work nearest that point, and glide to it with one dampening
  // curve whose initial speed matches the fling: a free carousel that always
  // comes to rest on a work, never on the gap between two.
  function releaseStrip(v) {
    if (mode !== "strip" || !focused) return;
    const here = cameraAlong();
    const idx = items.indexOf(focused);
    let target = focused;
    if (Math.abs(v) > FLING_V) {
      const rest = here + (v * STRIP_MOMENTUM) / camera.zoom; // world units
      let best = Infinity;
      for (const it of items) {
        const d = Math.abs(ringOffset(rest, centreAlong(it)));
        if (d < best) {
          best = d;
          target = it;
        }
      }
      // a fling always moves on at least one work in its direction
      const ahead = ringOffset(centreAlong(focused), centreAlong(target)) * Math.sign(v);
      if (ahead <= 0) target = items[(idx + Math.sign(v) + items.length) % items.length];
    } else {
      // a slow release: past the threshold turns the page, otherwise recentre
      const off = ringOffset(here, centreAlong(focused));
      const threshold = (PAGE_FRACTION * stripSpan()) / camera.zoom;
      if (off < -threshold) target = items[(idx + 1) % items.length];
      else if (off > threshold) target = items[(idx - 1 + items.length) % items.length];
    }
    // duration so that the ease-out's initial speed (3·distance/ms) matches the fling
    const distPx = Math.abs(ringOffset(here, centreAlong(target))) * camera.zoom;
    const speed = Math.max(Math.abs(v) / 16, 1e-3); // css px per ms
    const ms = Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, (3 * distPx) / speed));
    if (target === focused) flyTo(focused, true, null, ms, easeOut);
    else setFocus(target, { ms, ease: easeOut });
  }

  // The wheel swipe is over: release with its speed and swallow its tail.
  function endWheel() {
    if (!wheel.active) return;
    wheel.active = false;
    wheel.busyUntil = performance.now() + WHEEL_TAIL_MS;
    releaseStrip(wheel.v);
  }

  // Drift guard for the strip: nothing in flight, nothing streaming, yet not
  // centred (a resize, an interrupted glide) → glide home.
  function settle() {
    if (mode !== "strip" || fly || !focused || wheel.active || performance.now() < wheel.quietAt) return;
    if (camera.zoom > fitZoom(focused) * 1.02) return; // inspecting: free to roam the work
    const r = focused.rect;
    const d = camera.delta(r.x + r.w / 2, r.y + r.h / 2);
    if (Math.abs(d.dx) > 0.5 || Math.abs(d.dy) > 0.5) releaseStrip(0);
  }

  function step(dir) {
    const i = items.indexOf(focused);
    setFocus(items[(i + dir + items.length) % items.length]);
  }

  $("caption-close").addEventListener("click", exitStrip);
  const hint = $("hint");

  // --- view switch -------------------------------------------------------
  const modeEl = $("mode");
  function syncModeUI() {
    const strip = mode === "strip" || mode === "entering";
    for (const b of modeEl.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String((b.dataset.mode === "strip") === strip));
    }
  }

  // The work closest to the middle of the view (across the wrap).
  function nearestToCentre() {
    let best = null;
    let bestD = Infinity;
    for (const it of items) {
      const { x, y, w, h } = it.rect;
      const { dx, dy } = camera.delta(x + w / 2, y + h / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  modeEl.addEventListener("click", (e) => {
    const want = e.target.closest("button")?.dataset.mode;
    if (!want || mode === "entering" || mode === "leaving") return;
    hint.classList.add("gone");
    if (want === "strip" && mode === "roam") setFocus(nearestToCentre());
    else if (want === "globe" && mode === "strip") exitStrip();
    e.target.closest("button").blur(); // keep the keyboard on the canvas
  });

  // --- input -------------------------------------------------------------
  // Which work is under a screen point, through the same projection that drew it.
  const bulgeOf = (item) =>
    mode === "strip" ? 0 : BULGE * (1 - flatEase(item === flat.item ? flat.k : 0));
  function pick(sx, sy) {
    if (sx < 0) return null;
    if (TANGENT) return pickTangent(items, camera, sx, sy, bulgeOf);
    const { x, y } = camera.screenToWorld(sx, sy);
    return hitTest(items, camera.tile, x, y);
  }

  const input = createInput(canvas, camera, {
    locked: () => mode === "entering" || mode === "leaving",
    onInteract() {
      fly = null;
      hint.classList.add("gone");
    },
    onMove: mark,
    onHover(sx, sy) {
      const hit = mode === "roam" ? pick(sx, sy) : null;
      if (hit !== hovered) {
        hovered = hit;
        canvas.classList.toggle("over", !!hit && !input.dragging());
        mark();
      }
    },
    onTap(sx, sy) {
      const hit = pick(sx, sy);
      if (mode === "roam" && hit) setFocus(hit);
      else if (mode === "strip" && !hit) exitStrip(); // tap the space around a work to leave
    },
    // Scrolling in the strip: the wheel pans it 1:1 (either axis of the
    // wheel) while events stream. When the stream dies away (trackpad
    // inertia) or pauses, that's the release: the strip glides on to a work.
    // The rest of that swipe's inertia is swallowed. Zoomed in to inspect,
    // the wheel pans the work instead.
    onWheel(dx, dy) {
      if (mode !== "strip") return false;
      hint.classList.add("gone");
      const now = performance.now();
      if (camera.zoom > fitZoom(focused) * 1.02) {
        fly = null;
        camera.panByScreen(-dx, -dy);
        return true;
      }
      if (now < wheel.busyUntil) {
        wheel.busyUntil = now + WHEEL_TAIL_MS; // still the last swipe's inertia
        return true;
      }
      const d = dx + dy;
      if (!wheel.active || now > wheel.quietAt) {
        Object.assign(wheel, { active: true, v: 0, peak: 0, slowing: 0, last: now - 16 });
        fly = null; // a new swipe takes over from any glide
      }
      const v = (d / Math.max(1, now - wheel.last)) * 16;
      wheel.slowing = Math.abs(v) < Math.abs(wheel.v) ? wheel.slowing + 1 : 0;
      wheel.v = 0.5 * wheel.v + 0.5 * v;
      wheel.peak = Math.max(wheel.peak, Math.abs(v));
      wheel.last = now;
      wheel.quietAt = now + WHEEL_QUIET_MS;
      if (stripAxis === "x") camera.panByScreen(-d, 0);
      else camera.panByScreen(0, -d);
      // three events of falling speed after a real push: the fingers are off
      if (wheel.slowing >= 3 && wheel.peak > FLING_V) endWheel();
      return true;
    },
    // Dragging the strip at fit zoom only moves along it.
    dragAxis: () => (mode === "strip" && focused && camera.zoom <= fitZoom(focused) * 1.02 ? stripAxis : "xy"),
    // Letting go of the strip at fit zoom: glide on to a work (see
    // releaseStrip). The finger's speed is the content's; onward is negative.
    onRelease(vx, vy) {
      if (mode !== "strip" || !focused || camera.zoom > fitZoom(focused) * 1.02) return false;
      releaseStrip(-along({ dx: vx, dy: vy }));
      return true;
    },
    onStep(dir) {
      if (mode !== "strip") return false;
      step(dir);
      return true;
    },
    onHome() {
      if (mode === "strip") {
        exitStrip();
        return;
      }
      if (mode !== "roam") return;
      fly = {
        from: { x: camera.x, y: camera.y, zoom: camera.zoom },
        to: { x: camera.x, y: camera.y, zoom: homeZoom() },
        start: performance.now(),
      };
    },
    onEscape: exitStrip,
  });

  // --- initial view ------------------------------------------------------
  camera.setZoom(homeZoom());
  const hash = decodeURIComponent(location.hash.slice(1));
  const linked = hash && items.find((it) => it.public_id === hash);
  if (linked) {
    setFocus(linked, { animate: false }); // straight into the strip
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
    // A transition can't be left hanging: if its fly is gone, land it now.
    if ((mode === "entering" || mode === "leaving") && !fly && pending) {
      dim = mode === "entering" ? 1 : 0;
      pending();
    }
    busy = stepFlat(dt) || busy;
    busy = stepDim(dt) || busy;
    const coasting = input.tick(dt);
    busy = coasting || busy;
    if (wheel.active && now > wheel.quietAt) endWheel(); // the swipe paused: release
    if (!coasting && !input.dragging()) settle();

    if (now - lastMaintain > MAINTAIN_MS) {
      lastMaintain = now;
      textures.maintain(camera, focused);
    }

    if (dirty || busy) {
      camera.wrap();
      renderer.draw(camera, items, textures, { hovered, focused, flat, flatAll: mode === "strip", dim });
      dirty = false;

      const z = `${Math.round(camera.zoom * 100)}%`;
      if (z !== zoomShown) zoomEl.textContent = zoomShown = z;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
