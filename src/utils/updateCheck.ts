/**
 * Update-check primitives (guide §7.2).
 *
 * Pure and framework-free so the logic is unit-testable. The network fetch
 * itself lives in the Settings About panel; these helpers decide what the UI
 * should say. All comparisons handle the leading `v` used in git tags and
 * treat a prerelease (`-beta.1`) as older than the same release.
 */

export interface UpdateState {
  /** `up-to-date` | `update-available` | `unknown` (input could not be parsed). */
  status: 'up-to-date' | 'update-available' | 'unknown';
  /** Latest version found, normalised without the `v` prefix. */
  latestVersion: string | null;
  /** HTML URL of the release page, when known. */
  url: string | null;
}

/**
 * Compares two dotted versions. Returns < 0 when `a` < `b`, 0 when equal,
 * > 0 when `a` > `b`. Numeric parts compare numerically (`0.2.10` > `0.2.9`);
 * a prerelease suffix ranks below the same version without one. Returns null
 * when either side is not a plausible version string.
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (input: string): { core: number[]; pre: string | null } | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(input.trim());
    if (!match) return null;
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      pre: match[4] ?? null
    };
  };

  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  // Same core: a prerelease (e.g. 0.2.0-beta.1) is older than the release.
  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  if (left.pre === right.pre) return 0;
  return left.pre! < right.pre! ? -1 : 1;
}

/**
 * Decides the update state for the About panel. `latestTag` is the tag name
 * from the GitHub Releases API (e.g. `v0.2.0`); any non-version input yields
 * an `unknown` state so the UI can fail soft instead of lying.
 */
export function resolveUpdateState(currentVersion: string, latestTag: string | null, releaseUrl?: string | null): UpdateState {
  if (!latestTag) {
    return { status: 'unknown', latestVersion: null, url: releaseUrl ?? null };
  }
  const comparison = compareVersions(currentVersion, latestTag);
  if (comparison === null) {
    return { status: 'unknown', latestVersion: null, url: releaseUrl ?? null };
  }
  const normalised = latestTag.trim().replace(/^v/, '');
  return comparison >= 0
    ? { status: 'up-to-date', latestVersion: normalised, url: releaseUrl ?? null }
    : { status: 'update-available', latestVersion: normalised, url: releaseUrl ?? null };
}
