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
| `web-push`                         | MIT          | Web Push / VAPID               |
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

| Source                                        | Terms                             | Use                        |
| --------------------------------------------- | --------------------------------- | -------------------------- |
| **Open-Meteo** (<https://open-meteo.com>)     | Free, open, attribution requested | Weather + geocoding        |
| **WeatherAPI** (<https://www.weatherapi.com>) | User-supplied key, provider terms | Optional primary reference |
| **RainViewer** (<https://www.rainviewer.com>) | Free tier                         | Radar tiles for the map    |
| **Leaflet/OpenStreetMap**                     | ODbL (OSM data)                   | Base map tiles             |

## Referenced standards

- **AS 2550.1** — crane safety, referenced for wind-threshold context.
- **WMO** weather interpretation codes.
- **RFC 7914** (scrypt), **RFC 6238** (TOTP).

## Optional integration

- `integrations/cloudflare-worker-email-relay` — an open Cloudflare Worker the
  operator deploys themselves for the static build's email delivery. Covered by
  this repository's licence.

## This project

Released under the MIT licence (see `LICENSE`; confirm in
`docs/assumptions-and-questions.md`, question Q-01).
