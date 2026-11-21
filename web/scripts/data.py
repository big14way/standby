#!/usr/bin/env python3
"""Write src/data.json for the page from the measured data in ../data. Run from web/: `npm run data`."""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "data")

loops = []
with open(os.path.join(DATA, "loops.jsonl")) as f:
    for line in f:
        if not line.strip():
            continue
        r = json.loads(line)
        loops.append(
            {
                "n": r["n"],
                "cause": r["cause"],
                "assets": int(r["assets"]) // 10**18,
                "lag": r["lagBlocks"],
                "originBlock": r["origin"]["block"],
                "origin": r["origin"]["tx"],
                "reactive": r["reactive"]["tx"],
                "settlement": r["settlement"]["tx"],
            }
        )

with open(os.path.join(DATA, "summary.json")) as f:
    summary = json.load(f)
with open(os.path.join(DATA, "race-summary.json")) as f:
    race = json.load(f)

out = {
    "loops": loops,
    "blocks": summary["endToEndBlocks"],
    "histogram": summary["histogramBlocks"],
    "race": {"trials": race["trials"], "counted": race["counted"], "byGap": race["byRivalGapBlocks"]},
}
with open(os.path.join(HERE, "..", "src", "data.json"), "w") as f:
    json.dump(out, f, separators=(",", ":"))
    f.write("\n")
print(f"{len(loops)} loops written")
