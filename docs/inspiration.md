# Inspiration & Clean-Room Statement

This project is an **original, clean-room implementation**. No third-party
application source code, assets, or proprietary look-and-feel was copied.

## Reference class

The general problem — turning site weather into construction safety decisions —
is well established. This project was shaped by the *category* of tools that
exist in that space (site weather monitoring dashboards, crane wind-safety
indicators, lightning-detection services). None of their code, layout, or visual
design was used.

## Public references used

Only public, documented standards and APIs informed the design:

- **AS 2550.1** — the crane-safety standard referenced in the UI as the basis for
  wind thresholds. Thresholds in the app are configurable defaults, not a
  reproduction of the standard text.
- **WMO weather interpretation codes** — used for condition descriptions and
  storm detection (`weatherCode >= 95`).
- **WeatherAPI** and **Open-Meteo** public API documentation — response shapes
  and field semantics.
- **RainViewer** public radar tiles (key-free) for the map.
- **RFC 7914 (scrypt)**, **RFC 6238 (TOTP)** and standard HTTP security guidance
  for authentication and headers.

## Originality notes

- All visual design, component structure, copy and thresholds are original.
- The deterministic risk model, activity matrix and alert lifecycle are original
  logic, not adapted from another product.
- Dependencies are used under their own licences; see `../ATTRIBUTION.md`.
