# Brand & Visual Design

Original identity for the Construction Weather Monitor. Nothing here is
derived from a commercial product's trade dress (operating guide §10).

## Name

**Construction Weather Monitor** — descriptive, original, no trademark
conflicts claimed or implied. The PWA display name is "Site Weather".

## Mark (app icon)

The icon is an agent-authored SVG (`public/icon.svg`, with a maskable variant
`public/icon-maskable.svg` for Android):

- **Canvas:** 24×24 rounded square filled with a slate gradient
  (`#0f172a → #1e293b`) — the app's dark, industrial base.
- **Glyph:** a hard hat drawn with amber (`#f59e0b`) 1.5-width round-cap
  strokes — the safety/hard-hat domain, rendered as a line drawing rather than
  a filled cartoon so it stays legible at 16 px and 512 px.
- **Meaning:** the hard hat stands for the protected worker; the dark slate
  ground reads as a night-shift site under watch.

The in-app glyph set is [Lucide](https://lucide.dev) (ISC licence, recorded in
`ATTRIBUTION.md`) used at small sizes with the same stroke language as the
mark.

## Colour tokens

| Role | Value | Usage |
| --- | --- | --- |
| Ground | `#020618` / slate-950 family | app background |
| Surface | slate-900 at ~60% opacity on slate-950 | cards, one radius scale (`rounded-2xl` shells, `rounded-xl` tiles) |
| Hairline | slate-800 at ~70% opacity | borders — shadows are reserved for the risk hero |
| Brand accent | `#f59e0b` (amber-500) | primary actions, active tab underline, icon tint. Never used to decorate non-interactive text |
| Semantic risk | emerald (LOW), amber (MODERATE), orange (HIGH), red (CRITICAL) | only where they encode risk state; tiles stay neutral otherwise |
| Text | slate-100 primary, slate-400/500 secondary, slate-600 quiet | sentence-case sans labels; `tabular-nums` for data |

## Typography

System sans stack for all chrome and labels; numeric values use
`tabular-nums` so columns and counters align. Monospace is reserved for
nothing in the current UI — data alignment comes from tabular figures instead
of terminal styling.

## Motion

Calm by default: 0.2–0.3 s fades and slides, a slow pulse only on live status
dots and active storm icons, and everything neutralised under
`prefers-reduced-motion: reduce`.

## Voice

Operator-first and honest. Labels are plain ("Check now", "Active alerts");
status language never overclaims ("Offline — showing the last cached
snapshot", "Could not reach GitHub Releases… try again later"). Safety
disclaimers are always present but visually quiet.
