// Intro loader driven by real progress (0..1). Same shape as the old React
// one: white sheet, black fill from the top, percentage in exclusion blend.
export function createLoader() {
  const root = document.getElementById("loader");
  const fill = root.querySelector(".fill");
  const pct = root.querySelector(".pct");

  return {
    set(progress) {
      const p = Math.round(Math.min(1, Math.max(0, progress)) * 100);
      fill.style.height = `${p}%`;
      pct.textContent = `${p}%`;
    },
    done() {
      this.set(1);
      root.classList.add("done");
      root.addEventListener("transitionend", () => root.remove(), { once: true });
    },
  };
}
