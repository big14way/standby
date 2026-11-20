#!/usr/bin/env python3
"""Run the analysis over every market in markets.json and print the table used in the README.

  python3 history/report.py            # writes history/summary.json
"""

import json
import os

from analyse import Options, analyse

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCK_BUCKETS = ["next block", "2 to 5 blocks later", "6 to 30 blocks later", "more than 30 blocks later"]
SECOND_BUCKETS = ["within 2 s", "within 12 s", "within 60 s", "within 600 s", "later than 600 s"]


def main():
    markets = json.load(open(os.path.join(HERE, "markets.json")))
    out = []
    for m in markets:
        s = analyse(Options(os.path.join(HERE, "data", m["file"]), m["blockTime"]))
        s["history"] = m["file"]
        out.append({"market": m, "summary": s})

    with open(os.path.join(HERE, "summary.json"), "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print("| Market | Chain | Events | Inflows into a full market | Gone in the same transaction | Taken in the next block | 2 to 5 blocks | 6 to 30 blocks | Later |")
    print("|---|---|---|---|---|---|---|---|---|")
    total = [0] * 7
    for o in out:
        m, s = o["market"], o["summary"]
        f = s["firstTakenOutAgain"]
        row = [s["transactions"], s["episodes"], f["same transaction"]["episodes"]] + [f[b]["episodes"] for b in BLOCK_BUCKETS]
        total = [a + b for a, b in zip(total, row)]
        print(f"| {m['name']} | {m['chain']} | " + " | ".join(f"{x:,}" for x in row) + " |")
    print("| **All five** | | " + " | ".join(f"**{x:,}**" for x in total) + " |")

    print()
    print("| First taken out again | Inflows | Share | Loan tokens |")
    print("|---|---|---|---|")
    n = sum(sum(o["summary"]["firstTakenOutAgainSeconds"][b]["episodes"] for b in SECOND_BUCKETS) for o in out)
    for b in SECOND_BUCKETS:
        e = sum(o["summary"]["firstTakenOutAgainSeconds"][b]["episodes"] for o in out)
        a = sum(o["summary"]["firstTakenOutAgainSeconds"][b]["assets"] for o in out)
        print(f"| {b} | {e:,} | {100 * e / n:.1f}% | {a:,.0f} |")

    w = sum(o["summary"]["firstTakenByAmongNotAtomic"]["Withdraw"] for o in out)
    b = sum(o["summary"]["firstTakenByAmongNotAtomic"]["Borrow"] for o in out)
    print()
    print(f"First taken by a lender withdrawing: {w:,}. By a new loan: {b:,}.")


if __name__ == "__main__":
    main()
