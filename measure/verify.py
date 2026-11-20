#!/usr/bin/env python3
"""Read every recorded loop back from the two chains, then compute the latency statistics.

For each line of the loops file this fetches the three receipts and checks that:
  - the origin transaction succeeded, called Morpho, and is in the recorded block;
  - the Lasna transaction carries the watcher's SettlementRequested naming that origin transaction;
  - the settlement transaction carries the queue's Loop event naming that origin transaction, and the
    event's origin block and settled block match the receipts.

Latency is settled block minus origin block, both on Base Sepolia (0.2 s blocks). Only loops that pass every
check are counted. Loops with no settlement are reported, not dropped silently.

  python3 measure/verify.py data/loops.jsonl --out data/summary.json
"""

import argparse
import json
import math
import sys

from common import (
    BASE_RPC,
    LASNA_RPC,
    LOOP_TOPIC,
    MORPHO,
    QUEUE,
    REQUESTED_TOPIC,
    WAD,
    WATCHER,
    receipt,
    rpc,
    words,
)


def percentile(sorted_values, p):
    """Nearest-rank percentile: the smallest value with at least p% of the sample at or below it."""
    k = max(1, math.ceil(p / 100 * len(sorted_values)))
    return sorted_values[k - 1]


def describe(values):
    v = sorted(values)
    return {
        "n": len(v),
        "min": v[0],
        "median": percentile(v, 50),
        "p90": percentile(v, 90),
        "p99": percentile(v, 99),
        "max": v[-1],
        "mean": round(sum(v) / len(v), 3),
    }


def check(rec):
    """Return a list of problems for one loop; empty means it verified."""
    problems = []
    origin_tx = int(rec["origin"]["tx"], 16)

    o = receipt(BASE_RPC, rec["origin"]["tx"])
    if o is None or int(o["status"], 16) != 1:
        return ["origin transaction missing or reverted"]
    if int(o["blockNumber"], 16) != rec["origin"]["block"]:
        problems.append("origin block differs")
    if (o.get("to") or "").lower() != MORPHO.lower():
        problems.append("origin transaction is not a call to Morpho")

    if rec.get("settlement") is None:
        return problems + ["no settlement recorded"]
    s = receipt(BASE_RPC, rec["settlement"]["tx"])
    if s is None or int(s["status"], 16) != 1:
        return problems + ["settlement transaction missing or reverted"]
    loop = [l for l in s["logs"] if l["address"].lower() == QUEUE.lower() and l["topics"][0] == LOOP_TOPIC]
    loop = [l for l in loop if words(l["data"])[2] == origin_tx]
    if not loop:
        problems.append("settlement has no Loop event for this origin transaction")
    else:
        w = words(loop[0]["data"])
        if w[0] != rec["origin"]["block"]:
            problems.append("Loop.originBlock differs from the origin receipt")
        if w[1] != int(s["blockNumber"], 16) or w[1] != rec["settlement"]["block"]:
            problems.append("Loop.settledBlock differs from the settlement receipt")
        if str(w[3]) != rec["settlement"]["assetsPaid"]:
            problems.append("assets paid differ")

    if rec.get("reactive") is None:
        problems.append("no Lasna transaction recorded")
    else:
        r = receipt(LASNA_RPC, rec["reactive"]["tx"])
        if r is None or int(r["status"], 16) != 1:
            problems.append("Lasna transaction missing or reverted")
        else:
            asked = [
                l
                for l in r["logs"]
                if l["address"].lower() == WATCHER.lower()
                and l["topics"][0] == REQUESTED_TOPIC
                and words(l["data"])[1] == origin_tx
            ]
            if not asked:
                problems.append("Lasna transaction has no SettlementRequested for this origin transaction")
            if int(r["blockNumber"], 16) != rec["reactive"]["block"]:
                problems.append("Lasna block differs")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("loops")
    ap.add_argument("--out", default="data/summary.json")
    ap.add_argument("--offline", action="store_true", help="skip the chain checks, only compute")
    a = ap.parse_args()

    recs = [json.loads(line) for line in open(a.loops) if line.strip()]
    good, bad = [], []
    for rec in recs:
        problems = [] if a.offline else check(rec)
        if a.offline and rec.get("settlement") is None:
            problems = ["no settlement recorded"]
        (bad if problems else good).append((rec, problems))
        if problems:
            print(f"loop {rec['n']}: {'; '.join(problems)}", file=sys.stderr)
        elif not a.offline and rec["n"] % 20 == 0:
            print(f"verified through loop {rec['n']}", file=sys.stderr)

    summary = {
        "loopsRecorded": len(recs),
        "loopsVerified": len(good),
        "loopsNotCounted": [{"n": r["n"], "origin": r["origin"]["tx"], "problems": p} for r, p in bad],
        "checkedAgainstChain": not a.offline,
        "queue": QUEUE,
        "watcher": WATCHER,
    }

    if good:
        blocks = [r["settlement"]["block"] - r["origin"]["block"] for r, _ in good]
        ms = [r["settlement"]["timestampMs"] - r["origin"]["timestampMs"] for r, _ in good]
        summary["endToEndBlocks"] = describe(blocks)
        summary["endToEndMs"] = describe(ms)
        summary["histogramBlocks"] = {str(b): blocks.count(b) for b in sorted(set(blocks))}
        summary["byCause"] = {
            c: describe([r["settlement"]["block"] - r["origin"]["block"] for r, _ in good if r["cause"] == c])
            for c in sorted({r["cause"] for r, _ in good})
        }
        summary["settlementGas"] = describe([r["settlement"]["gasUsed"] for r, _ in good])
        summary["paidInFull"] = sum(1 for r, _ in good if r["settlement"]["assetsPaid"] == r["assets"])
        summary["assetsPaid"] = str(sum(int(r["settlement"]["assetsPaid"]) for r, _ in good) // WAD)
        summary["firstOriginBlock"] = min(r["origin"]["block"] for r, _ in good)
        summary["lastSettlementBlock"] = max(r["settlement"]["block"] for r, _ in good)

        # Lasna stamps its blocks in whole seconds, so the split into two legs is coarse. Given as measured.
        with_lasna = [r for r, _ in good if r.get("reactive")]
        if with_lasna:
            leg1 = [r["reactive"]["timestamp"] * 1000 - r["origin"]["timestampMs"] for r in with_lasna]
            leg2 = [r["settlement"]["timestampMs"] - r["reactive"]["timestamp"] * 1000 for r in with_lasna]
            summary["lasnaStampMinusOriginMs"] = describe(leg1)
            summary["settlementMinusLasnaStampMs"] = describe(leg2)

    if not a.offline:
        # The queue's own record: entry n counts callbacks that landed n blocks after their event.
        # It also counts callbacks this file did not cause (the ones a `join` or a `more` asked for).
        hist = words(rpc(BASE_RPC, "eth_call", [{"to": QUEUE, "data": "0xc1c9407e"}, "latest"]))  # lagHistogram()
        summary["onChain"] = {
            "loops": int(rpc(BASE_RPC, "eth_call", [{"to": QUEUE, "data": "0x938b9ceb"}, "latest"]), 16),
            "loopsThatPaid": int(rpc(BASE_RPC, "eth_call", [{"to": QUEUE, "data": "0xdec8064a"}, "latest"]), 16),
            "lagHistogram": {str(i): c for i, c in enumerate(hist) if c},
        }

    with open(a.out, "w") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    sys.exit(main())
