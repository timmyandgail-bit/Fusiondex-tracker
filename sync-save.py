import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import rmarshal

DEFAULT_SAVE = Path(os.environ.get("APPDATA", "")) / "infinitefusion-hoenn" / "File A.rxdata"
DEFAULT_OUT = Path(__file__).parent / "assets" / "owned-live.json"


def text(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return "" if value is None else str(value)


def ivar(obj, key, default=None):
    return getattr(obj, "ivars", {}).get(key, default)


def mon_record(mon, location):
    species_data = ivar(mon, "@species_data")
    species_name = text(ivar(species_data, "@real_name") or ivar(mon, "@species"))
    nickname = text(ivar(mon, "@name"))
    level = ivar(mon, "@level", "?")
    personal_id = ivar(mon, "@personalID")

    body = ivar(species_data, "@body_pokemon")
    head = ivar(species_data, "@head_pokemon")
    body_id = ivar(body, "@id_number")
    head_id = ivar(head, "@id_number")

    record = {
        "name": species_name,
        "nickname": nickname,
        "level": level,
        "location": location,
        "personalId": personal_id,
        "shiny": bool(ivar(mon, "@shiny", False)),
    }

    if body_id and head_id:
        record["fusionId"] = f"{head_id}.{body_id}"
        record["head"] = head_id
        record["body"] = body_id
    else:
        record["speciesId"] = ivar(species_data, "@id_number")

    return record


def add_live(fusions, record):
    fusion_id = record.get("fusionId")
    if not fusion_id:
        return
    item = fusions.setdefault(fusion_id, {
        "count": 0,
        "locations": [],
        "pokemon": [],
    })
    item["count"] += 1
    if record["location"] not in item["locations"]:
        item["locations"].append(record["location"])
    item["pokemon"].append(record)


def extract(save_path):
    save = rmarshal.load(Path(save_path).read_bytes())
    fusions = {}
    pokemon = []

    player = save.get("player")
    for index, mon in enumerate(ivar(player, "@party", []), start=1):
        if mon is None:
            continue
        record = mon_record(mon, f"Party {index}")
        pokemon.append(record)
        add_live(fusions, record)

    storage = save.get("storage_system")
    boxes = ivar(storage, "@boxes", [])
    for box_index, box in enumerate(boxes, start=1):
        box_name = text(ivar(box, "@name")) or f"Box {box_index}"
        for slot_index, mon in enumerate(ivar(box, "@pokemon", []), start=1):
            if mon is None:
                continue
            record = mon_record(mon, f"{box_name} Slot {slot_index}")
            pokemon.append(record)
            add_live(fusions, record)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(save_path),
        "pokemonCount": len(pokemon),
        "fusionCount": len(fusions),
        "fusions": fusions,
        "pokemon": pokemon,
    }


def write_snapshot(save_path, out_path):
    payload = extract(save_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Synced {payload['pokemonCount']} Pokemon, {payload['fusionCount']} fusions")


def main():
    parser = argparse.ArgumentParser(description="Sync Infinite Fusion party/box ownership into FusionDex Tracker.")
    parser.add_argument("--save", default=str(DEFAULT_SAVE), help="Path to File A.rxdata, File B.rxdata, etc.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output owned-live.json path.")
    parser.add_argument("--watch", action="store_true", help="Keep watching the save file and update after every save.")
    parser.add_argument("--interval", type=float, default=2.0, help="Watch polling interval in seconds.")
    args = parser.parse_args()

    save_path = Path(args.save)
    out_path = Path(args.out)
    if not save_path.exists():
        raise SystemExit(f"Save file not found: {save_path}")

    write_snapshot(save_path, out_path)
    if not args.watch:
        return

    last_mtime = save_path.stat().st_mtime
    print("Watching for save changes. Leave this window open while you play.")
    while True:
        time.sleep(args.interval)
        try:
            current = save_path.stat().st_mtime
        except FileNotFoundError:
            continue
        if current != last_mtime:
            last_mtime = current
            time.sleep(0.5)
            write_snapshot(save_path, out_path)


if __name__ == "__main__":
    main()
