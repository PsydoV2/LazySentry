# LazySentry logo

Shield mark (Sentry) with different takes on the "lazy but still watching" idea. All
use the app's existing accent violet (`--accent` / `--accent-hover` from
`apps/web/src/styles.css`), so they sit naturally next to the UI in both themes.

| File | Concept |
| --- | --- |
| `mark-sentry-ping.svg` | Half-lidded eye + a quiet signal ping in the corner — looks relaxed, still listening. Recommended primary mark. |
| `mark-night-watch.svg` | Shield with a crescent moon — watches automatically, overnight, unattended. |
| `mark-radar-scan.svg` | Concentric scan rings + sweep line — the most literal read, ties to the dependency/CVE scan pipeline. |
| `mark-owl-sentinel.svg` | Geometric owl face — nocturnal, quiet, sees everything anyway. |
| `wordmark-light.svg` / `wordmark-dark.svg` | Primary mark + "LazySentry" type, for light and dark backgrounds respectively. |
| `favicon.svg` | Flat, no-gradient version simplified for 16–32px use (browser tab, app icon). |

All are plain SVG, no external fonts or assets. The wordmarks use the same system
font stack as the app (`--font` in `styles.css`), so text renders with the OS
default rather than embedding a typeface.

Pick one mark as the canonical one before wiring it into `index.html` /
`apps/web/public`; the rest are kept as alternates.
