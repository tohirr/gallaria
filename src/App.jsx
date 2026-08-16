import { useEffect, useRef, useState } from "react";
import Loader from "./LoadIn";
import PixelImage from "./components/PixelImage";
import { CLOUD_LIST_URL, rungUrl, fullUrl } from "./lib/cloudinary";

const BATCH_SIZE = 30;
// How many thumbs the intro loader waits for before revealing the grid.
const PRELOAD_COUNT = 12;

const App = () => {
  const [artworks, setArtworks] = useState(null); // null = still fetching
  const [selected, setSelected] = useState(null);
  const [modalImageLoaded, setModalImageLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [preloadedCount, setPreloadedCount] = useState(0);
  const sentinelRef = useRef(null);

  // Fetch catalog from Cloudinary, merge view counts from the Sheets API.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cld = await fetch(CLOUD_LIST_URL)
        .then((r) => r.json())
        .catch(() => ({ resources: [] }));

      const assets = (cld.resources || []).map((r) => {
        const asset = {
          public_id: r.public_id,
          format: r.format || "jpg",
          width: r.width || 1,
          height: r.height || 1,
        };
        return {
          ...asset,
          aspectRatio: asset.width / asset.height,
          thumb: rungUrl(asset, 600),
          full: fullUrl(asset),
        };
      });

      const rows = await fetch("/api/views")
        .then((r) => r.json())
        .catch(() => []);

      const viewsMap = new Map(
        rows.map((x) => [x.public_id, Number(x.views) || 0])
      );

      const merged = assets
        .map((a) => ({ ...a, views: viewsMap.get(a.public_id) ?? 0 }))
        .sort((a, b) => b.views - a.views);

      if (!cancelled) setArtworks(merged);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Preload the first few thumbs so the intro loader reports real progress.
  useEffect(() => {
    if (!artworks || artworks.length === 0) return;

    let cancelled = false;
    artworks.slice(0, PRELOAD_COUNT).forEach((a) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (!cancelled) setPreloadedCount((n) => n + 1);
      };
      img.src = rungUrl(a, 16); // first rung of the pixel ladder
    });

    return () => {
      cancelled = true;
    };
  }, [artworks]);

  const preloadTotal = artworks
    ? Math.min(PRELOAD_COUNT, artworks.length)
    : PRELOAD_COUNT;
  const progress =
    artworks === null
      ? 0.05 // catalog request in flight
      : preloadTotal === 0
      ? 1 // nothing to load (fetch failed or empty tag)
      : 0.15 + 0.85 * Math.min(1, preloadedCount / preloadTotal);

  const hasMore = artworks !== null && visibleCount < artworks.length;

  // Infinite scroll: grow the visible window while the sentinel is in range.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((n) => n + BATCH_SIZE);
        }
      },
      { rootMargin: "600px" }
    );

    // Re-observe after each growth: observing fires an immediate callback with
    // the current state, so if the sentinel is still in range we keep loading
    // until it leaves the margin or unmounts (hasMore = false).
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // Batches render as separate column containers so already-laid-out rows
  // don't rebalance when a new batch appends.
  const batches = [];
  if (artworks) {
    for (let i = 0; i < Math.min(visibleCount, artworks.length); i += BATCH_SIZE) {
      batches.push(artworks.slice(i, i + BATCH_SIZE));
    }
  }

  const handleImageClick = (artwork) => {
    // Fire-and-forget view count; the UI doesn't wait on it.
    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: artwork.public_id }),
    }).catch(() => {});

    setSelected(artwork);
    setModalImageLoaded(false);
  };

  const closeModal = () => {
    setSelected(null);
    setModalImageLoaded(false);
  };

  return (
    <>
      <Loader progress={progress} />

      {batches.map((batch) => (
        <div
          key={batch[0].public_id}
          className="columns-2 sm:columns-5 md:columns-5 lg:columns-7 2xl:columns-9 gap-2 md:gap-4 p-2 md:p-4"
        >
          {batch.map((item) => (
            <PixelImage
              key={item.public_id}
              item={item}
              onClick={() => handleImageClick(item)}
            />
          ))}
        </div>
      ))}

      {hasMore && (
        <div
          ref={sentinelRef}
          className="h-10 flex justify-center items-center font-mono text-sm text-gray-500"
        >
          loading more...
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content bg-black relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Low-res thumb holds the frame until the full image decodes */}
            <img
              src={selected.thumb}
              alt="Preview"
              style={{
                display: modalImageLoaded ? "none" : "block",
                opacity: "0.6",
              }}
            />
            <img
              src={selected.full}
              alt="Preview"
              style={{ display: modalImageLoaded ? "block" : "none" }}
              onLoad={() => setModalImageLoaded(true)}
            />

            {modalImageLoaded ? (
              <>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded-lg text-xs pointer-events-none">
                  👁️ {selected.views}
                </div>
                <button
                  className="absolute top-4 right-4 rounded-xl bg-white/50 text-black p-1 px-3 cursor-pointer font-bold transition-transform hover:scale-110"
                  onClick={closeModal}
                >
                  &times;
                </button>
              </>
            ) : (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2.5">
                <div className="wave-dot" />
                <div className="wave-dot" />
                <div className="wave-dot" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default App;
