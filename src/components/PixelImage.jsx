/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { rungUrl } from "../lib/cloudinary";
import { withSlot } from "../lib/loadQueue";

// Progressive pixelated loading: each rung is a real network request, so the
// pixelation IS the loading state — resolution steps up as bytes arrive, then
// the final image is revealed block-by-block in Bayer (ordered-dither) order.
const RUNGS = [16, 64];
const FINAL_WIDTH = 600;
const CANVAS_WIDTH = 320;
const BLOCK = 8;
const REVEAL_MS = 500;

// 8x8 Bayer matrix — the classic ordered-dither threshold map.
const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const loadImage = (src) =>
  withSlot(
    () =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      })
  );

const PixelImage = ({ item, onClick, className = "" }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const canvasHeight = Math.max(1, Math.round(CANVAS_WIDTH / item.aspectRatio));

  // Start loading a bit before the tile scrolls into view, once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return; // already revealed → canvas swapped for <img>

    const ctx = canvas.getContext("2d");
    let cancelled = false;
    let raf = 0;

    const run = async () => {
      // Climb the ladder: draw each rung upscaled with smoothing off.
      for (const width of RUNGS) {
        try {
          const img = await loadImage(rungUrl(item, width));
          if (cancelled) return;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } catch {
          // a missing rung just means we stay on the previous one
        }
      }

      let full;
      try {
        full = await loadImage(rungUrl(item, FINAL_WIDTH));
      } catch {
        return;
      }
      if (cancelled) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setRevealed(true);
        return;
      }

      // Smooth-scale the final image once, then blit it in block by block.
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const offCtx = off.getContext("2d");
      offCtx.imageSmoothingEnabled = true;
      offCtx.imageSmoothingQuality = "high";
      offCtx.drawImage(full, 0, 0, off.width, off.height);

      const blocks = [];
      for (let y = 0; y < canvas.height; y += BLOCK) {
        for (let x = 0; x < canvas.width; x += BLOCK) {
          blocks.push({ x, y, t: BAYER_8[(y / BLOCK) % 8][(x / BLOCK) % 8] / 64 });
        }
      }
      blocks.sort((a, b) => a.t - b.t);

      let i = 0;
      let start;
      const tick = (now) => {
        if (cancelled) return;
        if (start === undefined) start = now;
        const t = (now - start) / REVEAL_MS;
        while (i < blocks.length && blocks[i].t <= t) {
          const b = blocks[i++];
          ctx.drawImage(off, b.x, b.y, BLOCK, BLOCK, b.x, b.y, BLOCK, BLOCK);
        }
        if (i < blocks.length) {
          raf = requestAnimationFrame(tick);
        } else {
          setRevealed(true);
        }
      };
      raf = requestAnimationFrame(tick);
    };

    run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [inView, item]);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      style={{ aspectRatio: `${item.width} / ${item.height}` }}
      className={`cursor-pointer overflow-hidden rounded-2xl select-none mb-2 md:mb-4 break-inside-avoid bg-neutral-900 transition-all duration-200 ease-in-out ring-4 ring-transparent hover:ring-stone-900 hover:opacity-70 ${className}`}
    >
      {revealed ? (
        <img
          src={rungUrl(item, FINAL_WIDTH)}
          alt={item.public_id}
          draggable="false"
          className="w-full h-full object-cover"
          style={{ borderRadius: 0, background: "transparent" }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={canvasHeight}
          role="img"
          aria-label={item.public_id}
          className="w-full h-full"
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </div>
  );
};

export default PixelImage;
