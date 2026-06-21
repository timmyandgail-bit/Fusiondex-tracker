import json
import os
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_GAME_DEX = r"C:\Users\Timothy\Downloads\InfiniteFusion\InfiniteFusion2\Data\pokedex\dex.json"
GAME_DEX = Path(os.environ.get("FUSION_DEX_JSON", DEFAULT_GAME_DEX))
OUT = Path(__file__).parent / "assets" / "fusiondex-data.json"


def normalize_text(value):
    return " ".join(str(value or "").replace("POKENAME", "This fusion").split())


def main():
    if not GAME_DEX.exists():
        raise SystemExit(f"Could not find dex JSON: {GAME_DEX}")

    raw = json.loads(GAME_DEX.read_text(encoding="utf-8-sig"))
    fusions = OrderedDict()

    for row in raw:
        sprite = row.get("sprite", "")
        if not sprite.endswith(".png") or "." not in sprite:
            continue
        fusion_id = sprite[:-4]
        parts = fusion_id.split(".")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            continue

        if fusion_id not in fusions:
            head, body = parts
            fusions[fusion_id] = {
                "id": fusion_id,
                "head": int(head),
                "body": int(body),
                "sort": int(head) * 1000 + int(body),
                "entry": normalize_text(row.get("entry")),
                "author": normalize_text(row.get("author")),
                "entryCount": 0,
            }
        fusions[fusion_id]["entryCount"] += 1

    payload = {
        "version": "local-if2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(GAME_DEX),
        "fusions": sorted(fusions.values(), key=lambda item: item["sort"]),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(payload['fusions'])} fusions to {OUT}")


if __name__ == "__main__":
    main()
