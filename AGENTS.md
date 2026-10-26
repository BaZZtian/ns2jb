# AGENTS.md — working on the ns2jb rework

This repo is a reworked mirror of **ns2jb**, the software-only Switch 2
filesystem demo. It ships **kurumuz's fork** by default, because that fork is what
mac2jb v0.4.0 is built on and what addresses the "gets through the first stage,
then fails starting the native helper" failure in issue #2.

Read `docs/PROVENANCE.md` first — it records what was captured, from where, at
which commit, what this rework changed, and what has been verified since.

## Repo shape

| Ref | What it is |
|---|---|
| `main` | the fork (`kurumuz/ns2jb@eb2bdec`) merged at `4d566aa`, plus this rework's docs and two Windows fixes |
| tag `pepsipu-95f5525` | pepsipu's original capture, untouched |
| tag `pepsipu-capture-2026-10-22` | the earlier docs-only rework commit (`ce39c20`) |
| remote `origin` | `gitlab.com/pepsipu/ns2jb` — upstream, do not push |
| remote `kurumuz` | `gitlab.com/kurumuz/ns2jb` — the fork |
| remotes `github`, `gitlab`, `codeberg` | this rework's mirrors |

The fork is **not** drop-in compatible with the original: it removes the pairing
token and changes the bootstrap to five-argument `START(PORT,A,B,C,D)`. A saved
`NS2` from the original tree fails with `Wrong number of arguments`.

## Ground rules

1. **Never silently modify `engine/`.** Upstream physically tested it on
   2026-10-21. Any change must say in the commit and in `docs/PROVENANCE.md` what
   changed, why, and what was re-verified. If a change can't be re-verified, don't
   make it. The only deviations today are two Windows portability fixes
   (`memory/run-control.cjs` temp dir, `test.cjs` path separator + junction) —
   no exploit logic, offset, timing constant, or payload byte is altered.
2. **The reproducible-build check is the integrity anchor.** After any touch of
   `engine/switch2/ro/payload/`:

   ```sh
   node engine/build-payload.cjs --check --zig /path/to/zig-0.15.2
   ```

   It must print `"matched":true` with the same SHA-256 as
   `engine/switch2/ro/payload/manifest.json`. Zig 0.15.2 exactly — the script
   refuses other versions by design. A local install that works is a full
   extracted zip (the standalone `zig.exe` needs its sibling `lib/` directory;
   see the trap below).
3. **Analysis goes in `docs/`, claims point at files.** `docs/ANALYSIS.md` is the
   living map of the exploit chain. When reading new code, add to it rather than
   re-deriving each time. Every statement about behavior should name the file and
   function it is grounded in.
4. **Host-side only.** This machine has no Switch 2 and no Apple silicon Mac.
   `node test.cjs` runs the host-side checks; the build check needs only Node and
   Zig. Do not describe hardware results that were not observed on hardware.
5. **Cite the upstream.** The blog (in `docs/blog-capture.md`) is narrative; the
   code is ground truth. Where the blog and the code disagree, the code wins, and
   the disagreement is worth a note in `ANALYSIS.md`.
6. **`SHA256SUMS` must match the tree it ships with.** It is what the README tells
   users to verify, and `doctor.cjs` checks it on every preflight. The fork never
   regenerated its own copy — 14 of 97 entries were stale against a clean checkout
   of `eb2bdec` — so this repo's file was regenerated, and coverage was widened to
   every shipped file (top level, `docs/`, `engine/`, `scripts/`), not just the six
   top-level files plus `engine/`. If you change any shipped file, regenerate in
   the same commit:

   ```sh
   node scripts/make-sums.cjs           # rewrite from the tree
   node scripts/make-sums.cjs --check   # exit 1 if out of date
   ```

   Do not "fix" it by deleting entries, and do not hand-edit it.

## What the pieces are

- `bootstrap.bas` — the one program typed into SmileBASIC (229 lines). Triggers
  the `REMOVE` integer-overflow bug, finds the interpreter's natives by hashing
  known fingerprints, and connects back to the host over TCP port 39380.
