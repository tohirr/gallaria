export const CLOUD_NAME = "dbgxvkfqw";
export const TAG = "gallaria"; // attributed works, uploaded from tweets
export const LEGACY_TAG = "african-art"; // original collection, being phased out

const BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

// c_limit never upscales, so every rung of the ladder keeps the original
// aspect ratio and the tiny rungs stay tiny (a w_16 is ~300 bytes).
// The tiny rungs are fixed-format jpg so they can be pre-generated at upload
// (f_auto can't be eager); the big ones pick avif/webp per browser.
export const rungUrl = ({ public_id, format }, width) =>
  `${BASE}/c_limit,w_${width},${width <= 64 ? "f_jpg" : "f_auto"},q_auto/${public_id}.${format}`;

export const fullUrl = ({ public_id, format }) =>
  `${BASE}/f_auto,q_auto/${public_id}.${format}`;
