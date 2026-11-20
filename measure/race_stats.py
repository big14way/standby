#!/usr/bin/env python3
"""Summarise the race trials: who got the freed liquidity, by how late the rival actually was.

  python3 measure/race_stats.py data/race.jsonl --out data/race-summary.json
"""

import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("trials")
    ap.add_argument("--out", default="data/race-summary.json")
    a = ap.parse_args()

    recs = [json.loads(line) for line in open(a.trials) if line.strip()]
    counted = [r for r in recs if r["winner"] in ("queue", "rival")]
    by_gap = {}
    for r in counted:
        g = by_gap.setdefault(r["rivalGapBlocks"], {"trials": 0, "queue": 0, "rival": 0})
        g["trials"] += 1
        g[r["winner"]] += 1

    summary = {
        "trials": len(recs),
        "counted": len(counted),
        "notCounted": {w: sum(1 for r in recs if r["winner"] == w) for w in ("void", "unclear", "nobody")},
        "queueWins": sum(1 for r in counted if r["winner"] == "queue"),
        "rivalWins": sum(1 for r in counted if r["winner"] == "rival"),
        "byRivalGapBlocks": {str(g): by_gap[g] for g in sorted(by_gap)},
    }
    with open(a.out, "w") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")

    print(f"{summary['counted']} races counted of {summary['trials']} trials")
    print("| Rival landed (blocks after repayment) | Seconds | Races | Queue paid first | Rival took it |")
    print("|---|---|---|---|---|")
    for g in sorted(by_gap):
        d = by_gap[g]
        print(f"| {g} | {g * 0.2:.1f} | {d['trials']} | {d['queue']} | {d['rival']} |")


if __name__ == "__main__":
    sys.exit(main())
