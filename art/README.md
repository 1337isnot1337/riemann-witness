# Badge artwork

The engraving shows the magnitude of the Riemann zeta function across the critical strip for heights 9 through 36. Five gold marks sit on the floor at the first five nontrivial zeros. The original vector drawing uses an Euler–Maclaurin approximation. Its geometry is independent of the registry.

The 1200 × 630 social card and 900 × 1200 portrait combine the engraving, a rosette and a personal inscription. Each identifies November 20, 2026 as the event date. A numbered card records the actual server-issued UTC signup time to the second. The specimen displays an unnumbered paper label.

## Rebuild

The generated modules are committed. A normal build needs only Node.js. To regenerate the artwork on Arch Linux, install Python, Pillow, fontTools, librsvg, noto-fonts and ttf-dejavu. Run the following from the checkout.

```sh
python art/make_plate.py
python art/make_badges.py
```

Noto Serif Display supplies the title and inscription. DejaVu Sans Mono supplies the registry metadata. The rasterized type credits and font licenses are in [public/badge-assets](../public/badge-assets).

## Rendering and names

`badgePng(witness, portrait, host)` returns a Promise for an indexed PNG as a Uint8Array. Supply a server record with `id`, `name` and an ISO UTC `created_at`, or pass null for the specimen. Use the public host used by the share link.

`nameSupported(name)` validates the inscription after NFC normalization. It accepts 1–48 code points including at least one non-space character. The inscription atlas includes printable ASCII, selected Latin, Greek and Cyrillic letters, precomposed Vietnamese and polytonic Greek letters, and Cyrillic vowels with a stress accent. Its additional punctuation includes the middle dot, nonbreaking hyphen, en and em dashes, and curly quotes. It also supports an internal nonbreaking space. The committed key set in `art/generated/names.js` is authoritative. The registry may impose additional content restrictions.

The server adds only the inscription and metadata to the lower panel. It joins those compressed rows to the precomputed upper plate, so requests avoid recompressing the whole image. The renderer uses native Web APIs and has no font, rendering-service or image-library runtime dependency.
