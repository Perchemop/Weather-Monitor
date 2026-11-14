# Research Notes

Public clean-room research lives here (operating guide §2.3, §8.4).

## Rules

1. Every note is an **original behavioural summary** with **URLs** to public
   sources. Never paste copyrighted manual text, scraped HTML, or third-party
   screenshots into this directory or the repository.
2. No pixel-perfect UI cloning. Notes describe what a capability does and the
   acceptance criteria for an original implementation.
3. **Human gate:** research notes must be reviewed and approved by the human
   before any large implementation Task depends on them.
4. Each note names the capability, the public sources consulted, behaviour and
   edge cases, and the proposed acceptance criteria.

## Index

| Note | Status | Gate |
| --- | --- | --- |
| [`crash-report-submission.md`](crash-report-submission.md) | Draft v1 | **Approved and implemented** (human gate passed 2026-10-24; recorded in `CHANGELOG.md`/`ROADMAP.md`) |
| [`multi-arch-container-images.md`](multi-arch-container-images.md) | Draft v1 | **Approved and implemented** (human gate passed 2026-10-24; verified at v0.1.2) |
| [`prettier-adoption.md`](prettier-adoption.md) | Draft v1 | **Approved and implemented** (human gate passed 2026-10-24; PR #6) |
| [`dom-ui-tests.md`](dom-ui-tests.md) | Draft v1 | **Approved and implemented** (human gate passed 2026-10-24; `ui-tests` CI job green) |
| [`prometheus-runbook.md`](prometheus-runbook.md) | Draft v1 | **Approved and implemented** (human gate passed 2026-10-24; runbook + example rules shipped) |

All notes are original summaries with source URLs. Approval criteria (guide
§8.4): original wording, URLs present, no substantial copyrighted paste, no
instruction to clone a vendor's exact UI. Gate status reflects the human approval
recorded 2026-10-24.
