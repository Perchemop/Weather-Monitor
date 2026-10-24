# Governance

How decisions get made in this project. Written down so contributors know
what to expect, and so "no" can point at a document rather than an opinion.

## Roles

| Role            | Meaning                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maintainer**  | The project owner. Responsible for direction, review, releases, security triage. Coding is optional — documentation, triage, and decisions count. |
| **Contributor** | Anyone who helps: an issue report, a doc fix, a test, a merged patch. No special access is required or granted on that basis alone.               |
| **Committer**   | Whoever holds write access to the repository. Currently the maintainer only.                                                                      |

Commit access is granted after a sustained, positive contribution — a
reviewed patch, a useful triage run, or documentation work. It is not granted
on request. The default branch is protected, so write access never bypasses
review and CI.

## Decision model

**Benevolent dictator with consensus-seeking.** The maintainer has the final
say (this is a single-maintainer project with one original author), but
decisions are made by consensus-seeking first:

1. Discuss the change in the issue or pull request.
2. Serious concerns are heard and addressed; when only minor concerns remain,
   the proposal proceeds.
3. If discussion stalls, the maintainer decides and explains why.

Majority voting is deliberately not used — it produces winners and losers and
under-represents the silent majority of users. It is reserved as a tiebreaker
for a stuck decision between maintainers, which currently cannot occur.

**The tiebreaker** (needed before it is needed): if the maintainer is
unavailable and a security or data-loss issue needs action, any contributor
may open a fix PR; it merges when CI is green and a second contributor has
reviewed it, and the maintainer reviews afterwards. If that ever becomes the
normal path, this file is updated to a formal liberal-contribution model.

## Conflict resolution

- The bar for kindness is set by the maintainer: they moderate, not fight.
- `VISION.md` is the constitution — debates re-anchor to the project goals.
- Threads that are not converging are closed with an explanation; a stalled
  queue discourages more than a fast, kind "this doesn't fit the project".
- Repeated declines are written into the documentation so they never need
  explaining twice.

## Commercial participation

Paid work on this project is welcome and receives no special treatment:
every contribution is judged on its merits, and discussions stay on the
contribution, not on who is funding it. No company affiliation is claimed, and
contributors must not imply endorsement by any vendor (see `CONTRIBUTING.md`).

No legal entity or funding structure exists. If money ever flows, a fiscal
sponsor or GitHub Sponsors is the intended first step, recorded here first.

## Automation and credentials

Build automation (agents) works through scoped credentials under the same
review gates as a human: branch protection requires the CI checks, and
agent-authored changes land through pull requests. Automation credentials are
kept to the minimum scope required; they are revocable accounts like any
other, and they receive no special trust.

## Changes to this document

Governance changes go through the normal PR flow. A dispute about governance
itself is decided by the maintainer and the outcome published here.
