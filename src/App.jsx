import { useEffect, useState } from "react";
import "./App.css";
import Loader from "./LoadIn";

const CLOUD_NAME = "dbgxvkfqw";
const CLOUD_TAG = "african-art";
const CLOUD_LIST_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/list/${CLOUD_TAG}.json`;

const App = () => {
  const [artworks, setArtworks] = useState([]);
  const [selectedImg, setSelectedImg] = useState(null);
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [loadedImages, setLoadedImages] = useState(new Set());
  const [modalImageLoaded, setModalImageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Cloudinary list by tag
      const cld = await fetch(CLOUD_LIST_URL)
        .then((r) => r.json())
        .catch(() => ({ resources: [] }));

      const assets = (cld.resources || []).map((r) => {
        const publicId = r.public_id; // includes folder if present
        const format = r.format || "jpg";
        const base = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

        // Get original dimensions and calculate aspect ratio
        const width = r.width || 1;
        const height = r.height || 1;
        const aspectRatio = width / height;

        return {
          public_id: publicId,
          width,
          height,
          aspectRatio,
          // Low-res placeholder maintaining aspect ratio
          placeholder: `${base}/w_50,ar_${aspectRatio.toFixed(
            3
          )},c_fill,q_auto,f_auto,e_blur:300/${publicId}.${format}`,
          // smaller thumb for grid + full-size for modal; both optimized
          thumb: `${base}/c_fill,w_600,f_auto,q_auto/${publicId}.${format}`,
          full: `${base}/f_auto,q_auto/${publicId}.${format}`,
        };
      });

      // Views from Google Sheets (format: [{ public_id, views }])
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

  // After artworks render, wait for images to load → show + relayout masonry
  useEffect(() => {
    const masonry = document.querySelector("masonry-grid");
    const imgs = Array.from(document.querySelectorAll("masonry-grid img"));
    if (!masonry || imgs.length === 0) return;

    artworks.forEach((artwork) => {
      const img = new Image();
      img.onload = () => {
        setLoadedImages((prev) => new Set([...prev, artwork.public_id]));
        // Re-layout after each high-res image loads to adjust for size differences
        setTimeout(() => {
          if (typeof masonry.layout === "function") masonry.layout();
        }, 10);
      };
      img.src = artwork.thumb;
    });
  }, []);

  // View handler → POST to Apps Script (upsert by public_id) + optimistic UI
  const handleView = async (public_id) => {
    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id }),
    }).catch(() => {
      /* ignore for optimistic UI */
    });

    // setArtworks((prev) =>
    //   prev
    //     .map((a) =>
    //       a.public_id === public_id ? { ...a, views: a.views + 1 } : a
    //     )
    //     .sort((a, b) => b.views - a.views)
    // );
  };

  // Handle image click - increment view and show modal
  const handleImageClick = (artwork) => {
    handleView(artwork.public_id);
    setSelectedArtwork(artwork);
    setSelectedImg(artwork.full);
    setModalImageLoaded(false); // Reset modal image loading state
  };

  // Handle modal image load
  const handleModalImageLoad = () => {
    setModalImageLoaded(true);
  };

  // Close modal
  const closeModal = () => {
    setSelectedImg(null);
    setSelectedArtwork(null);
    setModalImageLoaded(false);
  };

  return (
    <>
      <Loader />

      <div className="columns-2 sm:columns-5 md:columns-5 lg:columns-7 2xl:columns-9 gap-2 md:gap-4 p-2 md:p-4">
        {artworks.map((item) => {
          // const isHighResLoaded = loadedImages.has(item.public_id);
          return (
            // <div key={item.public_id} style={{ position: "relative" }}>
            <img
              key={item.public_id}
              // src={isHighResLoaded ? item.thumb : item.placeholder}
              src={item.thumb}
              alt={item.public_id}
              loading="lazy"
              onClick={() => handleImageClick(item)}
              className="cursor-pointer  rounded-xl select-none mb-2 md:mb-4 transition-all duration-200 ease-in-out inset-ring ring-4 ring-transparent hover:ring-white/20 hover:opacity-70"
            />
          );
        })}
      </div>

      {selectedImg && selectedArtwork && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content bg-black relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Show low-res thumb first, then high-res when loaded */}

            <img
              src={selectedArtwork.thumb}
              alt="Preview"
              style={{
                display: modalImageLoaded ? "none" : "block",
                opacity: "0.6",
              }}
            />
            <img
              src={selectedImg}
              alt="Preview"
              style={{
                display: modalImageLoaded ? "block" : "none",
              }}
              onLoad={handleModalImageLoad}
            />
            {/* Loading indicator */}
            {modalImageLoaded ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    bottom: "8px",
                    right: "8px",
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    pointerEvents: "none",
                  }}
                >
                  👁️ {selectedArtwork.views}
                </div>

                <button
                  className="absolute top-4 right-4 rounded-xl bg-white/50 text-black p-1 px-3 cursor-pointer font-bold transition-transform hover:scale-110"
                  onClick={closeModal}
                >
                  &times;
                </button>
              </>
            ) : (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", gap: "10px" }}>
                    <div className="wave-dot" />
                    <div className="wave-dot" />
                    <div className="wave-dot" />
                  </div>
                </div>
              </>
            )}
            {/* Exit button */}
          </div>
        </div>
      )}
    </>
  );
};

export default App;
