# data

`artists.json` — Twitter/X handles of the artists whose work is in the collection.
Extracted from the filenames of the original local images (`public/assets/images/*.jpg`,
removed in the cleanup pass — recoverable from git history). Most entries are handles
(`https://twitter.com/<name>`); a few (e.g. `F7ohRnoXMAAvJsG`) are raw Twitter media IDs
from saved images and need manual attribution.

Next step: map these to Cloudinary `public_id`s so the gallery can credit and link each artist.
