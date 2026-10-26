# Upstream issue tracker, as of 2026-10-26

This repository ships `kurumuz/ns2jb`, so *its* bugs are our bugs. This page records
what the two upstream trackers say, what each report actually corresponds to in the
code, and what this repository did about it. It exists so the next person does not
re-derive it from six issue threads.

**Nothing here was verified on hardware.** This machine has no Switch 2. Every
statement below is either read from source, read from a reporter's own log, or
measured host-side on this computer — and each one says which.

## Where the code stands

Checked with `git ls-remote`, not with an empty `git fetch` (an empty fetch looks
identical to "up to date" and to a silent failure):

| Repository | Head | Branches |
|---|---|---|
| `gitlab.com/kurumuz/ns2jb` (shipped by default) | `eb2bdec` | `main` only |
| `gitlab.com/pepsipu/ns2jb` (preserved at tag `pepsipu-95f5525`) | `95f5525` | `main` only |

Neither has moved since this repository was assembled. **Kurumuz has zero open
issues.** pepsipu has six, five of them open:

| # | Title | Reporter | State |
|---|---|---|---|
| [1](https://gitlab.com/pepsipu/ns2jb/-/issues/1) | Acquisition (stage 2/4) never qualifies on 23.0.1 — canary deferral holds only ~20% of waves | basedkao | open, 4 notes |
| [2](https://gitlab.com/pepsipu/ns2jb/-/issues/2) | boot failed 14 | margaret14 | open, empty body |
| [3](https://gitlab.com/pepsipu/ns2jb/-/issues/3) | Allow a separate listening address for forwarded hosts | bidnyy | open, patch attached |
| [4](https://gitlab.com/pepsipu/ns2jb/-/issues/4) | The run stopped. persists even after Keep the runs folder… | margaret14 | open, empty body |
| [5](https://gitlab.com/pepsipu/ns2jb/-/issues/5) | FS acquisition always misses the canary (Switch 2, 23.0.1, SmileBASIC 4.4.9) | stevSTANY | open |
| [6](https://gitlab.com/pepsipu/ns2jb/-/issues/6) | The run stopped stage 2/4. 40+ tries have all failed | bluewave41 | **closed** 2026-10-26 by its author |

Issue **notes** are not readable without authentication (`/issues/N/notes` returns
401), so the tables above are built from the issue bodies and from the one thread
whose content is quoted inside a body. That gap is stated rather than papered over.

---

## #1 — the canary deferral race

**The report.** Stage 2/4 never qualifies. The `canary` request is bimodal: either
it stays pending until release (11–24 ms) or it completes immediately (160–200 µs).
Deferral held in 9 of 43 waves (21%). They conclude that because `abort-control` and
`abort-hole-control` are called through `wave()` rather than `retryWave()`, one lost
race discards the whole boot, and propose calling them through `retryWave()`.

**The race is real and is in our tree.** `probe-reserved-gap.cjs` has
`const waveAttempts = 30;` (line 20) and `retryWave()` (line 511), which retries
while `!hasWindow(row)`. pepsipu's original used a literal `3` there; the fork
raised it to 30. So the "up to 3 retries" in the report describes the original, not
what this repository ships.

**The proposed fix does not work, and the reason is in the predicate.**
`hasWindow` is:

```js
const hasWindow = row => row.restored && !row.triggerAborted && row.allPending &&
  row.receiveOrderMarginUs >= 300 && row.preReleaseUsed >= 0x2600;
```

Both controls assert `triggerAborted === true` (lines 531 and 533). So `hasWindow`
is **false for a successful control**, and `retryWave('abort-control')` would run
all 30 attempts and return the *last* one — which can be worse than the first. It
would also triple the wave count for no gain.

Worse, `retryWave` has no `try`/`catch`, and the failure is a `check()` **throw**
inside `wave()`, so a retry loop around it would not catch the failure at all. The
only rows `retryWave` ever retries are rows that *returned* but failed `hasWindow`.

**Where it actually dies.** Issue #6's own log settles this. The logged wave is an
`abort-control`, and it shows the abort gate **passing**:

```
"profile":"abort-control" … "nativeGuard":{"completed":1,…} "triggerAborted":true
{"stage":"bounded-failure","error":"Pinning storage was not created while the canary was pending"}
```

So the gate at line 531 passed and the run died on the next check, line 481:

```js
check(canaryRow.startUs < pinRow.startUs && pinRow.endUs < canaryRow.endUs,
  'Pinning storage was not created while the canary was pending');
```

In that log the canary ran `1697.024–1966.016 µs` (it completed immediately) while
the pin ran `2799.04–10782.176 µs`. The first half of the check holds, the second
half cannot: the canary was already over before the pin finished.

`createPin` is true only while `pinHandle` is unset (line 338), so this check
applies to **the first wave of every boot**. A lost race on wave one ends the boot.

*Inference, labelled as such:* 9 of 43 waves deferred (20.9%) and 4 of 17 boots
passed the gate (23.5%). Those two numbers agreeing is what you would expect if the
first wave is the gate — which supports the pin-check explanation over the
"abort-control is single-shot" one.

**What this repository does about it: nothing, deliberately.** Making the first wave
retryable means restructuring an assertion that upstream physically tested, and
there is no console here to re-verify it against. Per the ground rules, a change that
cannot be re-verified does not get made. What *is* done is host-side: `run.cjs`
recognises this failure string and tells the user it is a timing race to retry,
rather than printing the engine's sentence and nothing else.

## #3 — separate listening address (implemented here)

The launcher used `computer-IP` for both the TCP bind and the address printed in
`V=START`. A forwarder — WSL 2 NAT, Docker, a VM — needs those to differ.

Implemented as `--bind ADDRESS` in `run.cjs`, host-side only; `engine/` is
untouched, because the listener lives in `run.cjs` and only its `host` argument
changes. Verified on this computer by starting the host and reading the actual
listening socket:

| Invocation | Socket bound to | `V=START` carried |
|---|---|---|
| `node run.cjs 192.168.0.4` (default) | `192.168.0.4:39380` | `192.168.0.4` |
| `node run.cjs --bind 127.0.0.1 192.168.0.4` | `127.0.0.1:39380` | `192.168.0.4` |
| `node run.cjs --bind=0.0.0.0 192.168.0.4` | `0.0.0.0:39380` | `192.168.0.4` |

That is a check of the wiring, not of the parser: the first two rows are the same
code path with a different argument.

## #5 — the overwrite misses a qualified canary

`extent-present` qualifies (the marker is selected and the negative control holds)
but all 30 `positive` waves report `canaryChanged: false` and `changedPaths` empty.
The engine then throws at line 550, `Overwrite missed the qualified canary; retain
resources for recovery`, and sets `placementUncertain`.

This is a different failure from #1: the window is good and the overwrite does not
land where the locator said it would. It is unresolved upstream, it depends on
hardware behaviour, and there is nothing here to port. It is the reason the engine
retains resources instead of cleaning up when it happens — that is deliberate.

## #6 — closed by its author

Same family as #1. The log is quoted above and is the best evidence in the whole
tracker, because it is a complete wave record rather than a description.

## #2 and #4 — no information

Both have empty bodies and no notes. Nothing can be concluded from "boot failed 14"
and there is no reply to make.

---

## What would change this page

- **A new commit upstream.** Re-run `git ls-remote` for both remotes; if either moved,
  re-merge and re-check this table.
- **A hardware report** that the first wave can be made retryable without disturbing
  the assertion upstream tested. That is the one change that would materially raise
  the success rate, and it needs a console to justify.
- **Readable issue notes.** With a token that can read them, the four threads under
  #1/#3/#5/#6 would confirm or correct the inferences above.
