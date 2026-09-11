// Intro loader driven by real progress (0..1). Same shape as the old React
// one: white sheet, black fill from the top, percentage in exclusion blend.
export function createLoader() {
  const root = document.getElementById("loader");
  const fill = root.querySelector(".fill");
  const pct = root.querySelector(".pct");

  let shown = 0;
  let raf = 0;

  const paint = (p) => {
    const n = Math.round(p * 100);
    fill.style.height = `${n}%`;
    pct.textContent = `${n}%`;
  };

  const loader = {
    // Real progress: jump straight there.
    set(progress) {
      cancelAnimationFrame(raf);
      shown = Math.min(1, Math.max(shown, progress));
      paint(shown);
    },
    // Waiting on something with no progress signal (a slow request): creep
    // toward `limit` and never reach it, so the bar keeps moving but a real
    // `set` is always ahead of it.
    trickle(limit) {
      cancelAnimationFrame(raf);
      let last = performance.now();
      const tick = (now) => {
        const dt = (now - last) / 1000;
        last = now;
        shown += (limit - shown) * (1 - Math.exp(-dt / 2.5));
        paint(Math.min(shown, limit - 0.01));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    done() {
      this.set(1);
      root.classList.add("done");
      root.addEventListener("transitionend", () => root.remove(), { once: true });
    },
  };
  return loader;
}
