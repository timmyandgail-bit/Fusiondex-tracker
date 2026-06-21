# FusionDex Tracker

A static Infinite Fusion 2 Pokédex checklist. Each visitor's Seen, Caught, and Favorite marks are saved in their own browser with `localStorage`.

## Update the dex data

Run this from the project folder after your local game updates:

```powershell
python update-data.py
```

If your game is somewhere else:

```powershell
$env:FUSION_DEX_JSON="D:\Games\InfiniteFusion2\Data\pokedex\dex.json"
python update-data.py
```

Then publish the whole `fusiondex-tracker` folder to GitHub Pages, Netlify, itch.io, or any static web host.

Players do not need the game files to use the tracker. Their progress stays in their own browser.

## Share progress

Use **Export** to download a `fusiondex-progress.json` file. Use **Import** on another browser or device to restore it.

## Live party and box tracking

### Public link mode, no commands

Open the tracker in Chrome or Edge, click **Connect Save**, and choose this folder:

```text
%APPDATA%\infinitefusion-hoenn
```

The browser will ask for permission. Once approved, the tracker reads `File A.rxdata`, marks party and box fusions as caught, and refreshes every few seconds while the page is open.

If that folder does not work, click **Pick File** and choose the save directly, such as:

```text
%APPDATA%\infinitefusion-hoenn\File A.rxdata
```

or:

```text
%APPDATA%\infinitefusion-hoenn\File B.rxdata
```

This works from a public website because the player explicitly grants access with the browser's folder picker. The site still cannot read files silently.

### Local helper mode

The easiest way is:

```powershell
python start-live-tracker.py
```

That starts the save watcher, opens the tracker in your browser, and keeps updating while you play.

You can also run only the save watcher:

```powershell
python sync-save.py --watch
```

By default it watches:

```text
%APPDATA%\infinitefusion-hoenn\File A.rxdata
```

For a different save slot:

```powershell
python sync-save.py --save "$env:APPDATA\infinitefusion-hoenn\File B.rxdata" --watch
```

The helper writes `assets/owned-live.json`. The tracker checks that file every few seconds and marks matching fusions as caught, including their party or box location.

Browsers are not allowed to read game saves directly from a public website, so live tracking requires this local helper on each player's computer.
