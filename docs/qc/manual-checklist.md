# Manual QC Checklist

Run against a deployed build after a change. Tick each item; note any deviation.

## Authentication & access

- [ ] Fresh install shows the first-run setup screen; setup creates the owner and
      signs in.
- [ ] Re-visiting `/api/auth/setup` after setup returns `409` and does not change
      the password.
- [ ] Login with wrong credentials increments lockout; the account locks after the
      configured attempts.
- [ ] Email is case-insensitive at login.
- [ ] Enabling TOTP requires a valid code at next login.
- [ ] Changing your password signs out your other devices but not the current one.

## Roles

- [ ] As VIEWER: Settings opens, only Security & Auth is shown.
- [ ] As VIEWER: the location modal offers selection only — no add, delete or
      "set default" controls.
- [ ] As MANAGER: location management works; owner-only Settings tabs are absent.
- [ ] As OWNER: all Settings tabs and user management are present.
- [ ] A demoted user loses the removed capability without re-logging in.

## Dashboard & risk

- [ ] Current conditions, headline risk and activity matrix load.
- [ ] A high-wind mock/real condition raises the risk level and lists factors.
- [ ] Extreme UV shows a HIGH headline level.
- [ ] With a WeatherAPI key configured, a clear day does not show a thunderstorm
      alert.
- [ ] Alerts panel dismisses an alert and it does not reappear while still active.

## Alerts & monitoring

- [ ] "Check Now" refreshes conditions; a failed server check is labelled as a
      direct provider reading rather than a success.
- [ ] Switching location reports failure honestly if the site cannot load.
- [ ] Alert history and the weekly performance summary render.

## Data & operations

- [ ] Create a backup, then restore it; the session is signed out and you can sign
      in again.
- [ ] Retention run reports counts and does not error.
- [ ] `/healthz` returns `ok`; `/metrics` refuses anonymous scrapers.
- [ ] The map tab loads radar and wind layers.
