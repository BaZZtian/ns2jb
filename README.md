# ns2jb — Switch 2 filesystem demo

A working copy of **[ns2jb](https://gitlab.com/pepsipu/ns2jb)**, a software-only
research exploit for the Nintendo Switch 2. It runs two small native functions
inside the console's filesystem service (`fs`), checks the results, and puts the
original instructions back.

**What it is not:** custom firmware, a game loader, or a piracy tool. Upstream's
own words are *"This demo does not install custom firmware or persistence."*
Nothing survives a console restart, and a restart is how you undo a run.

Read [Before you start](#before-you-start) before touching anything. This is
timing-sensitive research code: it can fail, it can crash the app, and a failed
run may need a console restart.

---

## Contents

- [Which download to use](#which-download-to-use)
- [Before you start](#before-you-start)
- [Step 1 — Put the bootstrap into SmileBASIC](#step-1--put-the-bootstrap-into-smilebasic)
- [Step 2 — Start the host on your computer](#step-2--start-the-host-on-your-computer)
- [Step 3 — Drive it from the console](#step-3--drive-it-from-the-console)
- [Step 4 — Read the result](#step-4--read-the-result)
- [If it fails](#if-it-fails)
- [Optional: held RPC](#optional-held-rpc)
- [Optional: system-code dump](#optional-system-code-dump)
- [What is in this repository](#what-is-in-this-repository)
- [Tools built on this](#tools-built-on-this)
- [Verifying what you downloaded](#verifying-what-you-downloaded)
- [Credits](#credits)

---

## Which download to use

| You have | Use this |
|---|---|
| **macOS on Apple silicon** | **[mac2jb v0.4.0](https://github.com/cpypwn/mac2jb/releases/tag/v0.4.0)** — a GUI that types the bootstrap into the console over a USB cable and sends the commands for you. It bundles this same engine. Read [docs/MAC2JB.md](docs/MAC2JB.md) first; it needs a kernel extension and SIP disabled. |
| **Windows, Linux, or Intel macOS** | **This repository.** You need Node.js and you type the bootstrap yourself (see [Step 1](#step-1--put-the-bootstrap-into-smilebasic)). |

Both routes run the *same* exploit engine. The only difference is who types the
229-line BASIC program into the console.

> **Why this repository exists.** It started as a capture of pepsipu's original
> release. It now tracks **kurumuz's fork** by default, because that fork is what
> fixes the most common "it doesn't work on my console" failure — see
> [Which console firmware do I have?](#which-console-firmware-do-i-have).
> pepsipu's original tree is still here at tag `pepsipu-95f5525`.

---

## Before you start

### You need all of this

- A **Nintendo Switch 2**.
- **System software 23.0.1** and **SmileBASIC 4.4.9**. Other versions are untested
  and may simply not work.
- A **computer on the same network** as the console, running **Node.js 22 or
  newer** (`node --version`).
- **More than 20 MiB free** in the SmileBASIC save area.
- A **USB keyboard** is strongly recommended for entering the bootstrap, or a
  second person to read it out. It is 229 lines of BASIC.
- Patience. Acquisition is timing-sensitive; upstream's own hardware test passed
  on the **third** fresh boot, with the first two attempts stopping at validation
  checks and cleaning up.

### Which console firmware do I have?

On the console open **System Settings → Support/Health & Safety** and look at
item **3**.

- Shows **(B)** — your console has the microSD Express support update. **Use this
  repository.** pepsipu's original release can get through the first stage and
  then fail starting its native helper on this memory layout.
- Does **not** show **(B)** — either tree should work. This repository handles
  both layouts it has seen.

This is the single most common cause of a run that dies late with a validation
error, so check it first.

### Strongly recommended: stop the console from updating

An update can move the firmware past what this exploit was tested against, and
there is no way back. Before testing, block Nintendo's update servers with
[DNS filtering](https://consolemods.org/wiki/Switch:Blocking_OFW_Updates) on the
network the console uses:

1. **System Settings → Internet → Internet Settings** → pick the connection →
   **Change Settings** → **DNS Settings: Manual**.
2. Americas: primary `207.246.121.77`, secondary `163.172.141.219`.
   Everywhere else: primary `163.172.141.219`, secondary `207.246.121.77`.
3. Set **both IPv6 DNS entries to `::`**, save, reconnect.

This blocks Nintendo services generally, so the eShop and Nintendo Switch Online
will stop working on that connection. It is also not a guarantee — cached
addresses or a different network can bypass it. It only protects the versions you
have; it does nothing for exploit reliability.

### Understand the risk

- The exploit writes to live process memory. A wrong or unlucky run can crash
  SmileBASIC or the console.
- Do not run it on a console you cannot afford to restart, and do not run it
  while anything you care about is unsaved.
- Enter `REMOVE NSR,&H60000000,&H3FFFFFFF` **once per SmileBASIC launch**. Doing
  it twice is how you break the application state.
- Restart the console **before every attempt**, and after every failed one.

---

## Step 1 — Put the bootstrap into SmileBASIC

This is a one-time job per console.

1. On the console, open **SmileBASIC** and choose **Make a Program**.
2. Enter the contents of [`bootstrap.bas`](bootstrap.bas) — all 229 lines —
   exactly as written. A USB keyboard makes this bearable; the console accepts
   one via **System Settings → Controllers & Accessories → USB Keyboard**.
3. Save it into **slot 0** with the name **`NS2`**.

There is **no import file and no download key**. A `.bas` file on your computer
cannot be transferred to the console — SmileBASIC has no import path for it. The
bootstrap has to be typed, or sent by something that types for you, which is
exactly what mac2jb does over USB.

> **Upgrading from an older copy?** If you already saved an `NS2` from pepsipu's
> original release, it has a **nine-argument** `START`. This tree's bootstrap uses
> the **five-argument** `START(PORT,A,B,C,D)` form. Replace the saved program, or
> use the fallback line in [Step 3](#step-3--drive-it-from-the-console).

---

## Step 2 — Start the host on your computer

1. Get this repository onto the computer — `git clone`, or **Code → Download ZIP**
   and extract. No `npm install` is needed; the engine has no third-party
   dependencies.
2. Restart the console, open SmileBASIC, and leave it in **Direct mode**.
3. In a terminal **in the repository folder**, run:

   ```sh
   node run.cjs
   ```

   If more than one network address is available it lists them and asks you to
   pick the one the console can reach. You can skip the question:

   ```sh
   node run.cjs 192.168.1.10
   ```

   The host listens on **TCP port 39380**. If that port is blocked, the console
   will never connect, and the host will sit at *"Waiting for Switch 2"*.

Leave that terminal open. It prints the exact `V=START(...)` line for your
computer's address — you will need it in a moment.

---

## Step 3 — Drive it from the console

In SmileBASIC, in Direct mode, enter these **one at a time**, confirming each:

```basic
LOAD "TXT:NS2"
```

```basic
RUN
```

```basic
REMOVE NSR,&H60000000,&H3FFFFFFF
```

**`Out of memory` from `REMOVE` is expected.** That is the bug being used, not a
failure. The host terminal should now say it is waiting.

Then enter the **`V=START(...)` line the host printed**:

```basic
V=START(39380,192,168,1,10)
```

(with your own address). If SmileBASIC answers **`Wrong number of arguments`**,
your saved `NS2` is the older nine-argument bootstrap — enter the *second*
`V=START(...)` line the host prints, which has `,0,0,0,0` on the end. Do **not**
repeat `RUN` or `REMOVE`; just enter the replacement `START` while the host is
still waiting.

Now **do not touch the console**. Keep SmileBASIC in the foreground and the
computer awake.

---

## Step 4 — Read the result

The host prints progress and finishes with something like:

```
4/4 verified
```

That means both native functions ran, their results matched, and the original
instructions were restored. The run folder is printed too — it holds the logs and
a JSON record of what happened.

When you are done: **restart the console.** That restores the original `ro`
process and clears everything. There is nothing to uninstall.

---

## If it fails

| What you see | What it means | What to do |
|---|---|---|
| Host sits at *"Waiting for Switch 2"* | The console never reached port 39380 | Check both are on the same network and that you entered the `START` line. Windows firewall may need to allow Node.js on private networks. |
| `Wrong number of arguments` | Old nine-argument `NS2` is saved | Enter the second `V=START(...,0,0,0,0)` line the host printed. |
| Fails late, at a validation check | Timing, or the wrong memory layout | **Restart the console** and try again. Upstream needed three attempts. Confirm your firmware item 3 status. |
| `Out of memory` at `REMOVE` | Expected | Continue. |
| `Out of memory` anywhere else, or the app closes | The run disturbed the app | Restart the console. Keep the `runs/` folder if you want to report it. |
| A second `REMOVE` was entered | Application state is now inconsistent | Restart the console. Do not try to "fix" it with more commands. |

**Always restart the console between attempts.** Re-running in the same
SmileBASIC session is not supported and produces confusing errors.

Keep the `runs/` folder when a run fails — it is the only record of what the
engine saw. It is git-ignored and never part of the distributable.

---

## Optional: held RPC

`node run.cjs` verifies the exploit and then closes everything. If you want the
connection to stay alive after the 4/4 check — for the homebrew launcher, or to
poke at memory yourself:

```sh
node run.cjs --rpc
```

After 4/4 it prints a `runs/switch2-*` folder and stays open. From another
terminal:

```sh
node rpc.cjs runs/switch2-RUNID status
node rpc.cjs runs/switch2-RUNID '{"command":"query","address":4294967296}'
```

**This is live memory access, not a sandbox.** A wrong request can crash the app
or the console. Requests are serialized, and a request that timed out must never
be replayed — its outcome is unknown. The bridge listens on the computer's
loopback interface only and has **no authentication**, so use a machine you
trust. Stop it with **Ctrl-C** when finished; only then does it clean up the FS
endpoint and close the console connection. Keep SmileBASIC open the whole time —
this does not survive closing the app or restarting the console.

Held mode is also what other tools attach to — see
[docs/ECOSYSTEM.md](docs/ECOSYSTEM.md).

---

## Optional: system-code dump

To capture installed system-program code from your own console, use this instead
of `node run.cjs` for a fresh attempt:

```sh
node dump-firmware.cjs
```

It completes the normal 4/4 exploit, then asks the console's NCM for the
installed system-program IDs and reads each accessible `main.npdm` and `main`.
Output goes to `dumps/`, with `dumps/firmware-dump.json` holding the inventory,
per-file SHA-256 hashes, and any titles whose CodeFS was unavailable. You need
**512 MiB free** on the computer.

Starting another dump run **clears the previous `dumps/` contents**. Copy
anything you want to keep first. An unrecognised non-empty `dumps/` directory is
never cleared automatically. You can combine it with held RPC:
`node run.cjs --dump-firmware --rpc`.

At startup the runner also deletes files and directories whose names start with
`NS2_GAP` from the roots of SmileBASIC's `save` and `tmp` mounts, recursively.
Do not keep personal files with that prefix on either mount.

---

## What is in this repository

```
bootstrap.bas        the 229-line program you type into SmileBASIC
run.cjs              host entrypoint: listens, prints START, orchestrates the run
dump-firmware.cjs    same run, plus a system-code dump
rpc.cjs              client for the optional held RPC
test.cjs             host-side checks (node test.cjs) — needs no console
engine/              the exploit engine, unchanged from the fork except for
                     two Windows portability fixes (see docs/PROVENANCE.md)
SHA256SUMS           hashes of every shipped file
docs/                provenance, exploit analysis, upstream READMEs, mac2jb guide,
                     and a list of tools built on this engine
```

The engine layout: `engine/switch2/memory/` (arbitrary read/write via the 0x301
path-overflow and a BufferedStorage cache entry), `engine/switch2/ro/` (the native
helper, domain-table swap, launch), `engine/switch2/process/` (the FS instruction
demo), `engine/switch2/app/` (SmileBASIC-side workers), `engine/shared/` (RPC and
framing).

Reading order for the curious: [`docs/PROVENANCE.md`](docs/PROVENANCE.md) (what
was captured and verified), [`docs/ANALYSIS.md`](docs/ANALYSIS.md) (the exploit
chain against the actual code), [`docs/blog-capture.md`](docs/blog-capture.md)
(pepsipu's write-up).

---

## Tools built on this

This repository is the engine and the host. Other projects sit on top of it, each
with its own repository and licence:

- **mac2jb** — the macOS USB-typing front end. [docs/MAC2JB.md](docs/MAC2JB.md)
- **HBLauncher** and **ftpd-sb** — a homebrew launcher and FTP access, bundled
  with mac2jb.
- **OunceCake** — mounts a game's romFS/exeFS and serves it over FTP from a held
  RPC session. It is a separate GPL-2.0 project and is **not** vendored here.

Details, and what is deliberately out of scope in this repository:
[docs/ECOSYSTEM.md](docs/ECOSYSTEM.md).

---

## Verifying what you downloaded

Every shipped file's SHA-256 is in `SHA256SUMS`. On Linux or macOS:

```sh
shasum -a 256 -c SHA256SUMS
```

On Windows, PowerShell:

```powershell
Get-Content SHA256SUMS | ForEach-Object {
  $h, $f = $_ -split '\s+', 2
  $actual = (Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $h) { "MISMATCH $f" }
}
```

An empty result means every file matches. The host-side checks need no console:

```sh
node test.cjs
```

The native payload is also reproducible from its own source with Zig 0.15.2:

```sh
node engine/build-payload.cjs --check --zig /path/to/zig
```

That is a stronger statement than any checksum file: the shipped binary can be
rebuilt byte-for-byte from the shipped source on an independent machine. See
[`docs/PROVENANCE.md`](docs/PROVENANCE.md) for the recorded result.

---

## Credits

- **pepsipu** — original ns2jb: exploit, engine, and
  [write-up](https://pepsipu.com/blog/2026-10-switch2-jailbreak-ns2jb/).
  Upstream: <https://gitlab.com/pepsipu/ns2jb>.
- **kurumuz** — the fork this repository now ships by default: memory-layout
  adaptation, bounded retries, longer timeouts, held RPC, firmware dump, and the
  five-argument bootstrap. Upstream: <https://gitlab.com/kurumuz/ns2jb>.
- **cpypwn** — [mac2jb](https://github.com/cpypwn/mac2jb), the macOS USB-typing
  front end built on the same fork.
- **shinyquagsire23** — `libusbd` and `macos_usb_gadget_poc`, the USB gadget work
  mac2jb depends on.

Mirrors of this rework: [GitHub](https://github.com/mhzsajan/ns2jb) ·
[GitLab](https://gitlab.com/mhzsajan/ns2jb) · [Codeberg](https://codeberg.org/mhzsajan/ns2jb).

No licence file was published upstream. This is research code; the copyright
stays with the authors above. Treat it as something to study and run on your own
hardware, not something to redistribute as your own.
