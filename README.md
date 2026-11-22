# Sneaker Inventory v2

A faster, modernized replacement for the old site. Single page, zero external
libraries, same Google Sheet as the data source.

## What changed vs. the old version

| Old site | New site |
| --- | --- |
| Loaded PapaParse + Font Awesome + Google Fonts from CDNs (3 extra requests, ~200 KB) | **Zero external libraries** — everything inline/local |
| Fetched the Sheet CSV on every visit, showed a spinner until Google responded | **Instant load from cache** (localStorage), then silent background refresh from the Sheet |
| CSV parsed by PapaParse (CDN dependency) | Tiny built-in CSV parser |
| Images loaded eagerly, all at once | Lazy-loaded as you scroll, with automatic fallback |
| `index.html` + `boas-shop.html` (two near-identical pages) | **One page**; the boas-shop fee note (+4%, min €5) is in the footer |
| Broken placeholder images (via.placeholder.com is dead) | Built-in placeholder, never breaks |
| Sizes like `38 (DMG Box 65€)` did not match the size-38 filter | They now match |
| One flat grid mixing every kind of product | **Three separated sections** — Sneakers / Clothing / Accessories, each with a colored header, item count and per-card badge |

Everything else works the same: EN/PT language toggle, search by name/SKU,
size filters (EU footwear + clothing + accessories), price sorting, image
lightbox with zoom, and items with `consign` / `hold` / `hide` notes stay hidden.

## How items are categorized

Done automatically from the `Size` column of the Sheet — no extra column needed:

| Size value | Category |
| --- | --- |
| `-` (also `OS`, `one size`) | **Accessory** — blue section |
| `XS` `S` `M` `L` `XL` `XXL` `XXXL` ... | **Clothing** — green section |
| anything numeric (`40.5`, `42 2/3`, `38 (DMG box)`, ...) | **Sneaker** — terracotta section |

If a product has mixed sizes it falls back to Sneaker. Accessories show a
`×2` quantity badge instead of meaningless size chips. The "—" option in the
Accessories group of the size filter selects exactly these items.

**Name overrides:** some products have odd sizes but are clearly accessories.
Items whose *name contains* `Swarovski` or `Diesel B-1dr Belt` are forced into
the Accessories section regardless of size. To add more, edit
`ACCESSORY_NAME_HINTS` near the top of `app.js` (lowercase, "contains" match).

## Deploy to GitHub Pages

1. In your repo, **delete**: `boas-shop.html`, `boas-shop.js`, `script.js`, `styles.css`
2. **Replace** `index.html` with the new one, and upload `app.js` + `styles.css` from this folder
3. Commit + push — GitHub Pages redeploys automatically. Done.

No build step, no npm, nothing else to install.

## Where things live

- **Sheet URL** — top of `app.js` (`SHEET_URL`). Same published CSV as before.
- **Cache key** — `si_inventory_cache_v2` in localStorage. Visitors always see
  the freshest data within ~1–2 s of opening the page; the cached copy is only
  a visual shortcut.
- **Translations** — `translations` object at the top of `app.js` (EN/PT).

## Testing locally

Just open the folder and run a tiny server (fetching the Sheet needs http, not file://):

```
python3 -m http.server 8000
# then open http://localhost:8000
```
