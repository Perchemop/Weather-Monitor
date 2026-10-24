# Accessibility

## Commitment

The Construction Weather Monitor aims to meet **WCAG 2.2 AA** where feasible.
Weather information on a construction site is time-sensitive; if the
interface fails someone, a safety signal fails them too, so accessibility is
treated as a functional requirement rather than decoration.

## What the application already implements

- **Keyboard operation** of every control, with a visible focus ring
  (`focus-visible` styles) on every interactive element, and logical tab
  order through the navigation and dashboard.
- **Native elements** for semantics (`button`, `a`, `label`, `h1`–`h3`,
  `select`, `input`) — not generic divs; ARIA is used only where a native
  element cannot express the meaning (`aria-current`, `aria-expanded`,
  `aria-label` on icon-only controls).
- **Colour is never the only signal**: risk levels are labelled as words
  (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`) alongside colour, and numeric
  values carry their own units and context.
- **Motion and flashing** are limited: slow status pulses only; everything
  animation-related is neutralised under `prefers-reduced-motion: reduce`.
- **Touch targets** of at least 44×44 CSS pixels on coarse pointers
  (phones/tablets installed as a PWA), including enlarged Leaflet zoom
  controls.
- **Mobile viewport** support: reflow at narrow widths, safe-area insets for
  notch devices, and no orientation lock.
- **Dark theme by default** with contrast deliberately held above the AA
  ratio for body and data text on the slate/amber palette.

## Known limitations

- **Screen-reader verification is incomplete.** The live-updating dashboard
  announces via toasts rather than a persistent live region; an unobtrusive
  polite live-region for new alerts is planned (see `ROADMAP.md`, 0.2.x).
- **The map tab** (Leaflet + tiles) is only keyboard-operable through the
  browser's default map panning; the data it visualises is duplicated in the
  hourly tiles and risk factors, which are keyboard- and screen-reader
  accessible.
- **Charts** (Recharts) expose data visually; the report view provides the
  same figures as text, and a table alternative for key trends is planned.
- Automated contrast scanning has not been run in CI yet; contrast was judged
  by hand against the documented palette. An automated check is on the
  roadmap.

## How to report an accessibility bug

Use the **Accessibility report** issue template
(`.github/ISSUE_TEMPLATE/accessibility_report.yml`) — a separate path from
general bugs, because the context assistive-technology users need is
different (which AT and version, expected vs actual, severity). These
reports are triaged with the same priority as a functional bug that blocks
use entirely. Label: `accessibility`.

## Testing

The release checklist includes an accessibility pass: keyboard-only run of
the main flows, focus visibility, forms labelled and errors announced, colour
not the only signal, reduced motion respected, 200% zoom, and a
screen-reader spot check of the dashboard (see `docs/qc/release-checklist.md`).
