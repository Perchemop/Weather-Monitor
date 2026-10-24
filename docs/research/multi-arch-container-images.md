# Research: Multi-Architecture Container Images (arm64)

Status: **ready for work** (pure CI change; note recorded for review per
guide §2.3 discipline). Target milestone: 0.2.x.

## Behaviour (original summary)

The published Docker image currently builds for the CI runner architecture
(`linux/amd64`) only. Operators on Apple Silicon, ARM servers, or Raspberry
Pi-class hosts must emulate x86. The capability is a multi-platform build
producing one manifest that serves `linux/amd64` and `linux/arm64` from the
same tag.

On GitHub Actions the standard path is Buildx + QEMU: `docker/setup-qemu-action`
plus `docker/setup-buildx-action`, then `docker/build-push-action` with
`platforms: linux/amd64,linux/arm64`, pushing to GHCR. Docker's own docs
confirm the default hosted runner setup supports multi-platform builds this
way.

## Project-specific analysis

- **No native modules.** Runtime dependencies are pure JavaScript/TypeScript
  (`express`, `sql.js` is WASM, `nodemailer`, `web-push`). `npm ci` under
  emulated arm64 is the only slow step — there is no C compilation to break.
- **Base image.** The Dockerfile uses a Node 20 alpine base, which publishes
  arm64 variants, so no Dockerfile change should be required beyond (at most)
  making the build target explicit.
- **Cost control.** QEMU-emulated `npm ci` can be slow. Options, in order of
  preference: (1) rely on the fact that dependencies are arch-independent and
  keep QEMU; (2) use a native arm64 runner (GitHub now offers `ubuntu-24.04-arm`
  hosted runners for public repositories) and merge manifests; (3) cache npm
  via `cache-from`/buildx cache. Start with (1) and measure.
- **Registry.** GHCR (`ghcr.io/owner/repo`) keeps everything in-repo; the
  existing `docker` CI job already builds locally, so the release path can
  push conditionally on tags to avoid publishing on every PR.

## Acceptance criteria

1. A CI/release workflow builds and pushes a multi-platform image tagged
   `ghcr.io/<owner>/<weather-monitor>:<version>` with platforms
   `linux/amd64,linux/arm64`.
2. `docker manifest inspect` shows both platforms for the same tag.
3. On an arm64 host, `docker compose up` runs the app unmodified (manual QC
   entry added).
4. The release artefact list in `docs/qc/release-checklist.md` gains the image
   digest; the release notes link it.
5. Build time stays within the existing CI budget; if QEMU proves too slow,
   the native-arm-runner alternative is implemented instead (both documented).
6. PR builds keep local-only builds (no registry push); only tags push.

## Edge cases

- QEMU emulation timeout on slow `npm ci` — mitigate with buildx cache layers
  (`COPY package*.json` + `npm ci` before source copy, already the pattern).
- GHCR visibility defaults to private on first push — the release step must
  make the package public once (documented, not scripted).
- Manifest lists break very old Docker versions (<20.10); acceptable, noted.
- `latest` tag policy: tag only versioned releases; never auto-publish
  `latest` from a branch.

## Sources (public, URLs only)

- Multi-platform builds: <https://docs.docker.com/build/building/multi-platform/>
- Multi-platform image with GitHub Actions: <https://docs.docker.com/build/ci/github-actions/multi-platform/>
- docker/build-push-action: <https://github.com/marketplace/actions/build-and-push-docker-images>
- Playwright of thought on runners/QEMU trade-offs (public blog, behaviour only):
  <https://oneuptime.com/blog/post/2025-12-20-multi-platform-docker-builds-github-actions/view>
