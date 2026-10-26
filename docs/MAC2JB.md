# mac2jb v0.4.0 — the macOS route

[mac2jb](https://github.com/cpypwn/mac2jb) is a macOS app that turns an Apple
silicon Mac into a **USB keyboard** for the Switch 2. It types the 229-line
SmileBASIC bootstrap into the console over a cable, then sends the post-bootstrap
commands (`LOAD`, `RUN`, `REMOVE`, `V=START(...)`) for you. It exists because
typing that program by hand is the most painful part of the whole process.

It is a **front end**, not a different exploit. Underneath, it runs the same
engine as this repository.

> **Verified relationship, not a guess.** mac2jb v0.4.0 pins
> `kurumuz/ns2jb@eb2bdec8f3907c5830eb01fb9d55797af7403579` in its
> `upstream.lock`, and the copy it vendors under `vendor/ns2jb/` is byte-identical
> to a clean clone of that commit. Its bundled `assets/bootstrap.bas` is the same
> 229-line program this repository ships — character for character, differing only
> in line endings (mac2jb CRLF, this repo LF; see the check at the end of this
> page). That is why this repository's default branch is the kurumuz fork: so
> "the Mac app" and "the repo" are the same exploit.

---

## When to use it

Use mac2jb if **all** of these are true:

- Your Mac has **Apple silicon** (M1 or later). It is `arm64` only.
- You are on **macOS 14 or newer**.
- You are willing to **disable SIP** and load an unsigned kernel extension, and
  to do the Recovery-mode dance once.
- Your console is on **Ethernet**. Wi-Fi has not been verified with this setup;
  upstream says to stay on Ethernet until it is.

Use **this repository** instead if you are on Windows, Linux, or an Intel Mac, or
if you do not want to touch SIP and kernel extensions. You will type the
bootstrap yourself.

## What it needs

| Requirement | Detail |
|---|---|
| Mac | Apple silicon, macOS 14+ |
| Console | Switch 2, **system software 23.0.1** |
| App | **SmileBASIC 4.4.9**, more than **20 MiB** free in its save |
| Console keyboard layout | **System Settings → Controllers & Accessories → USB Keyboard → US English.** Not UK English, not AZERTY. mac2jb always sends US keycodes. |
| Network | Mac and console on the same reachable network. **Ethernet on the console.** |
| USB | A **data-capable** USB-C cable. If the Switch shows it is charging *from* the Mac, enumeration tends to fail — unplug and reconnect. |
| Driver | The bundled unsigned `usbgadget.kext`, loaded, with **SIP disabled** |

The same version-protection advice as the main guide applies: block Nintendo's
update servers before you start, or an update can move the console past what this
was tested on.

## Download and verify

Get the app from the
[v0.4.0 release](https://github.com/cpypwn/mac2jb/releases/tag/v0.4.0):

```
mac2jb-v0.4.0-macos-arm64.zip
```

Published size is **78,978,431 bytes**, SHA-256:

```
1a111ba47ec9781390f15ca79aa5b73837ae8eb90f7ea7498a03565db31110e9
```

Check it before opening:

```sh
shasum -a 256 mac2jb-v0.4.0-macos-arm64.zip
```

The release also publishes `mac2jb-v0.4.0-sha256sums` and a source archive
(`mac2jb-v0.4.0-source.zip`) if you would rather build it yourself with
`make gui`.

## Install the USB driver (once)

This is the part people skip and then wonder why nothing types.

1. Shut down. Hold power, choose **Options → Continue** to enter Recovery.
2. **Startup Security Utility → Security Policy → Reduced Security → Allow user
   management of kernel extensions from identified developers.**
3. **Utilities → Terminal**, run `csrutil disable`, restart. Confirm with
   `csrutil status`.
4. Open mac2jb and click **Install & load driver…**, approve the admin prompt.
   (CLI: `bash mac2jb.command --install-driver`.)
5. Approve anything macOS asks for in **System Settings → Privacy & Security**,
   then restart.
6. Verify before running anything:

   ```sh
   kmutil showloaded --list-only | grep -i usbgadget
   ```

   The GUI's checks must also report the driver as loaded.

The installer verifies the bundled driver's hashes, installs it at
`/Library/Extensions/usbgadget.kext` as `root:wheel`, and backs up any driver it
replaces (the backup path is printed). It never changes SIP for you — step 3 is
yours to do.

**Disabling SIP lowers system protection.** Do it on a machine you are
comfortable doing it on, and turn it back on when you are finished with this.

## Run it

1. Confirm the driver is loaded, and **restart the console before every run**.
2. **Type bootstrap only** — choose this with an empty SmileBASIC editor. mac2jb
   types the whole program. It takes roughly **7–10 minutes** at the default
   `--delay-ms 50`. When it finishes, inspect the program, save it as **`NS2` in
   slot 0**, and return to the start screen. This mode does not start the host or
   run the exploit.
3. Restart the console, open SmileBASIC in **Direct mode**, and pick a mode:
   **NS2JB exploit only**, **Held RPC**, or **System-code dump**. Select the Mac's
   IPv4 address on the console's network. mac2jb loads `NS2` and sends `RUN`,
   `REMOVE NSR,&H60000000,&H3FFFFFFF`, and the current `V=START(...)`.
4. Keep the cable connected and SmileBASIC focused until the app reports the
   result.

### The modes

| Mode | What it does |
|---|---|
| **Type bootstrap only** | Types `bootstrap.bas`. No exploit. Run this first, and again whenever the bootstrap changes. |
| **NS2JB exploit only** | The normal run: verify, then clean up and finish. |
| **Held RPC** | Verifies, then keeps the RPC and FS memory endpoint alive until you press **Finish session**. Needed for homebrew and Stremio. |
| **System-code dump** | Verifies, dumps installed system-program code with an inventory and hashes, then cleans up automatically. |

### Homebrew, FTP, and Stremio (v0.4.0)

From a **verified Held RPC** session — still in the same mac2jb app:

- **Launch HBLauncher** starts the bundled **HBLauncher v0.2.0**. Add your own
  apps under `vendor → HBLauncher → apps` (reachable from **Open session logs**).
- **ftpd-sb v0.1.0** is already in HBLauncher: **Refresh → ftpd-sb → A** to start
  FTP against SmileBASIC storage.
- **Launch Stremio** is experimental: the Mac fetches addon data and decodes
  direct HTTP(S)/HLS media, and the console gets a GPU menu with 320×180 video at
  15 fps plus audio. Startup and playback are confirmed; account library and
  watch-progress sync are **not** independently verified. Torrents and subtitles
  are unsupported. Stremio must also be installed on the Mac.

**One homebrew app per Held RPC session.** Finish the session and restart the
console before another run.

## Migrating from an older mac2jb

**The old bootstrap does not work with v0.4.0 and never will.** Previous releases
shipped pepsipu's nine-argument `START`; v0.4.0 uses the kurumuz fork's
**five-argument `START(PORT,A,B,C,D)`**. Replace the saved `NS2` with the new
bundled bootstrap — **Type bootstrap only** in the GUI, **Full install** in the
CLI — before running anything else. Reusing the old `NS2` produces
`Wrong number of arguments`.

## When it does not work

| Symptom | Cause and fix |
|---|---|
| Nothing types into SmileBASIC | Driver not loaded, SIP still on, or the cable is charge-only. Re-check `kmutil showloaded`, then try another cable. |
| Enumeration fails | If the Switch is charging from the Mac, unplug and reconnect. Try an explicit controller from 0–15 in the CLI. |
| Typing starts then stalls | Do **not** blindly retry a partial transfer — you will get duplicated lines. Clear the editor and start the typing step again. |
| `Wrong number of arguments` | Old nine-argument `NS2` is still saved. Re-send the bootstrap. |
| Exploit fails late at a validation check | Timing, as with any route. Restart the console and try again. |
| Commands were "sent" but nothing happened | A successful USB transfer is not proof of execution. Watch the console and the host log. |

The GUI shows the diagnostic log's exact path with an **Open logs** button on
failure. Session files live in private per-launch folders outside the checkout.

## Where the rest of the documentation lives

mac2jb documents itself, and those files are the authority on its behaviour:

- [README](https://github.com/cpypwn/mac2jb/blob/v0.4.0/README.md) — full setup,
  driver provenance, troubleshooting
- [docs/GUI-DEMO.md](https://github.com/cpypwn/mac2jb/blob/v0.4.0/docs/GUI-DEMO.md)
  — every screen and mode
- [docs/HOMEBREW.md](https://github.com/cpypwn/mac2jb/blob/v0.4.0/docs/HOMEBREW.md)
  — HBLauncher and app folders
- [docs/FTPD-SB.md](https://github.com/cpypwn/mac2jb/blob/v0.4.0/docs/FTPD-SB.md)
  — FTP access
- [docs/STREMIO-EXPERIMENTAL.md](https://github.com/cpypwn/mac2jb/blob/v0.4.0/docs/STREMIO-EXPERIMENTAL.md)
  — player controls and limits

## What has and has not been verified

Checked here, on this machine, without a console:

- v0.4.0 vendors `kurumuz/ns2jb@eb2bdec`, matching its `upstream.lock`.
- Its `vendor/ns2jb/` tree matches a clean clone of that commit file-for-file.
- `assets/bootstrap.bas` and this repository's `bootstrap.bas` have identical
  content — the same 229 lines, character for character. They are not
  byte-identical: mac2jb ships CRLF (`69c9843b…8a946edb`, 8313 bytes) and this
  repository ships LF (`ad1de5ab…8281f837`, 8084 bytes), the 229-byte difference
  being exactly one `\r` per line. Normalise the endings and the hashes agree.
  Nothing here reads the file as bytes — `run.cjs` only lists it for checksumming
  — so the endings change no behaviour in this tree.
- The release asset digest above came from GitHub's release API.

**Not** verified here: anything requiring a Switch 2 or an Apple silicon Mac —
USB enumeration, typing, the exploit itself, HBLauncher, ftpd-sb, or Stremio.
Those claims are mac2jb's, and they are marked the way mac2jb marks them:
"confirmed" only where its maintainer says so, "experimental" everywhere else.
