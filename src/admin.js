// Admin mode: open the site with `?admin=<token>` once (the token is kept in
// localStorage and stripped from the URL), then `?admin` from there on. Paste
// a tweet and the work is uploaded to Cloudinary with its attribution; focus
// a legacy work first to replace it.
const KEY = "gallaria-admin-token";

export function createAdmin({ onLinked }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("admin")) return null;

  let token = params.get("admin") || localStorage.getItem(KEY) || "";
  if (!token) {
    try {
      token = prompt("admin token") || "";
    } catch {
      token = "";
    }
    if (!token) return null;
  }
  localStorage.setItem(KEY, token);
  if (params.get("admin")) history.replaceState(null, "", `${location.pathname}?admin${location.hash}`);

  const form = document.getElementById("admin");
  const tweet = document.getElementById("admin-tweet");
  const picks = [...document.querySelectorAll("#admin-photos button")];
  picks.forEach((b) =>
    b.addEventListener("click", () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"))
  );
  const selected = () => picks.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => Number(b.textContent));
  const target = document.getElementById("admin-target");
  const status = document.getElementById("admin-status");
  const hideBtn = document.getElementById("admin-hide");
  form.hidden = false;

  let focused = null;

  async function call(body) {
    status.textContent = "…";
    form.classList.add("busy");
    try {
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) localStorage.removeItem(KEY);
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    } finally {
      form.classList.remove("busy");
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const replaces = focused?.legacy ? focused.public_id : undefined;
    try {
      const result = await call({ action: "link", tweet: tweet.value.trim(), photos: selected(), replaces });
      status.textContent = `linked @${result.artist.handle}, ${result.works.length} of ${result.photos} photo${result.photos === 1 ? "" : "s"}`;
      tweet.value = "";
      onLinked(result.works[0]);
    } catch (err) {
      status.textContent = err.message;
    }
  });

  hideBtn.addEventListener("click", async () => {
    if (!focused?.legacy) return;
    try {
      await call({ action: "hide", public_id: focused.public_id });
      status.textContent = "hidden";
      onLinked(null);
    } catch (err) {
      status.textContent = err.message;
    }
  });

  return {
    setFocus(item) {
      focused = item;
      const legacy = item?.legacy;
      target.textContent = legacy ? `replaces ${item.public_id.split("/").pop()}` : "adds a new work";
      hideBtn.hidden = !legacy;
      status.textContent = "";
    },
  };
}
