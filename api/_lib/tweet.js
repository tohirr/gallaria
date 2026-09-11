// Resolve a tweet to its author and original-size photos via the fxtwitter
// API (no auth needed).
export const TWEET_RE = /(?:twitter|x)\.com\/(\w+)\/status\/(\d+)/;

// A tweet URL copied from an open photo ends in /photo/N; that N is the
// photo the person was looking at.
export const photoInUrl = (url) => Number(String(url).match(/\/photo\/(\d+)/)?.[1]) || null;

export async function resolveTweet(url) {
  const m = String(url).match(TWEET_RE);
  if (!m) throw new Error("not a tweet url");
  const [, handle, id] = m;
  const res = await fetch(`https://api.fxtwitter.com/${handle}/status/${id}`, {
    headers: { "user-agent": "gallaria" },
  });
  const data = await res.json().catch(() => ({}));
  if (data.code !== 200 || !data.tweet) throw new Error(data.message || `tweet lookup failed (${res.status})`);
  const t = data.tweet;
  return {
    id,
    url: t.url,
    text: t.text,
    artist: { handle: t.author.screen_name, name: t.author.name, url: t.author.url },
    photos: (t.media?.photos || []).map((p) => ({
      // strip any size suffix and ask for the original upload
      url: p.url.replace(/\?.*$/, "").replace(/:\w+$/, "") + "?name=orig",
      width: p.width,
      height: p.height,
    })),
  };
}

// Upload the selected photos of a tweet with their attribution as context.
// `photos` is a list of 1-based photo numbers (or "all"); numbers the tweet
// doesn't have are ignored. `replaces` is the legacy public_id this work
// supersedes, if any — attached to the first uploaded photo only.
export async function linkTweet({ tweet, photos, replaces }, uploadFromUrl) {
  photos ??= [photoInUrl(tweet) || 1];
  const info = await resolveTweet(tweet);
  const count = info.photos.length;
  if (count === 0) throw new Error("tweet has no photos");
  const picks = (photos === "all" ? info.photos.map((_, i) => i + 1) : photos)
    .map(Number)
    .filter((n, i, arr) => n >= 1 && n <= count && arr.indexOf(n) === i)
    .sort((a, b) => a - b);
  if (picks.length === 0) throw new Error(`tweet has ${count} photo${count === 1 ? "" : "s"}; none of those selected`);

  const works = [];
  for (const n of picks) {
    const p = info.photos[n - 1];
    const slug = `${info.artist.handle.toLowerCase()}-${info.id}${count > 1 ? `-${n}` : ""}`;
    const up = await uploadFromUrl(p.url, slug, {
      tweet: info.url,
      artist: info.artist.handle,
      artist_name: info.artist.name,
      replaces: works.length === 0 ? replaces : undefined,
    });
    works.push({ public_id: up.public_id, width: up.width, height: up.height, format: up.format, photo: n });
  }
  return { artist: info.artist, tweet: info.url, photos: count, works };
}