- `run.cjs` — host entrypoint; listens, prints the `V=START(...)` line, and
  orchestrates everything after the console connects. `--rpc` holds the session;
  `--dump-firmware` captures system code. `--bind ADDRESS` sets the listening
  address independently of the advertised one, for WSL 2 NAT / Docker / VM
  forwarders (upstream issue #3) — the listener lives here, so this needs no
  `engine/` change. `explainFailure()` adds a plain-language hint to the timing
  races upstream reports; it must never rewrite a message it does not recognise.
- `dump-firmware.cjs`, `rpc.cjs` — the two optional entry points.
- `doctor.cjs` — preflight for users and testers: Node version, file integrity
  against `SHA256SUMS`, local IPv4 candidates, whether port 39380 is bindable, and
  `runs/` writability. `--bundle` writes one report file for a bug report. It
  never contacts the console and changes nothing but a temp folder under `runs/`,
  so it must stay honest about that: it can say "your side is ready", never "the
  exploit will work".
- `scripts/make-sums.cjs` — regenerates `SHA256SUMS` from the tree; `--check`
  exits 1 when it is stale.
- `engine/` — the exploit engine: `memory/` (FS arbitrary R/W via the 0x301
  path-overflow + BufferedStorage cache entry), `ro/` (native helper as `ro`,
  domain-table swap, launch, layout discovery), `process/` (FS instruction patch
  demo), `app/` (SmileBASIC-side workers), `shared/` (RPC/frames).
- `runs/`, `dumps/` — local-only artifacts; git-ignored, never part of the
  distributable.
- `docs/MAC2JB.md` — the macOS route, and the verified proof that mac2jb v0.4.0
  ships this exact fork and this exact bootstrap.
- `docs/ECOSYSTEM.md` — tools that sit on top of this engine (mac2jb, HBLauncher,
  ftpd-sb, OunceCake), each with its licence and a pointer at the code the claim
  comes from. **Do not vendor code with an incompatible licence into this tree,
  and do not turn an entry into a how-to for copying content the user does not
  own.** OunceCake is documented and linked, not bundled.
- `docs/upstream-*-README.md` — the two upstream READMEs, byte-for-byte.
- `docs/UPSTREAM-ISSUES.md` — the two upstream issue trackers: which reports are
  timing races, which is a real host-side defect (fixed), and which are
  hardware-dependent and deliberately not "fixed" here. Update it when either
  upstream moves or a report is resolved; do not let it drift into a stale summary.

## Editing docs

- `README.md` is written for **a normal user with a console**, not for a
  developer. Keep the numbered flow (`LOAD` → `RUN` → `REMOVE` → `V=START`),
  keep the expected-`Out of memory` note, and keep "restart the console between
  attempts". Do not add claims about console behaviour that were not observed.
- `.gitattributes` forces LF. Upstream's hashes were generated from LF bytes, so
  a CRLF checkout makes every checksum mismatch. Do not remove it.

## Traps on this machine

- **Do not pass the path to `zig.exe` and expect it to work alone** — Zig needs
  its installation directory (`lib/` tree) next to the binary. `execFileSync` on
  a directory path also fails with ENOENT. Pass the full path to `zig.exe` inside
  a fully extracted distribution.
- `Expand-Archive` on the 92 MB zig zip can silently produce an incomplete
  directory (no `zig.exe`, truncated `lib/`) and hang on large entries. Use
  `tar -xf file.zip -C dest`, which completes correctly, then check
  `lib\std\std.zig` exists and run `zig version` before trusting it.
- **PowerShell redirection writes UTF-16**, and `Get-Content`/`Set-Content`
  round-trips mangle non-ASCII. Use Node or `.NET WriteAllText` for file content,
  and write UTF-8 without a BOM. `>` on a diff is fine via `git diff --output=`.
- `.NET` calls like `[IO.File]::ReadAllBytes('relative')` resolve against the
  process directory, **not** the PowerShell location. Use `Join-Path (Get-Location)`.
- GitHub, GitLab and Codeberg all intermittently fail with connect timeouts here.
  Retry before concluding anything is wrong; one retry has always been enough.
- This is a Windows machine; commands are PowerShell unless stated otherwise.
