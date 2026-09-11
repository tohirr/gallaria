export const CLOUD_NAME = "dbgxvkfqw";
export const CLOUD_TAG = "african-art";
export const CLOUD_LIST_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/list/${CLOUD_TAG}.json`;

const BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;

// c_limit never upscales, so every rung of the ladder keeps the original
// aspect ratio and the tiny rungs stay tiny (a w_16 is ~300 bytes).
export const rungUrl = ({ public_id, format }, width) =>
  `${BASE}/c_limit,w_${width},f_auto,q_auto/${public_id}.${format}`;

export const fullUrl = ({ public_id, format }) =>
  `${BASE}/f_auto,q_auto/${public_id}.${format}`;
