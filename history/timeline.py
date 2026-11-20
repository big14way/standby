#!/usr/bin/env python3
"""Month by month: events of each kind, net supply, liquidity, and the share of the month the market sat full.

  python3 history/timeline.py history/data/1-0xd9e34b1e.jsonl --decimals 6
"""

import argparse
import collections
import datetime
import gzip
import json


def month(ts):
    return datetime.datetime.fromtimestamp(ts, datetime.UTC).strftime("%Y-%m")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("history")
    ap.add_argument("--decimals", type=int, default=6)
    a = ap.parse_args()
    unit = 10**a.decimals

    opener = gzip.open if a.history.endswith(".gz") else open
    with opener(a.history, "rt") as f:
        txs = [json.loads(line) for line in f if line.strip()]
    txs.sort(key=lambda t: (int(t["blockNumber"]), t["txIndex"], t["logIndex"]))
    liq = supplied = 0
    rows = collections.OrderedDict()
    full = collections.Counter()
    span = collections.Counter()
    prev = None
    for t in txs:
        ts = int(t["timestamp"])
        if prev is not None:
            span[month(prev)] += ts - prev
            # Full: next to nothing left of a market that has real money in it.
            if supplied > 1000 * unit and liq <= max(unit, supplied // 1000):
                full[month(prev)] += ts - prev
        d = t["data"]
        x = int(d["repaidAssets"]) if t["type"] == "Liquidation" else int(d["assets"])
        liq += x if t["type"] in ("Supply", "Repay", "Liquidation") else -x
        if t["type"] == "Supply":
            supplied += x
        if t["type"] == "Withdraw":
            supplied -= x
        r = rows.setdefault(month(ts), collections.Counter())
        r[t["type"]] += 1
        r["supplied"], r["liq"] = supplied, liq
        prev = ts

    print("month    supply withdraw borrow repay liquidation   net supplied      liquidity  full")
    for m, r in rows.items():
        share = 100 * full[m] / span[m] if span[m] else 0
        print(
            f"{m}  {r['Supply']:6d} {r['Withdraw']:8d} {r['Borrow']:6d} {r['Repay']:5d} {r['Liquidation']:11d} "
            f"{r['supplied'] / unit:14,.0f} {r['liq'] / unit:14,.0f} {share:5.1f}%"
        )


if __name__ == "__main__":
    main()
