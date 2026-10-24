Thank you Codex for dutifully packaging the exploits for distribution. No, I have not read the distributed package.

# Switch 2 FS demo

## What this fork improves

This fork aims to make the exploit work across the two Switch 2 memory layouts
we observed before and after installing the microSD Express support update. The
original could get through the initial exploit, then fail while starting its
native helper; this fork adapts to either observed layout.

To check for the microSD Express support update, open **System Settings →
Support/Health & Safety** and look at item 3. On our test console it showed
**(B)** after the update. If yours shows **(B)**, use this fork: the original
fixed-layout version may fail on the layout we observed after the update. This
fork also supports the layout we observed before the update, so you can use it
even if item 3 does not show **(B)**.

It also reduces some avoidable failures: it spends less time searching memory,
gives timing-sensitive steps more bounded chances to succeed, accepts a valid
memory pattern the original rejected, and handles leftover temporary files
from interrupted runs. A free-space check that could reject exactly enough
space is fixed, and failures produce more useful diagnostics.

These changes improve compatibility and recovery, but the exploit is still
timing-sensitive. They are not a guarantee that every attempt—or every
console—will succeed.

The host now waits up to 3 minutes of inactivity for a native-bridge request
and up to 2 minutes for each console response after pairing. The initial
console greeting still has a 10-second limit. These longer waits can avoid
aborting a slow request that would work otherwise.

Runs two small native functions inside FS, checks their results, and restores the
original instructions. Switch 2 only; no npm install or compiler needed.

You need **SmileBASIC 4.4.9**, **system software 23.0.1**, **Node.js 22+** on
macOS or Linux, and over **20 MiB free** in the SmileBASIC save. The computer and
console must be on the same reachable network.

## One-time setup

In SmileBASIC’s **Make a Program**, enter `bootstrap.bas` into slot 0 and save it
as `NS2`. A USB keyboard helps. The ZIP is a computer package, not a SmileBASIC
import file; there is no published download key.

## Run

1. Restart the console, open SmileBASIC, and enter Direct mode.
2. On the computer, open a terminal in the extracted folder and run:

   ```sh
   node run.cjs
   ```

   If asked, select the computer address reachable by the console. You can also
   supply it directly: `node run.cjs 192.168.1.10`. The connection uses port 39380.

3. In SmileBASIC, load the saved program and enter these commands separately:

   ```basic
   LOAD "TXT:NS2"
   RUN
   REMOVE NSR,&H60000000,&H3FFFFFFF
   ```

   Confirm the load. The **Out of memory** message from `REMOVE` is expected.
   Then enter the **`V=START(...)`** line printed by the computer.

Keep SmileBASIC open and the computer awake until **FS execution verified**.
Restart the console when finished; that also restores the original RO process.
This demo does not install custom firmware or persistence.

If a run fails, keep the `runs` folder and restart the console before trying
again. Enter `REMOVE` only once per application process. Logs and temporary
memory captures stay in `runs`; they are not part of the distributable.

## Optional system-code dump

To capture installed system-program code from your own console, use this
command **instead of** `node run.cjs` for a fresh attempt:

```sh
node dump-firmware.cjs [computer-IP]
```

Follow the same SmileBASIC steps above. The command first completes the normal
4/4 exploit and verifies that the temporary FS instruction changes were
restored. Before the runner closes its RPC, it asks NCM for the installed,
full system-program IDs and reads each accessible CodeFS `main.npdm` and `main`
file. If the dump completes, it then performs the normal exploit cleanup. You
do not need to race to start a second command after 4/4; the ordinary `run.cjs`
closes its RPC at the end. `node run.cjs --dump-firmware [computer-IP]` is
equivalent.

The output is in the repo-root `dumps/` directory. Open
`dumps/firmware-dump.json` for the title inventory, per-file SHA-256 hashes,
and entries whose CodeFS was unavailable. Captured files are in
`dumps/<title-id>/` directories, alongside `dumps/ncm-system-programs.bin`.
Starting another firmware-dump run clears the previous `dumps/` contents;
ordinary `run.cjs` runs do not touch them. An unrecognized nonempty `dumps/`
directory is never cleared automatically. Copy any partial or completed dump
you want to keep before starting another dump run. Run logs remain in `runs/`.

Startup removes only scratch paths backed by this checkout's prior run records.
For an interrupted run from another checkout, `NS2_RECOVER_SCRATCH_REPORTS`
can name its absolute `reserved-gap-*.json` report path (multiple paths are
separated by the platform path separator). The runner validates the report and
the temporary directory's expected shape before removing that directory; it
does not wipe `/tmp` or remove unrelated files.

The metadata probe now selects a 16 KiB or 4 KiB window from the observed
allocator link, and the later layout check validates the captured SDK page
while discovering the domain vtable independently. These paths matched saved
hardware captures from both observed layouts.

Physically tested on October 21, 2026: both FS instruction challenges,
restoration, and cleanup passed. Acquisition is timing-sensitive: the test
passed on the third fresh boot. The first two attempts stopped at validation
checks and cleaned up.

## Code

`run.cjs` is the host entrypoint. `engine/switch2/pipeline.cjs` contains the fixed
launch sequence; `engine/switch2/process/fs-execute.cjs` contains the FS demo.
The native helper and its source are in `engine/switch2/ro/payload/`.
Developers can reproduce it with Zig 0.15.2:
`node engine/build-payload.cjs --check --zig /path/to/zig`.
