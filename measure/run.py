#!/usr/bin/env python3
"""Run measured loops against the deployed queue and watcher and append one JSON line per loop.

One loop:
  1. An account puts liquidity back into the fully borrowed market on Base Sepolia (a repayment, or a
     supply by a third party). That transaction is the origin event.
  2. The watcher on Reactive Lasna reacts and requests a callback (`SettlementRequested`).
  3. The callback reaches the queue on Base Sepolia, which pays the lender at the front (`Loop`).

The script records the three transaction hashes and their blocks. Nothing is timed with the local clock:
every number in the output can be read back from the chains (see verify.py).

Needs `cast` (Foundry) on the path and these environment variables:
  BORROWER_PRIVATE_KEY, BORROWER_ADDRESS    for --cause repay
  SUPPLIER_PRIVATE_KEY, SUPPLIER_ADDRESS    for --cause supply

  python3 measure/run.py --loops 200 --cause repay --out data/loops.jsonl
"""

import argparse
import json
import os
import random
import signal
import sys
import time

from common import (
    BASE_RPC,
    LASNA_RPC,
    LOOP_TOPIC,
    MARKET_ID,
    MARKET_PARAMS,
    MAX_LOG_RANGE,
    MORPHO,
    MP_TYPE,
    QUEUE,
    REQUESTED_TOPIC,
    WAD,
    WATCHER,
    base_block_ms,
    block_number,
    cast_send,
    lasna_block_s,
    receipt,
    rpc,
    words,
)

WAIT_FOR_SETTLEMENT_S = 120

# Morpho Blue's Repay and Supply events.
ORIGIN_TOPICS = (
    "0x52acb05cebbd3cd39715469f22afbf5a17496295ef3bc9bb5944056c63ccaa09",
    "0xedf8870433c83823eb071d3df1caa8d008f12f6440918c20d75a3602cda30fe0",
)

# Set by SIGTERM / SIGINT: finish and record the loop in flight, then stop.
stopping = False


def _stop(*_):
    global stopping
    stopping = True


def send_origin(cause, assets):
    if cause == "repay":
        key, who = os.environ["BORROWER_PRIVATE_KEY"], os.environ["BORROWER_ADDRESS"]
        sig = f"repay({MP_TYPE},uint256,uint256,address,bytes)"
    else:
        key, who = os.environ["SUPPLIER_PRIVATE_KEY"], os.environ["SUPPLIER_ADDRESS"]
        sig = f"supply({MP_TYPE},uint256,uint256,address,bytes)"
    return cast_send(key, MORPHO, sig, MARKET_PARAMS, assets, 0, who, "0x", gas_limit=250_000)


def find_loop(origin_tx, origin_block):
    """Poll the queue for the Loop event that names this origin transaction."""
    want = int(origin_tx, 16)
    start = origin_block
    deadline = time.time() + WAIT_FOR_SETTLEMENT_S
    while time.time() < deadline:
        head = block_number(BASE_RPC)
        frm = start
        while frm <= head:
            to = min(frm + MAX_LOG_RANGE, head)
            logs = rpc(
                BASE_RPC,
                "eth_getLogs",
                [{"address": QUEUE, "topics": [LOOP_TOPIC, MARKET_ID], "fromBlock": hex(frm), "toBlock": hex(to)}],
            )
            for log in logs:
                w = words(log["data"])  # originBlock, settledBlock, originTxHash, assetsPaid, tickets
                if w[2] == want:
                    return log, w
            frm = to + 1
        # Blocks up to `head` hold nothing for us; next round starts just before it.
        start = max(start, head - 2)
        time.sleep(0.3)
    return None, None


def find_request(origin_tx, lasna_from):
    """Find the watcher's SettlementRequested on Lasna for this origin transaction."""
    want = int(origin_tx, 16)
    for _ in range(20):
        head = block_number(LASNA_RPC)
        logs = rpc(
            LASNA_RPC,
            "eth_getLogs",
            [{"address": WATCHER, "topics": [REQUESTED_TOPIC, MARKET_ID], "fromBlock": hex(lasna_from), "toBlock": hex(head)}],
        )
        for log in logs:
            w = words(log["data"])  # originBlock, originTxHash, assets
            if w[1] == want:
                return log
        time.sleep(0.5)
    return None


