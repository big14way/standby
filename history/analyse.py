#!/usr/bin/env python3
"""How long does freed liquidity last in a fully borrowed Morpho Blue market?

Input: a market's full history as written by fetch.py (supply, withdraw, borrow, repay, liquidation, in
on-chain order). The market's liquidity is rebuilt event by event:

    liquidity += supply, repay, liquidation repaid
    liquidity -= withdraw, borrow

Interest moves supply and borrow totals together and does not change liquidity, so the rebuilt figure is the
loan-token balance the market could pay out. It is checked against the chain by the caller (see README).

An *episode* starts when the market is full (liquidity at or below a dust threshold) and an event puts at
least `--min-inflow` loan tokens back. For each episode this measures:

  - when the first of it was taken out again, and by what (a withdrawal or a new loan);
  - how much of it was still there at the end of the same block, and at the end of each later block.

A reactor that needs L seconds lands in block B + ceil(L / block time), B being the block of the inflow. It
is given two bounds: first in that block (it finds what was left at the end of the block before) and last in
that block (it finds what is left at the end of it).

  python3 history/analyse.py history/data/8453-0xff0f2bd5.jsonl --decimals 6 --block-time 2
"""

import argparse
import json
import math
import sys

IN = ("Supply", "Repay", "Liquidation")
OUT = ("Withdraw", "Borrow")


