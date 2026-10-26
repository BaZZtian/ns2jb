# The ns2jb exploit chain, mapped against the code

This is a reading of the engine, organized as the four stages the pipeline
actually runs. It follows the tree this repository ships by default —
`kurumuz/ns2jb@eb2bdec`, merged at `4d566aa` — and notes where that fork diverges
from pepsipu's original capture (`95f5525`, tag `pepsipu-95f5525`); see
[What the kurumuz fork changes](#what-the-kurumuz-fork-changes) for the
differences in one place. Every claim below points at a file in this repo; the
blog prose (`docs/blog-capture.md`) is the narrative, this is the code.

## Stage 0 — Bootstrap: SmileBASIC userspace to RPC host

**File: `bootstrap.bas`** — the only file a human ever types into the console.

- `RUN` prints `DIST BOOT READY 1015` and ends. `START(...)` is the real entry,
  invoked from Direct mode. In this tree it is `COMMON DEF START(PORT,A,B,C,D)`
  — the port and the four IPv4 octets, nothing else (`bootstrap.bas:182`). The
  original capture took four extra u64 words, `START(PORT,A,B,C,D,T0#,T1#,T2#,T3#)`,
  but only ever sent them as zero; the fork hard-codes those zeros into the hello
  instead. That is the entire bootstrap difference between the two trees: two
  lines, and the hello payload is byte-identical.
- The `REMOVE NSR,&H60000000,&H3FFFFFFF` command is issued **once from Direct
  mode after RUN**. That is the bug trigger: the interpreter's bounds check
  `position + count <= array.length` passes because the signed 32-bit sum wraps
  negative, so the left-shift `memmove` pulls the 8 bytes before the backing
  array — which contain the array's own pointer — into `R[0]`. The expected
  "Out of memory" error is harmless; the corruption already happened.
- After that, reads/writes through `R[0]`'s substring aliases reach all of
  SmileBASIC memory. `W$(A,N)` (arbitrary read) and `PUT O,V` (arbitrary write)
  wrap that primitive.
- `BOOT()` does not trust addresses from anywhere: it scans memory for a
  fingerprint (`L#==5 && PTR(V#-&H9DB49C,4096)`), then pins the found bases with
  a set of hard-coded hash checks (`HASH#(...) != <constant>` — fails 13..28).
  Those constants are this firmware version's (SmileBASIC 4.4.9, 23.0.1) code
  fingerprints; they fail loudly on any other version.
- `RAW#(V$)` is the call primitive: it writes four argument words to fixed
  offsets inside a string backing buffer, then places a pointer chain so the
  interpreter's next native call lands on a chosen address — a one-gadget call
  with four u64 arguments. `CALL#(F,A,B,C,E)` is the friendly wrapper.
- `START` uses that to open a TCP socket (`fd`), connect back to the computer on
  port 39380, send a 128-byte hello (the base addresses the harness needs), and
  enter `RPC()` — a loop that executes u64-opcode requests the host sends over
  the socket and returns results. From here, **the computer has arbitrary
  userspace read/write/call in SmileBASIC**, and everything else runs from Node.

## Stage 1 — FS arbitrary read/write

**Files: `engine/switch2/memory/normalized-path.cjs`, `fs-memory-control.cjs`,
`cache-address-plan.cjs`, `signed-cache-plan.cjs`, `acquire.cjs`**

- The FS bug: `IFileSystem.GetEntryType` normalizes the requested path. Paths
  containing a parent-directory component with a backslash (`/..\`) take a
  helper that allocates a **0x301-byte** heap buffer and copies the (already
  normalized, attacker-controlled-length) path in. Longer paths overflow it.
- `normalizedPath(prefix, length)` builds those overflow paths deterministically
  — always already-normalized (`/AAAA...` runs), length exactly tuned.
- The write target is a `BufferedStorage` cache entry: with its dirty bit set,
  FS reads/writes the file through the entry's backing-buffer pointer. Overwrite
  the pointer and reads/writes become arbitrary.
- The engine models this as a **"signed-one-shot" cache header** plan
  (`fs-memory-control.cjs: encoding === 'signed-one-shot'`): each read/write
  retargets the window; the planner (`signed-cache-plan.cjs`) computes the
  header bytes so a target address lands inside the storage-size window,
  aligned to the bucket period (`cacheAddress.bucketPeriod`, 0x500000 by
  default). This is the stability trick from the blog's footnote 4 — mutate one
  cache entry's metadata instead of repeating the overflow per access.
- Qualification is strict: `acquire.cjs` proves read, write, **and restoration**
  before anything else runs, and every run writes a JSON proof into `runs/`.

## Stage 2 — FullPermission and the dumps

- With FS ARW, the code scans the connection objects and sets SmileBASIC's
  **saved process ID to 1**. PID ≤ 6 makes the FS permission check treat the
  caller as a built-in sysmodule; the default mask `0x8000000000000000` gives
  FullPermission. (`fs-memory-control.cjs` talks about "root" commands for
  everything obtained this way.)
- That is what turns the SmileBASIC session into something that can read
  ordinary sysmodule code and internal storage — the dumps that stage 3's
  analysis was built on.

## Stage 3 — Native code execution as `ro`

**Files: `engine/switch2/ro/*`, payload in `engine/switch2/ro/payload/`**

The FS-serves-decrypted-code angle: the loader (`ldr`) opens ExeFS through FS
and verifies two signatures (NPDM signed by Nintendo, NCA header signed by the
developer) whose hash chain fixes the executable. But the hash the loader
checks is the one **FS reported** for the filesystem — and FS is compromised.
So the engine swaps the domain-table entry: the loader's ExeFS connection is
repointed at a temporary filesystem object that serves the original `main.npdm`
plus an arbitrary `main` (`ro/copy-loader-root.cjs`, `ro/objects.cjs`). A second
write swaps the refcounts back so FS doesn't crash. Timing is controlled by
replacing the FS-side wait handle for the loader connection with an event handle
SmileBASIC owns (`ro/prepare-event.cjs`).

The launched program is a 4757-byte NSO (program ID `0x0400000000000037`, `ro`'s
NPDM — hence `SetProcessMemoryPermission`/`MapProcessCodeMemory`/
`MapProcessMemory` SVCs are available to it):

- `payload/main.c` — a freestanding IPC server, no heap, no absolute pointers.
  Registers `ro:1` (space 2) and `ro:dmnt` (space 1) with SM, polls both ports
  and up to 4 sessions, and dispatches `SFCI`-shaped requests. Command
  `0x524f0001` is the handshake: it returns a magic (`NS2ROEXE`), a reply that
  XORs the request's first word with a constant, the caller's PID/TID, a tick,
  and the registration results. Everything else forwards to `process_request`.
- `payload/process.c` — the bounded probe set, all through a **real process
  handle transferred by IPC** (never self-SVC abuse):
  - `0x524f0010` query — memory info of the target plus free-address search
  - `0x524f0014` **patch** — map one page of the target via `MapProcessMemory`
    into a readable alias in RO, verify the exact expected 16 bytes, write 16
    replacement bytes, `dc cvau` + `ic ivau` (`publish_code`), verify readback,
    unmap
  - `0x524f0011`/`0x524f0016` **read** — copy ≤128 bytes / ≤4 MiB out through
    the same temporary alias
  - `0x524f0012`/`0x524f0013` map/unmap one caller-owned RW page as executable
  - `0x524f0015` toggle the read bit on native FS executable pages
  Every command re-checks the target's memory type/permissions/attributes
  before acting. The payload is a scoped memory tool, not a shellcode launcher.
- `payload/start.S` provides `_start` and the raw SVC wrappers
  (`connect_port`, `send_request`, `wait_handles`, `reply_receive`,
  `accept_session`, `process_id`, `thread_id`, `system_tick`, and the map
  functions in `process.c`'s externs).
- The patched instruction pattern: `fs-execute.cjs` pins the FS
  `GetEventHandle` entry by its 16-byte prologue
  `7f2303d5 ff8300d1 fd7b01a9 fd430091` before patching, and the replacement
  stub is generated (`returnCode(nonce)`): `nop; movz w0, #nonce; movk w0,
  #nonce>>16; ret` — the demo's proof of execution is the notifier method
  returning a **fresh, instruction-generated nonce** rather than a handle.
- `engine/switch2/pipeline.cjs` is the fixed sequence: console check → FS
  acquisition → RO payload install/gate/launch → instruction challenges → FS
  demo → cleanup, with every stage journalled to `pipeline.json` and proofs to
  `runs/`. Failure paths restore or explicitly abandon (`acquisition.retire()` /
  `acquisition.abandon()`); the README's "restart the console" rule exists
  because later failures can leave native state only a reboot clears.

## What the kurumuz fork changes

This section exists because the fork is the default here, and because its
changes are the difference between "it works" and "it dies late" on a console
with the microSD Express support update. Everything below is a reading of
`git diff 95f5525 eb2bdec` against the files named.

### The layout assumption that broke

The original `ro/layout.cjs` derived the FS domain vtable from the SDK page at a
**fixed distance**: `capturedLayout()` used `sdk = range.address + 0x500000` and
`rootVptr = sdk - 0xf38be0`. On the layout observed after the update that
distance differs, so acquisition could succeed and the RO launch then fail
validation — the exact symptom in issue #2.

The fork keeps the nominal offset as *one candidate* and infers the rest:

- `capturedLayout()` scans the captured heap for the `0x58`-spaced pointer pair
  that identifies the manager/waiters table, takes `rootVptr = first - 0x28e0`,
  and accepts the derived SDK distance only if it is page-aligned and within
  `0x10000` of nominal. Candidates are capped at 64.
- Each candidate must pass **every** structural check in `capturedLayoutAtSdk()`,
  and **exactly one** may survive (`matches.length === 1`) — otherwise the run
  aborts rather than guessing.
- `sdkPageHeader()` separately validates the SDK page's thread-ring header
  (`ptr(bytes, 0x838) === sdk + 0x668`, a bounded count at `0x848`). This is why
  the metadata probe now captures a **16 KiB or 4 KiB** page (`metadata-window.cjs`)
  instead of one fixed size, and why `retained/find-metadata.cjs` tries several
  hypothesis candidates instead of one.

The chosen candidates are recorded in the layout report under `sdkDiscovery`, so
a failed run says which offsets it considered.

### Bounded retries instead of one shot

`acquire.cjs` runs the acquisition child up to `MAX_ATTEMPTS = 3` times, each with
a fresh `memory/probe-reserved-gap.cjs` process, a fresh `acquisition.log`, and a
10-minute deadline. The original made one attempt. This is the "third fresh boot"
behaviour from upstream's own testing, moved into the code.

### Longer timeouts

| Where | Original | Fork |
|---|---|---|
| `shared/rpc.cjs` native request | 60 s | **180 s** |
| `switch2/tools/endpoint.cjs` memory request | 60 s fixed | `requestOnce(…, timeoutMs)` default **300 s**; `request()` default 60 s |
| console greeting | 10 s | 10 s (unchanged) |

A timed-out native request is still destroyed and **must not be replayed** — the
outcome is unknown. The longer window reduces how often that happens; it does not
make replay safe.

### Held RPC

`hold.cjs` (`waitForRelease()`) turns the FS endpoint's lifetime into the parent
runner's: the pipeline publishes `held-ready` over the IPC channel and then blocks
until the runner sends `release` or the channel disconnects.
`pipeline.cjs --hold-rpc` writes `retainedEndpoint` into
`fs-execution-current.json` and defers cleanup until release, instead of retiring
the endpoint as soon as the demo verifies.

### System-code dump

`firmware-dump.cjs` plus `ro/ncm.cjs`: after 4/4 verification, ask NCM for the
installed system-program keys, then read each accessible CodeFS `main.npdm` and
`main`. It writes an inventory with per-file SHA-256 and an `absentFiles` list to
`dumps/firmware-dump.json`. `prepareDumpDirectory()` refuses an unrecognised
non-empty directory and only clears one it previously marked — the marker is
`.ns2jb-firmware-dump.json`.

### Scratch cleanup is unconditional

`cleanup-scratch.cjs` now deletes `NS2_GAP*` entries from the roots of the `save`
and `tmp` mounts at startup, recursively for directories, without consulting
previous run reports or inspecting contents. Anything a user names with that
prefix on either mount is deleted.

### Pairing code removed

`shared/rpc.cjs` no longer reads `token` from `connection.json` and no longer
sends an `Authorization: Bearer` header. **The bridge is loopback-only and now
unauthenticated**, so any local process that can reach the port can issue native
memory requests while a held session is open. That is a real reduction in
protection, and the reason `run.cjs --rpc` prints a warning and should only be
used on a trusted machine.

### Smaller fixes

- `run.cjs` free-space check compares `statfs` `bavail * bsize` as BigInt against
  the required bytes, instead of a form that could reject a run with exactly
  enough space.
- `pipeline.cjs` waits 2 s after the native-helper stage before continuing
  ("wait a little bit before starting the native helper").
- `pipeline.cjs` accepts only `--dump-firmware` and `--hold-rpc`, rejects
  duplicates, and requires IPC for held mode.

## Host requirements

Node 22+ on macOS, Linux, or Windows (the RPC host — this tree carries two
Windows portability fixes, see `docs/PROVENANCE.md`), SmileBASIC 4.4.9 with
≥20 MiB free save space, console and computer on the same network, port 39380
open. `run.cjs` selects the reachable address; `test.cjs` runs the host-side unit
checks without hardware.

## What is deliberately out of scope here

- No persistence: a reboot restores stock RO and clears every write. Upstream
  ships a demo, not CFW.
- No WebKit path: the blog's Codex WebKit n-day branch was abandoned; this
  package is the SmileBASIC → FS → RO chain only.
- Nothing here targets anything but this console/firmware/game combination;
  see `AGENTS.md` for this repo's rules.