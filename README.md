# FusionDex Tracker

A static, GitHub Pages–friendly site that tracks your Pokémon Infinite Fusion 2
(Hoenn) progress: caught/seen species, current party, and PC boxes — synced
live from your save file, no install required.

## How it works

- Click **Connect Save** and pick your `File A.rxdata`.
- The browser re-checks that exact file every ~4 seconds (Chrome/Edge only —
  this uses the File System Access API, which Firefox/Safari don't support).
- When it detects a change, it re-parses the save and updates your stats.
- Everything is stored in **localStorage on your device only** — nothing is
  uploaded anywhere. Export/Import let people back up or move progress
  between browsers manually.

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
