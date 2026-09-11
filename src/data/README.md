# data

- `tweets.txt` — batch input for `scripts/ingest.mjs`: one tweet URL per line,
  an optional photo number, and an optional `# <legacy public_id>` naming the
  work it replaces. The attribution checklist's export writes this format.
- `artists.json` — legacy: Twitter/X handles recovered from the filenames of
  the original local images. Reference only; attribution now lives on the
  Cloudinary assets themselves (see README).
