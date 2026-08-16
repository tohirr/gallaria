// Global semaphore so a grid of PixelImages doesn't fire hundreds of
// concurrent requests at once; loads queue and start as slots free up.
const MAX_CONCURRENT = 8;
let active = 0;
const waiting = [];

export async function withSlot(task) {
  if (active >= MAX_CONCURRENT) {
    await new Promise((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}
