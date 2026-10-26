# Provenance — what this repository is and where it came from

This repository is a reworked mirror of **ns2jb**, pepsipu's software-only Switch 2
jailbreak. It is not a fork of the exploit; it is a fork of the *packaging*. The
engine code is upstream's, with two Windows portability fixes noted below.

## The two upstreams

### pepsipu — the original

- **Repository:** <https://gitlab.com/pepsipu/ns2jb>
- **Write-up:** <https://pepsipu.com/blog/2026-10-switch2-jailbreak-ns2jb/> (October 18, 2026)
- **Captured commit:** `95f5525089273c5fce0b95047f3600f8442e96ae` ("clarify"),
  the tip of `main` on 2026-10-22
- **History:** 3 commits — `e4ded17` "Import tested Switch 2 distribution",
  `4f03533` "add attribution", `95f5525` "clarify"
- **Preserved here as:** tag `pepsipu-95f5525` (and
  `pepsipu-capture-2026-10-22`, the docs-only rework commit `ce39c20`)
- **README preserved at:** [`docs/upstream-pepsipu-README.md`](upstream-pepsipu-README.md)

### kurumuz — the fork that is now the default

- **Repository:** <https://gitlab.com/kurumuz/ns2jb>
- **Merged commit:** `eb2bdec8f3907c5830eb01fb9d55797af7403579` ("Merge branch
  'kurumuz.fixrpc' into 'main'")
- **Merged into `main` as:** `4d566aa`, with `--no-ff`, no conflicts
- **README preserved at:** [`docs/upstream-kurumuz-README.md`](upstream-kurumuz-README.md)

The fork was adopted because it addresses the failure reported in
[issue #2, "Doesn't work on my console"](https://github.com/mhzsajan/ns2jb/issues/2)
— a console that gets through the initial exploit and then fails starting the
native helper.
The fork's README attributes this to the **microSD Express support update**
changing the memory layout, and adapts acquisition to both observed layouts. It
also adds bounded retries, longer timeouts, held RPC, and a system-code dump.

**The fork is not drop-in compatible with the original.** It removes the pairing
code and changes the bootstrap's `START` from nine arguments to
`START(PORT,A,B,C,D)`. A saved `NS2` from the original tree produces
`Wrong number of arguments` against this tree.

`origin` still points at pepsipu's GitLab repository; `kurumuz` points at the
fork; `github`, `gitlab` and `codeberg` are this rework's mirrors.

## mac2jb — why the fork is the default

[mac2jb v0.4.0](https://github.com/cpypwn/mac2jb/releases/tag/v0.4.0) is a macOS
USB-typing front end for this exploit. It pins
`ns2jb eb2bdec8f3907c5830eb01fb9d55797af7403579` in its `upstream.lock`.

Verified here, on this machine:

| Check | Result |
|---|---|
| `vendor/ns2jb/` vs a clean clone of `kurumuz/ns2jb@eb2bdec` | same file set, same contents |
| `vendor/ns2jb/bootstrap.bas` SHA-256 | `69c9843bde8de00e69b381c69dba20b5a57e1fa026d5677149f0ae6e8a946edb` (CRLF, 8313 bytes) |
| `assets/bootstrap.bas` SHA-256 | same value |
| this repository's `bootstrap.bas` SHA-256 | `ad1de5ab9892fc3c9eb0eb9a3a36f6af64e938e715ce08b56860f0848281f837` (LF, 8084 bytes) |
| the two files, after normalising CRLF to LF | identical — the 229-byte difference is exactly 229 line terminators |
| release asset `mac2jb-v0.4.0-macos-arm64.zip` | 78,978,431 bytes, SHA-256 `1a111ba47ec9781390f15ca79aa5b73837ae8eb90f7ea7498a03565db31110e9` (from GitHub's release API) |

So "the Mac app" and this repository ship the same exploit and the same
bootstrap. See [`MAC2JB.md`](MAC2JB.md).

## The payload still reproduces byte-for-byte

Upstream claims `engine/switch2/ro/payload/main` (the native NSO payload) can be
rebuilt identically from `main.c`, `process.c`, and `start.S` with Zig 0.15.2.
Verified at capture time:

```
node engine/build-payload.cjs --check --zig <path to zig 0.15.2>
{"bytes":4757,"sha256":"d590cbfc5d9152c24d5a36f083f8470a2f3164be6b78130129d44132b939701a","matched":true}
```

- Zig 0.15.2, Windows x86-64 build (`zig-x86_64-windows-0.15.2`)
- `matched: true` — the rebuilt NSO image equals the shipped `main` byte-for-byte
- `payloadBytes: 4757`, SHA-256 as above, matching
  `engine/switch2/ro/payload/manifest.json`

This is a stronger statement than trusting `SHA256SUMS`: the shipped binary is
reproducible from the shipped source on an independent machine. The payload is
unchanged by the fork and by this rework, so the check still applies.

## Changes made by this rework

### Engine

Two files in `engine/` are modified, both for Windows. Neither changes behaviour
on macOS or Linux:

1. **`engine/switch2/memory/run-control.cjs`** — `fs.mkdtemp('/tmp/ns2-')`
   becomes `fs.mkdtemp(path.join(os.tmpdir(), 'ns2-'))`. `/tmp` does not exist on
   a clean Windows install, so every run threw `ENOENT` before the first
   checkpoint.
2. **`test.cjs`** — two test-only fixes:
   - the dependency walk normalises `path.relative()` output with
     `.split(path.sep).join('/')`, because `present` is built with `/` separators
     and Windows returns `\`;
   - the firmware-dump symlink test uses a **junction** on Windows, because a
     directory symlink needs Developer Mode or administrator rights and fails
     with `EPERM`.

No exploit logic, memory offset, timing constant, or payload byte is altered.

### Integrity file

`.gitattributes` forces LF in the working tree. Upstream generated `SHA256SUMS`
from LF bytes; without this, a Windows checkout rewrites every text file to CRLF,
every hash changes, and the integrity file looks tampered with.

**`SHA256SUMS` was regenerated.** The fork never updated its own copy: against a
clean checkout of `kurumuz/ns2jb@eb2bdec`, **14 of its 97 entries were already
stale** (`README.md`, `bootstrap.bas`, `run.cjs`, `test.cjs`, and ten files under
`engine/`). Shipping that file would have made every honest user's verification
fail. The regenerated file has **105 entries** and matches this tree exactly — it
covers the same set upstream did, plus `rpc.cjs`, which upstream shipped but never
listed. `README.md` tells users how to check it. For the record, the original
capture was clean apart from one known stale line (`README.md`, recorded
`39aa0e49…` while `95f5525` shipped `cb0ce047…`).

### Documentation

- `README.md` — rewritten as a user guide (upstream text preserved under `docs/`)
- `docs/MAC2JB.md` — the macOS route, and its verified relationship to this tree
- `docs/upstream-pepsipu-README.md`, `docs/upstream-kurumuz-README.md`
- `docs/PROVENANCE.md` — this file
- `docs/ANALYSIS.md` — the exploit chain, plus the fork's changes
- `docs/blog-capture.md` — captured copy of pepsipu's write-up

## Hardware claim status

Upstream (pepsipu) reports the demo was physically tested on a Switch 2, system
software 23.0.1, SmileBASIC 4.4.9, on 2026-10-21 — third fresh boot, with the
first two attempts stopping at validation checks and cleaning up.

The fork reports physical testing on 2026-10-21 as well: both FS instruction
challenges, restoration, and cleanup passed, also timing-sensitive.

**We have not re-run anything on hardware.** Every local check here is host-side:
`node test.cjs` (18/18 passing) and the reproducible-build check. Nothing in this
repository asserts a result on a console that was not observed on a console.
