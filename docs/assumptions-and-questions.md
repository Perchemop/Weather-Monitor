# Assumptions & Questions

Unconfirmed points are recorded here rather than silently treated as
requirements.

## Assumptions

- **A-01 Licence.** The project is assumed to be released under MIT. A `LICENSE`
  file has been added on that basis; confirm or replace.
- **A-02 Deployment.** The default target is a private, potentially
  plain-HTTP local enclave, so Secure cookies and HSTS are opt-in
  (`SECURE_COOKIES`, `ENABLE_HSTS`). HTTPS deployments must enable both.
- **A-03 Single organisation.** One installation serves a single site operator;
  there is no multi-tenancy or cross-organisation isolation.
- **A-04 Thresholds.** The shipped risk thresholds are configurable defaults
  inspired by common construction practice (including AS 2550.1 wind guidance)
  and are not a certified reproduction of any standard.
- **A-05 Providers.** WeatherAPI is optional; the app is designed to be fully
  functional on Open-Meteo alone. Users who configure a WeatherAPI key accept
  that their site coordinates are sent to that provider.
- **A-06 Time model.** All stored timestamps are UTC ISO-8601; display converts
  to the site timezone.

## Questions for the owner

- **Q-01** Confirm the licence (MIT assumed) and the copyright holder for the
  `LICENSE` file.
- **Q-02** Should the container build target multiple architectures
  (`linux/amd64` + `linux/arm64`) in CI?
- **Q-03** Is an SMS or other delivery channel required in addition to Web Push
  and SMTP?
- **Q-04** Should historical data be exportable as CSV beyond the current
  on-screen summary and text export?
- **Q-05** For reverse-proxy deployments, what is the exact proxy hop count or
  trusted CIDR that `TRUST_PROXY` should be set to?
- **Q-06** Are there organisation-specific retention requirements different from
  the current defaults (observations 30 days, alerts 90 days, monitor runs 30
  days, snapshots 14 days)?