def build_record(n, cause, assets, origin_tx, origin_block, lasna_from):
    """Follow one origin transaction through Lasna to its settlement and return the record."""
    rec = {
        "n": n,
        "cause": cause,
        "assets": str(assets),
        "origin": {"tx": origin_tx, "block": origin_block, "timestampMs": base_block_ms(origin_block)},
        "reactive": None,
        "settlement": None,
    }

    log, w = find_loop(origin_tx, origin_block)
    if log is not None:
        settle_block = int(log["blockNumber"], 16)
        sr = receipt(BASE_RPC, log["transactionHash"])
        rec["settlement"] = {
            "tx": log["transactionHash"],
            "block": settle_block,
            "timestampMs": base_block_ms(settle_block),
            "gasUsed": int(sr["gasUsed"], 16),
            "assetsPaid": str(w[3]),
            "tickets": w[4],
        }
        rec["lagBlocks"] = settle_block - origin_block

    req = find_request(origin_tx, lasna_from)
    if req is not None:
        lasna_block = int(req["blockNumber"], 16)
        rec["reactive"] = {
            "tx": req["transactionHash"],
            "block": lasna_block,
            "timestamp": lasna_block_s(lasna_block),
        }
    return rec


def report(rec):
    n, cause, assets = rec["n"], rec["cause"], int(rec["assets"])
    if rec["settlement"]:
        ms = rec["settlement"]["timestampMs"] - rec["origin"]["timestampMs"]
        paid = int(rec["settlement"]["assetsPaid"]) / WAD
        print(f"{n}: {cause} {assets // WAD} -> paid {paid:g} after {rec['lagBlocks']} blocks ({ms} ms)", flush=True)
    else:
        print(f"{n}: {cause} {assets // WAD} -> NO SETTLEMENT within {WAIT_FOR_SETTLEMENT_S}s ({rec['origin']['tx']})", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loops", type=int, default=0)
    ap.add_argument("--cause", choices=["repay", "supply"], default="repay")
    ap.add_argument("--out", default="data/loops.jsonl")
    ap.add_argument("--min", type=int, default=50, help="smallest amount, whole loan tokens")
    ap.add_argument("--max", type=int, default=500, help="largest amount, whole loan tokens")
    ap.add_argument("--pause-min", type=float, default=0.3)
    ap.add_argument("--pause-max", type=float, default=3.0)
    ap.add_argument(
        "--recover",
        metavar="TX",
        help="write the record for an origin transaction that was sent but not recorded (an interrupted run)",
    )
    ap.add_argument("--lasna-from", type=int, help="with --recover: Lasna block to search from")
    a = ap.parse_args()

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    done = 0
    if os.path.exists(a.out):
        with open(a.out) as f:
            done = sum(1 for line in f if line.strip())

    if a.recover:
        o = receipt(BASE_RPC, a.recover)
        # Morpho's Repay and Supply events both carry (assets, shares) as data.
        ev = [l for l in o["logs"] if l["address"].lower() == MORPHO.lower() and l["topics"][0] in ORIGIN_TOPICS]
        rec = build_record(
            done + 1, a.cause, words(ev[0]["data"])[0], a.recover, int(o["blockNumber"], 16), a.lasna_from
        )
        with open(a.out, "a") as f:
            f.write(json.dumps(rec) + "\n")
        report(rec)
        return

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    for i in range(a.loops):
        if stopping:
            print("stopped on request", flush=True)
            return 1
        n = done + i + 1
        assets = random.randint(a.min, a.max) * WAD
        lasna_from = block_number(LASNA_RPC) - 2

        r = send_origin(a.cause, assets)
        origin_tx = r["transactionHash"]
        origin_block = int(r["blockNumber"], 16)
        if int(r["status"], 16) != 1:
            print(f"{n}: origin transaction reverted {origin_tx}", flush=True)
            continue

        rec = build_record(n, a.cause, assets, origin_tx, origin_block, lasna_from)
        with open(a.out, "a") as f:
            f.write(json.dumps(rec) + "\n")
        report(rec)

        time.sleep(random.uniform(a.pause_min, a.pause_max))


if __name__ == "__main__":
    sys.exit(main())
