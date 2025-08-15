import { useEffect, useState } from "react";
import "./App.css";
import Loader from "./LoadIn";

const CLOUD_NAME = "dbgxvkfqw"; // ← change me
const CLOUD_TAG = "african-art"; // ← change me (the tag on your assets)
const CLOUD_LIST_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/list/${CLOUD_TAG}.json`;

const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbwc0_R9vEBNN5GaNFntxk290mjV4eo8j52xLTC3hfoLd6QzPFU19W0rxP6cFKO-w60qJQ/exec"; // ← change me

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
      const rows = await fetch(SHEET_API_URL)
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
  }, [artworks.length]);

  // View handler → POST to Apps Script (upsert by public_id) + optimistic UI
  const handleView = async (public_id) => {
    fetch(SHEET_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id }),
    }).catch(() => {
      /* ignore for optimistic UI */
    });

    setArtworks((prev) =>
      prev
        .map((a) =>
          a.public_id === public_id ? { ...a, views: a.views + 1 } : a
        )
        .sort((a, b) => b.views - a.views)
    );
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
      <masonry-grid>
        {artworks.map((item) => {
          const isHighResLoaded = loadedImages.has(item.public_id);
          return (
            // <div key={item.public_id} style={{ position: "relative" }}>
            <img
              key={item.public_id}
              src={isHighResLoaded ? item.thumb : item.placeholder}
              alt={item.public_id}
              style={{
                cursor: "pointer",
                // width: "100%",
                // display: "block",
              }}
              loading="lazy"
              onClick={() => handleImageClick(item)}
            />
            //  <div
            //   style={{
            //     position: "absolute",
            //     bottom: "8px",
            //     right: "8px",
            //     background: "rgba(0, 0, 0, 0.7)",
            //     color: "white",
            //     padding: "4px 8px",
            //     borderRadius: "4px",
            //     fontSize: "12px",
            //     pointerEvents: "none",
            //   }}
            // >
            // 👁️ {item.views}
            // </div>
            // </div>
          );
        })}
      </masonry-grid>

      {selectedImg && selectedArtwork && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content bg-black"
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
            {!modalImageLoaded && (
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
            <button
              className="absolute top-4 right-4 rounded-xl bg-white/50 text-black p-1 px-3 cursor-pointer font-bold transition-transform hover:scale-110"
              onClick={closeModal}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
