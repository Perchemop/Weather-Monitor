# Attribution

Third-party software and data sources used by the Construction Weather Monitor.
Versions are declared in `package.json`.

## Runtime dependencies

| Package                            | Licence      | Use                            |
| ---------------------------------- | ------------ | ------------------------------ |
| `react`, `react-dom`               | MIT          | UI                             |
| `express`                          | MIT          | HTTP API                       |
| `sql.js`                           | MIT          | SQLite compiled to WebAssembly |
| `cookie-parser`                    | MIT          | Cookie parsing                 |
| `dotenv`                           | BSD-2-Clause | Environment loading            |
| `nodemailer`                       | MIT-0        | SMTP email                     |
| `web-push`                         | MPL-2.0      | Web Push / VAPID               |
| `leaflet`                          | BSD-2-Clause | Map rendering                  |
| `lucide-react`                     | ISC          | Icons                          |
| `recharts`                         | MIT          | Charts                         |
| `vite`                             | MIT          | Build tooling                  |
| `@vitejs/plugin-react`             | MIT          | React build integration        |
| `@tailwindcss/vite`, `tailwindcss` | MIT          | Styling                        |
| `esbuild`                          | MIT          | Server bundling                |
| `tsx`                              | MIT          | TypeScript execution           |
| `typescript`                       | Apache-2.0   | Type-checking                  |
| `autoprefixer`                     | MIT          | CSS post-processing            |

Type packages (`@types/*`) are used at build time only.

## Data sources

| Source                                        | Terms                                                       | Use                        |
| --------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| **Open-Meteo** (<https://open-meteo.com>)     | **CC BY 4.0** — attribution required next to displayed data | Weather + geocoding        |
| **WeatherAPI** (<https://www.weatherapi.com>) | User-supplied key, provider terms                           | Optional primary reference |
| **RainViewer** (<https://www.rainviewer.com>) | Free tier                                                   | Radar tiles for the map    |
| **Leaflet/OpenStreetMap**                     | ODbL (OSM data)                                             | Base map tiles             |

## Referenced standards

- **AS 2550.1** — crane safety, referenced for wind-threshold context.
- **WMO** weather interpretation codes.
- **RFC 7914** (scrypt), **RFC 6238** (TOTP).

## Optional integration

- `integrations/cloudflare-worker-email-relay` — an open Cloudflare Worker the
  operator deploys themselves for the static build's email delivery. Covered by
  this repository's licence.

## Dependency licence classes (policy)

Dependencies are classified as permissive where possible (MIT/ISC/BSD/Apache-2.0).
**MPL-2.0** (e.g. `web-push`, `lightningcss`) is weak copyleft (file-level); usage is
tracked and compliant with the licence terms. `caniuse-lite` uses **CC-BY-4.0** for
usage data only (not compiled into redistributed binaries as artwork). All licences are
checked in CI by `scripts/check-licences.mjs`.

## AI / model / API terms used during build (provenance)

This project was built with OpenCode using free-tier models (see
`docs/current-model-map.md`). Use of free model tiers is subject to each provider's
terms of service. No API keys or privileged bot tokens are embedded in the client;
only user-supplied credentials are used at runtime. Weather provider terms apply to
data requests made by operators.

## This project

Released under the **MIT** licence (see `LICENSE`). Dual-licence (MIT OR Apache-2.0) was
considered; **MIT-only** was chosen deliberately and recorded here for clarity.
