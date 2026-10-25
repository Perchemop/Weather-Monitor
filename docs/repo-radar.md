# Repository radar

Periodic build-vs-adopt pass over public GitHub projects (guide.md §4A). One
section per pass; verdicts are `adopt`, `pilot`, `watch` or `reject`, and a
rejected candidate is not re-proposed unless its reason has changed.

## 2026-10-25 — first pass

Scope: weather data, maps, charts, local caching, and the build/lint/test
toolchain.

Already covered in this repository (no action, do not re-propose): Open-Meteo as
the weather provider (`src/services/weatherService.ts`), Leaflet for maps,
Recharts for charts, `sql.js` for the local cache, Prettier, Playwright, CodeQL
and the Pages deploy workflow.

| Candidate | Verdict | Reason |
| --- | --- | --- |
| `biomejs/biome` | **watch** | It would replace Prettier only, which is not enough of a win to churn formatting across the tree. Revisit when a linter is added. |
| `taskjuggler/taskjuggler` | **reject** | Irrelevant domain (project scheduling); nothing here plans work. |

Re-check date for the radar as a whole: 2027-01-25.
