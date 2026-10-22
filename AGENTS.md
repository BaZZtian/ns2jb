# AGENTS.md — working on the ns2jb rework

This repo is a captured-and-reworked copy of **ns2jb**, pepsipu's software-only
Switch 2 jailbreak. Read `docs/PROVENANCE.md` first — it records exactly what
was captured, from where, at which commit, and what has been verified since.

## Ground rules

1. **Never silently modify `engine/`.** The engine was physically tested by the
   upstream author on 2026-10-21 (README). Any change to it must say in the
   commit and in `docs/PROVENANCE.md` what changed, why, and what was
   re-verified. If a change can't be re-verified, don't make it.
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
3. **Analysis goes in `docs/`, claims point at files.** `docs/ANALYSIS.md` is
   the living map of the exploit chain. When reading new code, add to it rather
   than re-deriving each time. Every statement about behavior should name the
   file and function it is grounded in.
4. **Host-side only.** This machine has no Switch 2. Nothing in this repo
   requires one to study: `node test.cjs` runs the host-side checks, and the
   build check above needs only Node and Zig. Do not describe hardware results
   that were not observed on hardware.
5. **Cite the upstream.** The blog (in `docs/blog-capture.md`) is narrative;
   the code is ground truth. Where the blog and the code disagree, the code
   wins, and the disagreement is worth a note in `ANALYSIS.md`.

## What the pieces are

- `bootstrap.bas` — the one program typed into SmileBASIC. Triggers the
  `REMOVE` integer-overflow bug, finds the interpreter's natives by hashing
  known fingerprints, and connects back to the host over TCP port 39380.
- `run.cjs` — host entrypoint; orchestrates everything after that connection.
- `engine/` — the exploit engine: `memory/` (FS arbitrary R/W via the 0x301
  path-overflow + BufferedStorage cache entry), `ro/` (native helper as `ro`,
  domain-table swap, launch), `process/` (FS instruction patch demo),
  `app/` (SmileBASIC-side workers), `shared/` (RPC/frames).
- `runs/` — local-only proof artifacts from runs; not part of the
  distributable (per upstream README).

## Traps on this machine

- **Do not pass the path to `zig.exe` and expect it to work alone** — Zig needs
  its installation directory (`lib/` tree) next to the binary. `execFileSync`
  on a directory path also fails with ENOENT. Pass the full path to `zig.exe`
  inside a fully extracted distribution.
- `Expand-Archive` on the 92 MB zig zip can silently produce an incomplete
  directory (no `zig.exe`, truncated `lib/`) and hang on large entries. Use
  `tar -xf file.zip -C dest`, which completes correctly, then check
  `lib\std\std.zig` exists and run `zig version` before trusting it.
- GitHub and Codeberg both intermittently fail with connect timeouts here.
  Retry before concluding anything is wrong; one retry has always been enough.
- This is a Windows machine; commands are PowerShell unless stated otherwise.