def amount(t):
    d = t["data"]
    if t["type"] == "Liquidation":
        return int(d["repaidAssets"])
    return int(d["assets"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("history")
    ap.add_argument("--decimals", type=int, default=6)
    ap.add_argument("--block-time", type=float, required=True, help="seconds per block on the market's chain")
    ap.add_argument("--min-inflow", type=float, default=100, help="smallest inflow that starts an episode, in tokens")
    ap.add_argument("--dust", type=float, default=1, help="liquidity at or below this is 'full', in tokens")
    ap.add_argument("--latencies", default="2,9", help="reactor latencies in seconds")
    ap.add_argument("--since", type=int, default=0, help="only episodes at or after this unix time")
    ap.add_argument("--until", type=int, default=0, help="only episodes before this unix time")
    ap.add_argument("--list", action="store_true", help="print every episode")
    ap.add_argument("--out")
    a = ap.parse_args()

    unit = 10**a.decimals
    dust = int(a.dust * unit)
    min_in = int(a.min_inflow * unit)
    txs = [json.loads(line) for line in open(a.history) if line.strip()]
    for t in txs:
        t["blockNumber"] = int(t["blockNumber"])
        t["timestamp"] = int(t["timestamp"])
    txs.sort(key=lambda t: (t["blockNumber"], t["txIndex"], t["logIndex"]))

    # Liquidity after every event, and at the end of every block that has events.
    liq = 0
    lowest = 0
    after = []
    end_of_block = {}
    for t in txs:
        x = amount(t)
        liq += x if t["type"] in IN else -x
        lowest = min(lowest, liq)
        after.append(liq)
        end_of_block[t["blockNumber"]] = liq
    blocks = sorted(end_of_block)

    def liquidity_at_end_of(block):
        """Liquidity at the end of `block`: that of the last block at or before it that had events."""
        lo, hi = 0, len(blocks) - 1
        if block < blocks[0]:
            return 0
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if blocks[mid] <= block:
                lo = mid
            else:
                hi = mid - 1
        return end_of_block[blocks[lo]]

    # For every event, the index of the next event that takes liquidity out.
    next_out = [None] * len(txs)
    nxt = None
    for i in range(len(txs) - 1, -1, -1):
        next_out[i] = nxt
        if txs[i]["type"] in OUT:
            nxt = i

    latencies = [float(x) for x in a.latencies.split(",")]
    episodes = []
    for i, t in enumerate(txs):
        if t["type"] not in IN:
            continue
        x = amount(t)
        before = after[i] - x
        if before > dust or x < min_in:
            continue
        if t["timestamp"] < a.since or (a.until and t["timestamp"] >= a.until):
            continue
        b = t["blockNumber"]
        # First event that takes liquidity out again.
        first = txs[next_out[i]] if next_out[i] is not None else None
        ep = {
            "block": b,
            "timestamp": t["timestamp"],
            "tx": t["txHash"],
            "cause": t["type"],
            "assets": x,
            "leftAtEndOfBlock": max(0, min(x, liquidity_at_end_of(b))),
        }
        if first is not None:
            ep["firstTake"] = {
                "type": first["type"],
                "blocksLater": first["blockNumber"] - b,
                "secondsLater": first["timestamp"] - t["timestamp"],
                "sameTransaction": first["txHash"] == t["txHash"],
            }
        ep["reactor"] = {}
        for L in latencies:
            k = max(1, math.ceil(L / a.block_time))
            ep["reactor"][str(L)] = {
                "landsBlocksLater": k,
                "firstInBlock": max(0, min(x, liquidity_at_end_of(b + k - 1))),
                "lastInBlock": max(0, min(x, liquidity_at_end_of(b + k))),
            }
        episodes.append(ep)

    if a.list:
        for e in episodes:
            f = e.get("firstTake")
            took = (
                f"{f['type']} {f['blocksLater']} blocks ({f['secondsLater']} s) later"
                + (", same transaction" if f["sameTransaction"] else "")
                if f
                else "not taken yet"
            )
            print(
                f"{e['timestamp']} block {e['block']} {e['cause']:11s} {e['assets'] / unit:14,.2f}  "
                f"left at end of block {e['leftAtEndOfBlock'] / unit:14,.2f}  first take: {took}  {e['tx']}",
                file=sys.stderr,
            )

    total = sum(e["assets"] for e in episodes)
    buckets = [
        ("same transaction", lambda f: f["sameTransaction"]),
        ("same block, later transaction", lambda f: not f["sameTransaction"] and f["blocksLater"] == 0),
        ("next block", lambda f: f["blocksLater"] == 1),
        ("2 to 5 blocks later", lambda f: 2 <= f["blocksLater"] <= 5),
        ("6 to 30 blocks later", lambda f: 6 <= f["blocksLater"] <= 30),
        ("more than 30 blocks later", lambda f: f["blocksLater"] > 30),
    ]
    first_take = {}
    for name, test in buckets:
        hit = [e for e in episodes if "firstTake" in e and test(e["firstTake"])]
        first_take[name] = {"episodes": len(hit), "assets": sum(e["assets"] for e in hit) / unit}
    never = [e for e in episodes if "firstTake" not in e]
    first_take["never (to the end of the data)"] = {"episodes": len(never), "assets": sum(e["assets"] for e in never) / unit}

    taken_by = {
        kind: sum(1 for e in episodes if e.get("firstTake", {}).get("type") == kind) for kind in OUT
    }

    summary = {
        "history": a.history,
        "since": a.since,
        "until": a.until,
        "transactions": len(txs),
        "firstBlock": txs[0]["blockNumber"],
        "lastBlock": txs[-1]["blockNumber"],
        "blockTimeSeconds": a.block_time,
        "rebuiltLiquidityNow": after[-1] / unit,
        "rebuiltLiquidityLowest": lowest / unit,
        "episodes": len(episodes),
        "episodeAssets": total / unit,
        "byCause": {c: sum(1 for e in episodes if e["cause"] == c) for c in IN},
        "firstTakenOutAgain": first_take,
        "firstTakenBy": taken_by,
        "leftAtEndOfTheSameBlock": {
            "episodesWithAnyLeft": sum(1 for e in episodes if e["leftAtEndOfBlock"] > dust),
            "assetsShare": round(sum(e["leftAtEndOfBlock"] for e in episodes) / total, 4) if total else None,
        },
        "reactor": {},
    }
    for L in latencies:
        key = str(L)
        rows = [e["reactor"][key] for e in episodes]
        summary["reactor"][f"{L:g} s"] = {
            "landsBlocksLater": rows[0]["landsBlocksLater"] if rows else None,
            "firstInBlock": {
                "episodesWithAnyLeft": sum(1 for r in rows if r["firstInBlock"] > dust),
                "assetsShare": round(sum(r["firstInBlock"] for r in rows) / total, 4) if total else None,
            },
            "lastInBlock": {
                "episodesWithAnyLeft": sum(1 for r in rows if r["lastInBlock"] > dust),
                "assetsShare": round(sum(r["lastInBlock"] for r in rows) / total, 4) if total else None,
            },
        }

    if a.out:
        with open(a.out, "w") as f:
            json.dump(summary, f, indent=2)
            f.write("\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    sys.exit(main())
