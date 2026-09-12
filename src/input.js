// Pointer, wheel and keyboard → camera. Figma conventions: drag or two-finger
// scroll pans, pinch or ctrl/cmd+wheel zooms about the cursor, a clean tap is
// a click. Momentum after a fling.
const TAP_SLOP = 5;
const FRICTION = 0.9; // velocity retained per 16ms

export function createInput(canvas, camera, handlers) {
  const pointers = new Map();
  let drag = null; // { x, y, moved, vx, vy, last }
  let pinch = null; // { dist, mx, my }
  let vx = 0;
  let vy = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const interact = () => {
    vx = vy = 0;
    handlers.onInteract();
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (handlers.locked()) return; // mid-transition: let it land
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    interact();
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, moved: false, vx: 0, vy: 0, last: performance.now() };
      canvas.classList.add("dragging");
    } else if (pointers.size === 2) {
      drag = null;
      pinch = pinchState();
    }
  });

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) {
      handlers.onHover(e.clientX, e.clientY);
      return;
    }
    const p = pointers.get(e.pointerId);
    let dx = e.clientX - p.x;
    let dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pinch && pointers.size === 2) {
      const next = pinchState();
      camera.zoomAt(next.mx, next.my, next.dist / (pinch.dist || 1));
      camera.panByScreen(next.mx - pinch.mx, next.my - pinch.my);
      pinch = next;
      handlers.onMove();
    } else if (drag) {
      const axis = handlers.dragAxis();
      if (axis === "x") dy = 0;
      else if (axis === "y") dx = 0;
      const now = performance.now();
      const dt = Math.max(1, now - drag.last);
      drag.last = now;
      // exponential average keeps the fling velocity from spiking on the last event
      drag.vx = 0.7 * drag.vx + 0.3 * (dx / dt) * 16;
      drag.vy = 0.7 * drag.vy + 0.3 * (dy / dt) * 16;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TAP_SLOP) drag.moved = true;
      camera.panByScreen(dx, dy);
      handlers.onMove();
    }
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && pointers.size === 0) {
      canvas.classList.remove("dragging");
      if (!drag.moved) handlers.onTap(e.clientX, e.clientY);
      else if (handlers.onRelease(drag.vx, drag.vy)) {
        // the handler owns what happens next: no momentum
      } else if (!reduceMotion && performance.now() - drag.last < 80) {
        vx = drag.vx;
        vy = drag.vy;
      }
      drag = null;
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => handlers.onHover(-1, -1));

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (handlers.locked()) return;
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? camera.vh : 1;
      if (e.ctrlKey || e.metaKey) {
        interact();
        const f = Math.exp(-e.deltaY * k * 0.01);
        camera.zoomAt(e.clientX, e.clientY, Math.min(1.5, Math.max(0.67, f)));
      } else if (handlers.onWheel(e.deltaX * k, e.deltaY * k)) {
        vx = vy = 0; // the handler owns the motion; don't cancel its flies
      } else {
        interact();
        camera.panByScreen(-e.deltaX * k, -e.deltaY * k);
      }
      handlers.onMove();
    },
    { passive: false }
  );

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 80;
    const cx = camera.vw / 2;
    const cy = camera.vh / 2;
    const map = {
      ArrowLeft: () => handlers.onStep(-1) || camera.panByScreen(step, 0),
      ArrowRight: () => handlers.onStep(1) || camera.panByScreen(-step, 0),
      ArrowUp: () => handlers.onStep(-1) || camera.panByScreen(0, step),
      ArrowDown: () => handlers.onStep(1) || camera.panByScreen(0, -step),
      "+": () => camera.zoomAt(cx, cy, 1.25),
      "=": () => camera.zoomAt(cx, cy, 1.25),
      "-": () => camera.zoomAt(cx, cy, 0.8),
      "0": () => handlers.onHome(),
      Escape: () => handlers.onEscape(),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    if (handlers.locked()) return; // mid-transition: let it land
    interact();
    fn();
    handlers.onMove();
  });

  return {
    // Apply momentum; returns true while still coasting.
    tick(dt) {
      if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return false;
      const decay = Math.pow(FRICTION, dt / 16);
      camera.panByScreen(vx * (dt / 16), vy * (dt / 16));
      vx *= decay;
      vy *= decay;
      return true;
    },
    dragging: () => drag !== null || pinch !== null,
  };
}
