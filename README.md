# FusionDex Tracker

A static, GitHub Pages–friendly site that tracks your Pokémon Infinite Fusion 2
(Hoenn) progress: caught/seen species, current party, and PC boxes — synced
live from your save file, no install required.

## How it works

- **First time only:** double-click `Start-FusionDex-Watcher.bat` (Windows) and
  leave that window open while you play. It copies your save file from
  `%APPDATA%\infinitefusion-hoenn\File A.rxdata` into a folder called
  `FusionDexSync` on your Desktop every time it changes. This step exists
  because Chrome blocks websites from reading files directly out of
  `%APPDATA%` for security — copying it to a normal folder first works around
  that.
- On the website, click **Connect Save** and pick the file from
  `Desktop\FusionDexSync\File A.rxdata` (not the original AppData one).
- The browser re-checks that copy every ~4 seconds (Chrome/Edge only — this
  uses the File System Access API, which Firefox/Safari don't support).
- When the watcher script detects your save changed, it updates the copy,
  and the site picks it up automatically — no need to reconnect.
- Everything is stored in **localStorage on your device only** — nothing is
  uploaded anywhere. Export/Import let people back up or move progress
  between browsers manually.

### Distributing this to other players

Anyone who wants auto-sync needs to run `Start-FusionDex-Watcher.bat` once
and leave it running in the background while they play — it's a small local
helper, not something the website can do on its own (no website can read
files from anyone's computer automatically; this is a browser security rule,
not a limitation specific to this project). Share both the script and the
site link together.

If someone doesn't want to run anything locally, they can still use the site
without the watcher: Connect Save will let them manually pick their save file
each time they want to sync, directly from a folder Chrome can access (e.g.
if they manually copy it out of AppData themselves first).

## What's real vs. what's a placeholder

I wrote `assets/rmarshal.js` as a working Ruby Marshal 4.8 reader (same
approach as the Python `rmarshal.py` parser from earlier) — it correctly
walks the actual save format: objects, arrays, hashes, symbols, strings,
bignums, backreferences, etc.

What I **could not verify** without your actual PIF2 game files:

1. **Class names** — `extractTrainerData()` in `app.js` looks for an object
   whose Ruby class is `Trainer` or `PokeBattle_Trainer`, and for ivars named
   `@pokedex`, `@owned_standard`, `@party`, `@boxes`, `@species`,
   `@species_data`, `@head_pokemon`, `@body_pokemon`. These are the standard
   Pokémon Essentials names, but PIF2 may have renamed or restructured some
   of them for Hoenn/fusion-specific data.
2. **PC box shape** — box storage formats vary between Essentials versions
   (`PokemonStorage` vs `PokemonStorageSystem`), so `findByIvarHint` does a
   best-effort search rather than a hardcoded path.

## To actually finish this

The fastest way to confirm/fix the class and ivar names: load one save file
and log the raw parsed tree.

```js
const buf = await (await fetch('File A.rxdata')).arrayBuffer();
console.log(window.RMarshal.parseMarshal(buf));
```

Open it in the browser console, find your real Trainer object, and compare
its `__class` and `ivars` keys against what `app.js` expects. Send me what
you find (or the save file itself) and I'll correct the field names directly
— the parser underneath won't need to change, just the lookup paths.

## Deploying

This is already a plain static site — push the whole folder to your
`Fusiondex-tracker` GitHub repo and Pages will serve it as-is. No build step.
