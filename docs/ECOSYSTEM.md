# Tools built on this exploit

This repository is the engine and the host. Several other projects sit on top of
it. None of them are vendored here — each has its own repository, its own licence,
and its own maintainer — but knowing what exists is useful when you are deciding
what to do after `4/4 verified`.

| Tool | What it adds | Runs where |
|---|---|---|
| [mac2jb](MAC2JB.md) | types the bootstrap over USB and sends the commands | Apple silicon Mac |
| [HBLauncher](https://github.com/ravensclawx/HBLauncher) | a homebrew app launcher on the console | via mac2jb, or the held RPC |
| [ftpd-sb](https://github.com/ravensclawx/ftpd-sb) | FTP access to SmileBASIC storage | inside HBLauncher |
| [`rpc.cjs`](../rpc.cjs) | a JSON bridge to native memory calls | this repository, `--rpc` |
| [OunceCake](#ouncecake) | mounts a game's romFS/exeFS and serves it over FTP | this repository's held RPC |

Everything below the table is a *consumer* of the same primitive: the held RPC
and FS memory endpoint that `node run.cjs --rpc` keeps alive after verification.

---

## OunceCake

<https://github.com/misshexa66/OunceCake> — **GPL-2.0**, JavaScript plus a small
native payload, created 2026-10-25.

It is a **game-file dumper**: it enumerates the titles installed on the console,
mounts one, and exposes its **romFS and exeFS** over FTP so a client can pull the
files off. It supports digital games, game cards, and Switch 2 Editions.

### How it fits with this repository

OunceCake does not re-implement the exploit. It attaches to a run directory that
this repository produced:

```sh
node run.cjs --rpc          # this repo: verify, then hold the session
node ouncecake.cjs runs/switch2-XXXXXX
```

Reading its code (`ouncecake.cjs`, `engine/session.cjs`, `engine/mounts.cjs`,
`engine/ftp.cjs`), the flow is:

1. `attachGame(run)` opens the held RPC session recorded in that run folder.
2. `discoverGames()` enumerates titles and reports which storage each lives on
   (game card, internal, SD).
3. `prepareGame()` mounts the chosen title's content.
4. `deployFtp()` pushes its own native image — `engine/oz-code/native.bin`, built
   from `native.c` — and serves FTP on port **2121** (change with `--port`).

So it reuses the same RO native-helper path this engine uses, with a payload that
mounts content instead of patching an instruction. That is why it needs the
**held** mode specifically: the ordinary `node run.cjs` closes its RPC when the
demo verifies, which leaves nothing to attach to.

### Its own disclaimer, restated

OunceCake's README says, in its own words:

> For the love of God, do NOT share any files you rip using this tool. It is to be
> used with ONLY your own games on your OWN system. This tool doesn't provide
> system keys or any method to decrypt files. The files are loaded normally by the
> system, then pulled over FTP.

That is the whole of its legal position, and it is worth being precise about what
it does and does not do: it does **not** break encryption and it does **not**
provide keys. It reads content that the console has already decrypted for its own
use, through a filesystem that this exploit has compromised.

### Scope in this repository

Deliberately, this repository:

- does **not** vendor OunceCake or any part of it;
- does **not** contain game-dumping instructions;
- does **not** ship, link to, or condone distributing dumped content.

`dump-firmware.cjs` here is a different thing: it captures **system-program code
from your own console** with an inventory and per-file hashes, for analysis. It
does not touch game content.

If you want the tool, get it from its own repository and read its README and
licence there. One rough edge worth knowing before you start: its usage text
still says `node poundcake.cjs`, which is a leftover name — the file is
`ouncecake.cjs`.

### The press coverage

The article at
<https://onejailbreak.com/blog/switch-2-game-file-dumper/> is about this tool and
the first reported game dumps. Two notes on how to read it:

- **It could not be fetched from here.** The site returns `403 Forbidden` behind
  Cloudflare to every route tried (direct, a reader proxy, and a real browser),
  so nothing in this repository is based on its text.
- **The repository is the ground truth.** Everything above is read from
  OunceCake's own source, README, and licence, not from the article. If the
  article and the code disagree, the code wins — the same rule this repository
  applies to pepsipu's blog.

Claims in the wider press that specific commercial games were dumped are other
people's reports about other people's consoles. They are not verified here, and
they are not something this repository reproduces.

---

## Adding another tool to this list

Keep it to one paragraph per tool, name the file or function the claim comes
from, and state the licence. Do not vendor code with an incompatible licence into
this tree, and do not turn an entry into a how-to for copying content you do not
own.
